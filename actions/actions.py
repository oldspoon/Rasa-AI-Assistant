"""
actions/actions.py
Custom Rasa actions that connect to the SQLite attendance database.

Design note
-----------
The answer actions are stateless: they read the student's first/last name
from slots (set from entities, which Rasa also tracks in stories) and query
the attendance database on demand. No custom "student_*" slots are set at
runtime, because slots that appear only at runtime (never in the training
stories) make the ML policies under-confident and can trigger the default
fallback message.
"""

import os
import sqlite3
import logging
from typing import Any, Text, Dict, List

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

logger = logging.getLogger(__name__)

_THIS_DIR  = os.path.dirname(os.path.abspath(__file__))
_PROJ_ROOT = os.path.dirname(_THIS_DIR)
DB_PATH    = os.path.join(_PROJ_ROOT, "database", "attendance.db")


def _get_connection() -> sqlite3.Connection:
    """Return a SQLite connection."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(
            f"Attendance database not found at: {DB_PATH}\n"
            "Please run:  python database/populate_db.py"
        )
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _fetch_student(first_name: str, last_name: str) -> sqlite3.Row | None:
    """Query the DB for a student by first and last name."""
    sql = """
        SELECT *
        FROM   attendance
        WHERE  LOWER(first_name) = LOWER(?)
          AND  LOWER(last_name)  = LOWER(?)
        LIMIT  1
    """
    try:
        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, (first_name.strip(), last_name.strip()))
            return cursor.fetchone()
    except Exception as exc:
        logger.error("Database error in _fetch_student: %s", exc)
        return None


def _get_full_name(tracker: Tracker) -> tuple[str, str]:
    """
    Return (first_name, last_name) from slots, falling back to the entities
    of the latest user message when a slot has not been filled yet.
    """
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
) -> sqlite3.Row | None:
    """
    Return the student row for the current conversation, or None after
    dispatching a helpful message (ask for name / name not found).
    """
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


class ActionLookupStudent(Action):
    """
    Triggered when the user introduces themselves.
    Queries the attendance DB for first_name + last_name and confirms.
    """

    def name(self) -> Text:
        return "action_lookup_student"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

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

        # Re-set the slots with the canonical spelling from the database.
        # This keeps the tracker consistent with the training stories.
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
