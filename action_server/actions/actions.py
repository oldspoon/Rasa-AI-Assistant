"""
Rasa custom actions that read student schedules from the attendance database.
Stateless: every turn re-queries the database, so no runtime-only slots.
"""

import logging
from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
from typing import Any

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

from actions import appointments, library, schedule, support, teachers
from actions.parking import BUTTONS, arrears_message
from database import db

logger = logging.getLogger(__name__)


def _fetch_student(first_name: str, last_name: str) -> dict | None:
    """Look up a student by first and last name. None if there is no such student.

    Database errors propagate, so callers can tell "not found" from "unavailable".
    """
    sql = """
        SELECT *
        FROM   attendance
        WHERE  LOWER(first_name) = LOWER(?)
          AND  LOWER(last_name)  = LOWER(?)
        LIMIT  1
    """
    return db.fetch_one(sql, (first_name.strip(), last_name.strip()))


def _fetch_sessions(first_name: str, last_name: str) -> list:
    """The student's weekly sessions with their teacher, Lecture first. Database errors propagate."""
    sql = """
        SELECT a.*, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
               t.discipline AS teacher_discipline, t.campus AS teacher_campus,
               t.office_room AS teacher_office_room, t.email AS teacher_email,
               t.phone AS teacher_phone
        FROM   attendance a
        JOIN   teachers t ON t.id = a.teacher_id
        WHERE  LOWER(a.first_name) = LOWER(?)
          AND  LOWER(a.last_name)  = LOWER(?)
        ORDER  BY a.session_type
    """
    return db.fetch_all(sql, (first_name.strip(), last_name.strip()))


def _fetch_office_hours(teacher_id: int) -> list:
    """A teacher's free office hours, Monday first."""
    sql = """
        SELECT day_of_week, start_time, end_time
        FROM   teacher_office_hours
        WHERE  teacher_id = ?
        ORDER  BY CASE day_of_week
                      WHEN 'Monday' THEN 1
                      WHEN 'Tuesday' THEN 2
                      WHEN 'Wednesday' THEN 3
                      WHEN 'Thursday' THEN 4
                      WHEN 'Friday' THEN 5
                  END,
                  start_time
    """
    return db.fetch_all(sql, (teacher_id,))


def _fetch_bookings(teacher_id: int, day: str) -> list:
    """Appointments already booked with a teacher on one day."""
    sql = """
        SELECT first_name, last_name, day_of_week, start_time, end_time
        FROM   teacher_bookings
        WHERE  teacher_id = ? AND day_of_week = ?
        ORDER  BY start_time
    """
    return db.fetch_all(sql, (teacher_id, day))


def _fetch_libraries() -> list:
    sql = """
        SELECT campus, name, location, room, opening_hours
        FROM   libraries
        ORDER  BY id
    """
    return db.fetch_all(sql)


def _fetch_books(discipline: str) -> list:
    sql = """
        SELECT id, number, title, author
        FROM   books
        WHERE  discipline = ?
        ORDER  BY number
    """
    return db.fetch_all(sql, (discipline,))


def _fetch_loans(first_name: str, last_name: str) -> list:
    """The student's loans that have not been handed back, soonest due first."""
    sql = """
        SELECT l.book_id, l.campus, l.format, l.pickup_code, l.borrowed_on, l.due_on,
               l.returned_on, b.title, b.author, b.number,
               lib.name AS library_name, lib.room AS library_room
        FROM   book_loans l
        JOIN   books b ON b.id = l.book_id
        JOIN   libraries lib ON lib.campus = l.campus
        WHERE  LOWER(l.first_name) = LOWER(?)
          AND  LOWER(l.last_name)  = LOWER(?)
          AND  l.returned_on IS NULL
        ORDER  BY l.due_on
    """
    return db.fetch_all(sql, (first_name.strip(), last_name.strip()))


def _fetch_support_lectures(discipline: str) -> list:
    sql = """
        SELECT s.id, s.discipline, s.number, s.topic, s.campus, s.day_of_week,
               s.start_time, s.end_time, s.room, s.capacity,
               a.first_name AS assistant_first_name, a.last_name AS assistant_last_name,
               a.email AS assistant_email
        FROM   support_lectures s
        JOIN   lab_assistants a ON a.id = s.lab_assistant_id
        WHERE  s.discipline = ?
        ORDER  BY s.number
    """
    return db.fetch_all(sql, (discipline,))


def _fetch_support_bookings(discipline: str, since: str) -> list:
    sql = """
        SELECT b.support_lecture_id, b.first_name, b.last_name, b.session_date
        FROM   support_bookings b
        JOIN   support_lectures s ON s.id = b.support_lecture_id
        WHERE  s.discipline = ? AND b.session_date >= ?
    """
    return db.fetch_all(sql, (discipline, since))


def _fetch_my_support_lectures(first_name: str, last_name: str, since: str) -> list:
    sql = """
        SELECT b.session_date, s.topic, s.campus, s.day_of_week, s.start_time, s.end_time,
               s.room, a.first_name AS assistant_first_name,
               a.last_name AS assistant_last_name, a.email AS assistant_email
        FROM   support_bookings b
        JOIN   support_lectures s ON s.id = b.support_lecture_id
        JOIN   lab_assistants a ON a.id = s.lab_assistant_id
        WHERE  LOWER(b.first_name) = LOWER(?)
          AND  LOWER(b.last_name)  = LOWER(?)
          AND  b.session_date >= ?
        ORDER  BY b.session_date, s.start_time
    """
    return db.fetch_all(sql, (first_name.strip(), last_name.strip(), since))


def _fetch_my_teacher_bookings(teacher_id: int, first_name: str, last_name: str) -> list:
    sql = """
        SELECT day_of_week, start_time, end_time
        FROM   teacher_bookings
        WHERE  teacher_id = ?
          AND  LOWER(first_name) = LOWER(?)
          AND  LOWER(last_name)  = LOWER(?)
        ORDER  BY start_time
    """
    return db.fetch_all(sql, (teacher_id, first_name.strip(), last_name.strip()))


def _fetch_pickup_codes() -> set:
    rows = db.fetch_all("SELECT pickup_code FROM book_loans WHERE pickup_code IS NOT NULL")
    return {row["pickup_code"] for row in rows}


def _fetch_parking_arrears(first_name: str, last_name: str) -> list:
    """Unpaid charges, only on the campus the student attends. Database errors propagate."""
    sql = """
        SELECT p.campus, p.location, p.license_plate, p.issued_at, p.fine_pence
        FROM parking_arrears p
        WHERE p.first_name = ? AND p.last_name = ?
          AND EXISTS (
              SELECT 1 FROM attendance a
              WHERE a.first_name = p.first_name
                AND a.last_name = p.last_name
                AND a.campus = p.campus
          )
        ORDER BY p.issued_at
    """
    return db.fetch_all(sql, (first_name, last_name))


def _signed_in_name(tracker: Tracker) -> tuple[str, str] | None:
    """The student the chat channel verified by login token, if any."""
    metadata = (tracker.latest_message or {}).get("metadata") or {}
    student = metadata.get("student") or {}
    first, last = student.get("first_name"), student.get("last_name")
    return (first, last) if first and last else None


def _typed_name(tracker: Tracker) -> tuple[str, str]:
    """Name the user typed in the latest message."""
    names = {"first_name": "", "last_name": ""}
    for ent in (tracker.latest_message or {}).get("entities", []) or []:
        if ent.get("entity") in names:
            names[ent["entity"]] = ent.get("value") or ""
    return names["first_name"], names["last_name"]


def _entity_value(latest_message: dict, name: str) -> str | None:
    """Value of one entity in the latest message."""
    for ent in latest_message.get("entities") or []:
        if ent.get("entity") == name:
            return ent.get("value")
    return None


def _get_full_name(tracker: Tracker) -> tuple[str, str]:
    """The signed-in student, else the name from slots or the latest message entities."""
    signed_in = _signed_in_name(tracker)
    if signed_in:
        return signed_in

    first = tracker.get_slot("first_name") or ""
    last = tracker.get_slot("last_name") or ""
    if first and last:
        return first, last

    typed_first, typed_last = _typed_name(tracker)
    return typed_first or first, typed_last or last


def _find_student(
    dispatcher: CollectingDispatcher, first: str, last: str
) -> dict | None:
    """The student row, or None after saying they are unknown or the records are down."""
    try:
        row = _fetch_student(first, last)
    except Exception:
        logger.exception("Database error while looking up a student")
        dispatcher.utter_message(response="utter_records_unavailable")
        return None

    if row is None:
        dispatcher.utter_message(
            response="utter_student_not_found",
            first_name=first,
            last_name=last,
        )
    return row


def _student_or_error(
    dispatcher: CollectingDispatcher, tracker: Tracker
) -> dict | None:
    """Return the student row, or None after telling the user why."""
    first, last = _get_full_name(tracker)

    if not first or not last:
        dispatcher.utter_message(response="utter_no_student_loaded")
        return None

    return _find_student(dispatcher, first, last)


def _sessions_or_error(
    dispatcher: CollectingDispatcher, tracker: Tracker
) -> tuple[dict, list] | None:
    """Return (student, weekly sessions), or None after telling the user why."""
    student = _student_or_error(dispatcher, tracker)
    if student is None:
        return None

    try:
        sessions = _fetch_sessions(student["first_name"], student["last_name"])
    except Exception:
        logger.exception("Database error while reading a weekly schedule")
        dispatcher.utter_message(response="utter_records_unavailable")
        return None

    if {s["session_type"] for s in sessions} != set(schedule.KINDS):
        logger.error("Incomplete weekly schedule for %s", student["first_name"])
        dispatcher.utter_message(
            response="utter_schedule_incomplete",
            first_name=student["first_name"],
        )
        return None

    return student, sessions


def _teacher_context(
    dispatcher: CollectingDispatcher, tracker: Tracker
) -> tuple[dict, list, dict, list] | None:
    """(student, sessions, teacher, office hours), or None after explaining why not."""
    found = _sessions_or_error(dispatcher, tracker)
    if found is None:
        return None
    student, sessions = found

    try:
        teacher = teachers.teacher_of(sessions)
    except KeyError:
        logger.exception("Session rows are missing their teacher columns")
        dispatcher.utter_message(response="utter_records_unavailable")
        return None

    try:
        hours = _fetch_office_hours(teacher["id"])
    except Exception:
        logger.exception("Database error while reading office hours")
        dispatcher.utter_message(response="utter_records_unavailable")
        return None

    if not hours:
        dispatcher.utter_message(
            response="utter_office_hours_unavailable",
            teacher_name=teachers.teacher_name(teacher),
        )
        return None

    return student, sessions, teacher, hours


def _log_turn(tracker: Tracker, action_name: str) -> None:
    """Log one line per action, keyed by conversation UUID. Replay chats with rasa/show_conversation.py."""
    latest = tracker.latest_message or {}
    intent = latest.get("intent") or {}
    confidence = intent.get("confidence")
    slots = {
        key: value
        for key, value in (tracker.slots or {}).items()
        if value is not None
    }
    logger.info(
        "conversation=%s action=%s intent=%s confidence=%s user=%r slots=%s",
        tracker.sender_id,
        action_name,
        intent.get("name") or "-",
        f"{confidence:.2f}" if isinstance(confidence, (int, float)) else "-",
        latest.get("text"),
        slots or "-",
    )


class ActionLookupStudent(Action):
    """Confirm a student who introduced themselves by name."""

    def name(self) -> str:
        return "action_lookup_student"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        first_name, last_name = _get_full_name(tracker)

        if not first_name or not last_name:
            dispatcher.utter_message(response="utter_ask_name")
            return []

        if _signed_in_name(tracker):
            typed_first, typed_last = _typed_name(tracker)
            if (typed_first and typed_first.lower() != first_name.lower()) or (
                typed_last and typed_last.lower() != last_name.lower()
            ):
                dispatcher.utter_message(
                    text=(
                        f"You are signed in as {first_name} {last_name}, so I can "
                        f"only show your own schedule."
                    )
                )
                return [SlotSet("first_name", first_name), SlotSet("last_name", last_name)]

        logger.info("Looking up student: %s %s", first_name, last_name)
        row = _find_student(dispatcher, first_name, last_name)
        if row is None:
            return []

        dispatcher.utter_message(
            response="utter_student_found",
            first_name=row["first_name"],
            last_name=row["last_name"],
        )

        # Use the database spelling, so slots match the stories.
        return [
            SlotSet("first_name", row["first_name"]),
            SlotSet("last_name", row["last_name"]),
        ]


class ScheduleAnswer(Action, ABC):
    """Answer one question about the signed-in student's weekly schedule."""

    action_name: str

    def name(self) -> str:
        return self.action_name

    @abstractmethod
    def message(self, student: dict, sessions: list) -> str: ...

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []

        dispatcher.utter_message(text=self.message(*found))
        return []


class ActionAnswerLectureDays(ScheduleAnswer):
    action_name = "action_answer_lecture_days"

    def message(self, student, sessions):
        return schedule.session_day_message(
            student["first_name"], schedule.session_of(sessions, "Lecture")
        )


class ActionAnswerPracticalDays(ScheduleAnswer):
    action_name = "action_answer_practical_days"

    def message(self, student, sessions):
        return schedule.session_day_message(
            student["first_name"], schedule.session_of(sessions, "Practical")
        )


class ActionAnswerCampus(ScheduleAnswer):
    action_name = "action_answer_campus"

    def message(self, student, sessions):
        return schedule.campus_message(student["first_name"], sessions)


class ActionAnswerTime(ScheduleAnswer):
    action_name = "action_answer_time"

    def message(self, student, sessions):
        return schedule.time_message(student["first_name"], sessions)


class ActionAnswerSubject(ScheduleAnswer):
    action_name = "action_answer_subject"

    def message(self, student, sessions):
        return schedule.subject_message(student["first_name"], sessions)


class ActionAnswerRoom(ScheduleAnswer):
    action_name = "action_answer_room"

    def message(self, student, sessions):
        return schedule.room_message(student["first_name"], sessions)


class ActionAnswerAllDetails(ScheduleAnswer):
    action_name = "action_answer_all_details"

    def message(self, student, sessions):
        return "\n\n".join(
            schedule.full_schedule_parts(student["first_name"], student["last_name"], sessions)
        )


class ActionAnswerTeacher(ScheduleAnswer):
    action_name = "action_answer_teacher"

    def message(self, student, sessions):
        return teachers.teacher_message(student["first_name"], sessions)


class ActionAnswerTeacherOffice(ScheduleAnswer):
    action_name = "action_answer_teacher_office"

    def message(self, student, sessions):
        return teachers.office_message(student["first_name"], sessions)


class ActionAnswerTeacherContact(ScheduleAnswer):
    action_name = "action_answer_teacher_contact"

    def message(self, student, sessions):
        return teachers.contact_message(student["first_name"], sessions)


class ActionAnswerLibraryLocation(Action):
    """Say where the library is on each campus."""

    def name(self) -> str:
        return "action_answer_library_location"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        try:
            libraries = _fetch_libraries()
        except Exception:
            logger.exception("Database error while reading the libraries")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        dispatcher.utter_message(
            text=library.libraries_message(libraries),
            buttons=[{"title": "Recommend books", "payload": library.SHOW_BOOKS}],
        )
        return []


class ActionSuggestBooks(Action):
    """Offer five books for the student's subject, each with a Borrow button."""

    def name(self) -> str:
        return "action_suggest_books"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found

        try:
            books = _fetch_books(sessions[0]["activity"])
        except Exception:
            logger.exception("Database error while reading the books")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        dispatcher.utter_message(
            text=library.books_message(student["first_name"], sessions[0]["activity"], books),
            buttons=library.books_buttons(books),
        )
        return []


class ActionBorrowBook(Action):
    """Borrow a book digitally, or reserve it for collection with a code and receipt."""

    def name(self) -> str:
        return "action_borrow_book"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found
        first = student["first_name"]
        discipline = sessions[0]["activity"]

        latest = tracker.latest_message or {}
        text = latest.get("text") or ""
        number = library.normalise_book(_entity_value(latest, "book")) or library.parse_book(text)
        kind = library.normalise_format(_entity_value(latest, "format")) or library.normalise_format(text)

        try:
            books = _fetch_books(discipline)
        except Exception:
            logger.exception("Database error while reading the books")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        if number is None:
            dispatcher.utter_message(
                text=library.books_message(first, discipline, books),
                buttons=library.books_buttons(books),
            )
            return []

        book = next((b for b in books if b["number"] == number), None)
        if book is None:
            dispatcher.utter_message(text=library.unknown_book(first))
            return []

        if kind is None:
            dispatcher.utter_message(
                text=library.format_prompt(first, book),
                buttons=library.format_buttons(number),
            )
            return []

        today = date.today()
        try:
            loans = library.current_loans(
                _fetch_loans(student["first_name"], student["last_name"]), today
            )
            if any(loan["book_id"] == book["id"] for loan in loans):
                dispatcher.utter_message(text=library.already_borrowed(first, book))
                return []

            campus = sessions[0]["campus"]
            code = None
            if kind == library.IN_PERSON:
                code = library.new_pickup_code(campus, _fetch_pickup_codes())
            db.execute(
                """
                INSERT INTO book_loans
                    (book_id, first_name, last_name, campus, format, pickup_code,
                     borrowed_on, due_on)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    book["id"],
                    student["first_name"],
                    student["last_name"],
                    campus,
                    kind,
                    code,
                    today.isoformat(),
                    library.due_date(today).isoformat(),
                ),
            )
            libraries = [lib for lib in _fetch_libraries() if lib["campus"] == campus]
        except Exception:
            logger.exception("Database error while borrowing a book")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        if kind == library.DIGITAL:
            dispatcher.utter_message(
                text=library.digital_confirmation(first, book, library.due_date(today))
            )
        else:
            dispatcher.utter_message(
                text=library.receipt(
                    first, book, libraries[0], code, today, library.due_date(today)
                )
            )
        return []


class ActionCheckBorrowedBooks(Action):
    """List borrowed books and any late fines."""

    def name(self) -> str:
        return "action_check_borrowed_books"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        student = _student_or_error(dispatcher, tracker)
        if student is None:
            return []

        today = date.today()
        try:
            loans = library.current_loans(
                _fetch_loans(student["first_name"], student["last_name"]), today
            )
        except Exception:
            logger.exception("Database error while reading borrowed books")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        dispatcher.utter_message(
            text=library.loans_message(student["first_name"], loans, today),
            buttons=library.loans_buttons(loans, today),
        )
        return []


def _appointments_for(
    dispatcher: CollectingDispatcher, tracker: Tracker
) -> tuple[dict, list, dict, list, list] | None:
    """(student, sessions, teacher, teacher visits, support bookings), or None after explaining why not."""
    found = _sessions_or_error(dispatcher, tracker)
    if found is None:
        return None
    student, sessions = found

    try:
        teacher = teachers.teacher_of(sessions)
        visits = _fetch_my_teacher_bookings(
            teacher["id"], student["first_name"], student["last_name"]
        )
        support_rows = _fetch_my_support_lectures(
            student["first_name"], student["last_name"], date.today().isoformat()
        )
    except Exception:
        logger.exception("Database error while reading appointments")
        dispatcher.utter_message(response="utter_records_unavailable")
        return None

    return student, sessions, teacher, visits, support_rows


class ActionListAppointments(Action):
    """List the teacher visits and lab assistant support lectures the student has booked."""

    def name(self) -> str:
        return "action_list_appointments"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        context = _appointments_for(dispatcher, tracker)
        if context is None:
            return []
        student, _sessions, teacher, visits, support_rows = context

        dispatcher.utter_message(
            text=appointments.appointments_message(
                student["first_name"], teacher, visits, support_rows
            ),
            buttons=appointments.appointments_buttons(visits, support_rows),
        )
        return []


class ActionShowTimetable(Action):
    """Show the lecture, the practical and every appointment slot."""

    def name(self) -> str:
        return "action_show_timetable"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        context = _appointments_for(dispatcher, tracker)
        if context is None:
            return []
        student, sessions, _teacher, visits, support_rows = context

        dispatcher.utter_message(
            text=appointments.timetable_message(
                student["first_name"], student["last_name"], sessions, visits, support_rows
            ),
            buttons=appointments.appointments_buttons(visits, support_rows),
        )
        return []


class ActionListSupportLectures(Action):
    """Show the extra support lectures for the student's programme."""

    def name(self) -> str:
        return "action_list_support_lectures"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found
        discipline = sessions[0]["activity"]
        today = date.today()

        try:
            lectures = _fetch_support_lectures(discipline)
            bookings = _fetch_support_bookings(discipline, today.isoformat())
        except Exception:
            logger.exception("Database error while reading support lectures")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        dispatcher.utter_message(
            text=support.sessions_message(student["first_name"], discipline, lectures, bookings, today),
            buttons=support.sessions_buttons(lectures),
        )
        return []


class ActionBookSupportLecture(Action):
    """Book a seat in the next occurrence of a support lecture."""

    def name(self) -> str:
        return "action_book_support_lecture"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found
        first = student["first_name"]
        discipline = sessions[0]["activity"]
        today = date.today()

        latest = tracker.latest_message or {}
        number = support.normalise_session(_entity_value(latest, "session")) or support.parse_session(
            latest.get("text")
        )

        try:
            lectures = _fetch_support_lectures(discipline)
            bookings = _fetch_support_bookings(discipline, today.isoformat())
        except Exception:
            logger.exception("Database error while reading support lectures")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        if number is None:
            dispatcher.utter_message(
                text=support.sessions_message(first, discipline, lectures, bookings, today),
                buttons=support.sessions_buttons(lectures),
            )
            return []

        lecture = next((s for s in lectures if s["number"] == number), None)
        if lecture is None:
            dispatcher.utter_message(text=support.unknown_message(first, len(lectures)))
            return []

        result = support.decide(lecture, sessions, bookings, student, today)
        if result == "already":
            dispatcher.utter_message(text=support.already_booked(first, lecture))
            return []
        if result == "full":
            dispatcher.utter_message(text=support.full_message(first, lecture))
            return []
        if result[0] == "clash":
            dispatcher.utter_message(text=support.clash_message(first, lecture, result[1]))
            return []

        when = result[1]
        try:
            db.execute(
                """
                INSERT INTO support_bookings
                    (support_lecture_id, first_name, last_name, session_date, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    lecture["id"],
                    student["first_name"],
                    student["last_name"],
                    when.isoformat(),
                    datetime.now(timezone.utc).isoformat(timespec="seconds"),
                ),
            )
        except Exception:
            logger.exception("Database error while booking a support lecture")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        dispatcher.utter_message(text=support.confirmation(first, lecture, when))
        return []


class ActionCheckSupportBookings(Action):
    """List the student's upcoming support lectures."""

    def name(self) -> str:
        return "action_check_support_bookings"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        student = _student_or_error(dispatcher, tracker)
        if student is None:
            return []
        today = date.today()

        try:
            rows = _fetch_my_support_lectures(
                student["first_name"], student["last_name"], today.isoformat()
            )
        except Exception:
            logger.exception("Database error while reading support bookings")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        dispatcher.utter_message(
            text=support.mine_message(student["first_name"], rows, today),
            buttons=support.mine_buttons(),
        )
        return []


class ActionAnswerTeacherHours(Action):
    """List the teacher's free office hours and invite a booking."""

    def name(self) -> str:
        return "action_answer_teacher_hours"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        context = _teacher_context(dispatcher, tracker)
        if context is None:
            return []
        student, sessions, _teacher, hours = context

        dispatcher.utter_message(
            text=teachers.hours_message(student["first_name"], sessions, hours)
        )
        return []


class ActionBookTeacherSlot(Action):
    """Book a 30-minute office-hour slot, asking for a day/time when missing."""

    def name(self) -> str:
        return "action_book_teacher_slot"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        context = _teacher_context(dispatcher, tracker)
        if context is None:
            return []
        student, sessions, teacher, hours = context
        first = student["first_name"]

        latest = tracker.latest_message or {}
        text = latest.get("text") or ""
        day = teachers.normalise_day(_entity_value(latest, "day")) or teachers.parse_day(text)
        start = teachers.normalise_time(_entity_value(latest, "time")) or teachers.parse_time(text)

        if not day or not start:
            dispatcher.utter_message(
                text=teachers.booking_prompt(first, sessions, hours)
            )
            return []

        try:
            bookings = _fetch_bookings(teacher["id"], day)
        except Exception:
            logger.exception("Database error while reading teacher bookings")
            dispatcher.utter_message(response="utter_records_unavailable")
            return []

        result = teachers.validate_slot(day, start, hours, bookings)
        if isinstance(result, str):
            if result == "taken":
                end = teachers.add_minutes(start, teachers.SLOT_MINUTES)
                mine = next(
                    (
                        b for b in bookings
                        if b["start_time"] == start
                        and b["first_name"].lower() == student["first_name"].lower()
                        and b["last_name"].lower() == student["last_name"].lower()
                    ),
                    None,
                )
                if mine is not None:
                    dispatcher.utter_message(
                        text=teachers.already_booked_message(first, sessions, day, start, end)
                    )
                    return []
            dispatcher.utter_message(
                text=teachers.booking_error(result, first, sessions, hours, day, bookings)
            )
            return []

        start_time, end_time = result

        try:
            db.execute(
                """
                INSERT INTO teacher_bookings
                    (teacher_id, first_name, last_name, day_of_week,
                     start_time, end_time, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    teacher["id"],
                    student["first_name"],
                    student["last_name"],
                    day,
                    start_time,
                    end_time,
                    datetime.now(timezone.utc).isoformat(timespec="seconds"),
                ),
            )
        except Exception:
            logger.exception("Database error while booking an office hour")
            dispatcher.utter_message(
                text=teachers.booking_error("taken", first, sessions, hours, day, bookings)
            )
            return []

        dispatcher.utter_message(
            text=teachers.booking_confirmation(first, sessions, day, start_time, end_time)
        )
        return []


class ActionCheckParkingArrears(Action):
    """Tell the student about unpaid parking charges and offer ways to pay."""

    def name(self) -> str:
        return "action_check_parking_arrears"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: dict[str, Any],
    ) -> list[dict[str, Any]]:
        _log_turn(tracker, self.name())

        student = _student_or_error(dispatcher, tracker)
        if student is None:
            return []

        try:
            rows = _fetch_parking_arrears(student["first_name"], student["last_name"])
        except Exception:
            logger.exception("Database error while reading parking arrears")
            dispatcher.utter_message(response="utter_parking_unavailable")
            return []

        dispatcher.utter_message(
            text=arrears_message(student["first_name"], rows),
            buttons=BUTTONS if rows else None,
        )
        return []
