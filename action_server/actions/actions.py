"""
Rasa custom actions that read student schedules from the attendance database.
Stateless: every turn re-queries the database, so no runtime-only slots.
"""

import logging
from typing import Any, Text, Dict, List

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

from actions import schedule
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
    """The student's weekly sessions, Lecture first. Database errors propagate."""
    sql = """
        SELECT *
        FROM   attendance
        WHERE  LOWER(first_name) = LOWER(?)
          AND  LOWER(last_name)  = LOWER(?)
        ORDER  BY session_type
    """
    return db.fetch_all(sql, (first_name.strip(), last_name.strip()))


def _fetch_parking_arrears(first_name: str, last_name: str) -> list | None:
    """Unpaid charges, only on the campus the student attends. None if the database fails."""
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
    try:
        return db.fetch_all(sql, (first_name, last_name))
    except Exception as exc:
        logger.error("Database error in _fetch_parking_arrears: %s", exc)
        return None


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


def _get_full_name(tracker: Tracker) -> tuple[str, str]:
    """The signed-in student, else the name from slots or the latest message entities."""
    signed_in = _signed_in_name(tracker)
    if signed_in:
        return signed_in

    first = tracker.get_slot("first_name") or ""
    last  = tracker.get_slot("last_name")  or ""

    if not first or not last:
        for ent in tracker.latest_message.get("entities", []) or []:
            if ent.get("entity") == "first_name":
                first = ent.get("value") or first
            elif ent.get("entity") == "last_name":
                last = ent.get("value") or last

    return first, last


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

    def name(self) -> Text:
        return "action_lookup_student"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

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


class ActionAnswerLectureDays(Action):

    def name(self) -> Text:
        return "action_answer_lecture_days"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found

        dispatcher.utter_message(
            text=schedule.session_day_message(
                student["first_name"], schedule.session_of(sessions, "Lecture")
            )
        )
        return []


class ActionAnswerPracticalDays(Action):

    def name(self) -> Text:
        return "action_answer_practical_days"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found

        dispatcher.utter_message(
            text=schedule.session_day_message(
                student["first_name"], schedule.session_of(sessions, "Practical")
            )
        )
        return []


class ActionAnswerCampus(Action):

    def name(self) -> Text:
        return "action_answer_campus"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found

        dispatcher.utter_message(
            text=schedule.campus_message(student["first_name"], sessions)
        )
        return []


class ActionAnswerTime(Action):

    def name(self) -> Text:
        return "action_answer_time"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found

        dispatcher.utter_message(
            text=schedule.time_message(student["first_name"], sessions)
        )
        return []


class ActionAnswerSubject(Action):

    def name(self) -> Text:
        return "action_answer_subject"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found

        dispatcher.utter_message(
            text=schedule.subject_message(student["first_name"], sessions)
        )
        return []


class ActionAnswerRoom(Action):

    def name(self) -> Text:
        return "action_answer_room"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found

        dispatcher.utter_message(
            text=schedule.room_message(student["first_name"], sessions)
        )
        return []


class ActionAnswerAllDetails(Action):

    def name(self) -> Text:
        return "action_answer_all_details"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        _log_turn(tracker, self.name())

        found = _sessions_or_error(dispatcher, tracker)
        if found is None:
            return []
        student, sessions = found

        parts = schedule.full_schedule_parts(
            student["first_name"], student["last_name"], sessions
        )
        dispatcher.utter_message(text="\n\n".join(parts))
        return []


class ActionCheckParkingArrears(Action):
    """Tell the student about unpaid parking charges and offer ways to pay."""

    def name(self) -> Text:
        return "action_check_parking_arrears"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        _log_turn(tracker, self.name())

        student = _student_or_error(dispatcher, tracker)
        if student is None:
            return []

        rows = _fetch_parking_arrears(student["first_name"], student["last_name"])
        if rows is None:
            dispatcher.utter_message(response="utter_parking_unavailable")
            return []

        dispatcher.utter_message(
            text=arrears_message(student["first_name"], rows),
            buttons=BUTTONS if rows else None,
        )
        return []
