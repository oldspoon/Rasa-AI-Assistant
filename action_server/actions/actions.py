"""
Rasa custom actions that read student schedules from the attendance database.
Stateless: every turn re-queries the database, so no runtime-only slots.
"""

import logging
from typing import Any, Text, Dict, List

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

from actions.parking import BUTTONS, arrears_message
from database import db

logger = logging.getLogger(__name__)


def _fetch_student(first_name: str, last_name: str) -> dict | None:
    """Look up a student by first and last name."""
    sql = """
        SELECT *
        FROM   attendance
        WHERE  LOWER(first_name) = LOWER(?)
          AND  LOWER(last_name)  = LOWER(?)
        LIMIT  1
    """
    try:
        return db.fetch_one(sql, (first_name.strip(), last_name.strip()))
    except Exception as exc:
        logger.error("Database error in _fetch_student: %s", exc)
        return None


def _fetch_parking_arrears(first_name: str, last_name: str) -> list | None:
    """Unpaid charges, only on the campus the student attends. None if the database fails."""
    sql = """
        SELECT p.campus, p.location, p.license_plate, p.issued_at, p.fine_pence
        FROM parking_arrears p
        JOIN attendance a
          ON a.first_name = p.first_name
         AND a.last_name = p.last_name
         AND a.campus = p.campus
        WHERE p.first_name = ? AND p.last_name = ?
        ORDER BY p.issued_at
    """
    try:
        return db.fetch_all(sql, (first_name, last_name))
    except Exception as exc:
        logger.error("Database error in _fetch_parking_arrears: %s", exc)
        return None


def _get_full_name(tracker: Tracker) -> tuple[str, str]:
    """Name from slots, else from the latest message entities."""
    first = tracker.get_slot("first_name") or ""
    last  = tracker.get_slot("last_name")  or ""

    if not first or not last:
        for ent in tracker.latest_message.get("entities", []) or []:
            if ent.get("entity") == "first_name":
                first = ent.get("value") or first
            elif ent.get("entity") == "last_name":
                last = ent.get("value") or last

    return first, last


def _student_or_error(
    dispatcher: CollectingDispatcher, tracker: Tracker
) -> dict | None:
    """Return the student row, or None after telling the user why."""
    first, last = _get_full_name(tracker)

    if not first or not last:
        dispatcher.utter_message(response="utter_no_student_loaded")
        return None

    row = _fetch_student(first, last)
    if row is None:
        dispatcher.utter_message(
            response="utter_student_not_found",
            first_name=first,
            last_name=last,
        )
        return None

    return row


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

        logger.info("Looking up student: %s %s", first_name, last_name)
        row = _fetch_student(first_name, last_name)

        if row is None:
            dispatcher.utter_message(
                response="utter_student_not_found",
                first_name=first_name,
                last_name=last_name,
            )
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

        row = _student_or_error(dispatcher, tracker)
        if row is None:
            return []

        first = row["first_name"]
        day   = row["day_of_week"]

        if row["session_type"].lower() == "lecture":
            dispatcher.utter_message(
                text=(
                    f"Hi {first}! You have a **Lecture** session on "
                    f"**{day}**. Would you like to know more details such "
                    f"as your campus, time, subject, or room?"
                )
            )
        else:
            dispatcher.utter_message(
                text=(
                    f"Hi {first}! You do not have any lecture sessions "
                    f"registered — your session on **{day}** is a "
                    f"**{row['session_type']}** session. "
                    f"Ask me about your practical days if you'd like."
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

        row = _student_or_error(dispatcher, tracker)
        if row is None:
            return []

        first = row["first_name"]
        day   = row["day_of_week"]

        if row["session_type"].lower() == "practical":
            dispatcher.utter_message(
                text=(
                    f"Hi {first}! You have a **Practical** session on "
                    f"**{day}**. Would you like to know more details such "
                    f"as your campus, time, subject, or room?"
                )
            )
        else:
            dispatcher.utter_message(
                text=(
                    f"Hi {first}! You do not have any practical sessions "
                    f"registered — your session on **{day}** is a "
                    f"**{row['session_type']}** session. "
                    f"Ask me about your lecture days if you'd like."
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

        row = _student_or_error(dispatcher, tracker)
        if row is None:
            return []

        dispatcher.utter_message(
            text=(
                f"{row['first_name']}, your session on **{row['day_of_week']}** "
                f"takes place at the **{row['campus']}** campus."
            )
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

        row = _student_or_error(dispatcher, tracker)
        if row is None:
            return []

        dispatcher.utter_message(
            text=(
                f"{row['first_name']}, your **{row['session_type']}** session "
                f"on **{row['day_of_week']}** runs from **{row['time_range']}**."
            )
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

        row = _student_or_error(dispatcher, tracker)
        if row is None:
            return []

        dispatcher.utter_message(
            text=(
                f"{row['first_name']}, your subject on **{row['day_of_week']}** "
                f"is **{row['activity']}**."
            )
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

        row = _student_or_error(dispatcher, tracker)
        if row is None:
            return []

        dispatcher.utter_message(
            text=(
                f"{row['first_name']}, your session is in room **{row['room']}** "
                f"at the **{row['campus']}** campus."
            )
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

        row = _student_or_error(dispatcher, tracker)
        if row is None:
            return []

        dispatcher.utter_message(
            text=(
                f"Here is the full schedule for "
                f"**{row['first_name']} {row['last_name']}**:\n\n"
                f"**Day:**           {row['day_of_week']}\n"
                f"**Campus:**        {row['campus']}\n"
                f"**Session type:**  {row['session_type']}\n"
                f"**Time:**          {row['time_range']}\n"
                f"**Subject:**       {row['activity']}\n"
                f"**Room:**          {row['room']}\n\n"
                f"Is there anything else you'd like to know?"
            )
        )
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
