"""Each way a lookup can fail gets its own reply, never "student not found" for all of them."""
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from actions import actions

ALICE = {"first_name": "Alice", "last_name": "Johnson"}
LECTURE = {**ALICE, "session_type": "Lecture", "day_of_week": "Monday"}
PRACTICAL = {**ALICE, "session_type": "Practical", "day_of_week": "Wednesday"}


def tracker():
    return SimpleNamespace(
        sender_id="alicejohnson:test",
        slots={},
        latest_message={"metadata": {"student": ALICE}, "entities": []},
        get_slot=lambda key: None,
    )


def run(action):
    sent = []
    dispatcher = SimpleNamespace(utter_message=lambda **kwargs: sent.append(kwargs))
    events = action.run(dispatcher, tracker(), {})
    return sent, events


def broken():
    raise ConnectionError("database is down")


def result(value):
    """A canned query result; `broken` makes the query raise instead."""
    return value() if callable(value) else value


@pytest.fixture
def database(monkeypatch):
    """Stand-in for db.fetch_one / db.fetch_all; tests set what they return."""
    fake = SimpleNamespace(student=ALICE, sessions=[LECTURE, PRACTICAL])
    monkeypatch.setattr(actions.db, "fetch_one", lambda sql, params: result(fake.student))
    monkeypatch.setattr(actions.db, "fetch_all", lambda sql, params: result(fake.sessions))
    return fake


class TestScheduleAnswers:
    def test_a_complete_schedule_is_answered(self, database):
        sent, _ = run(actions.ActionAnswerLectureDays())
        assert "**Monday**" in sent[0]["text"]

    def test_an_unknown_student_is_not_found(self, database):
        database.student = None
        sent, _ = run(actions.ActionAnswerLectureDays())
        assert sent == [{"response": "utter_student_not_found", "first_name": "Alice", "last_name": "Johnson"}]

    def test_a_failing_student_lookup_says_the_records_are_unavailable(self, database):
        database.student = broken
        sent, _ = run(actions.ActionAnswerCampus())
        assert sent == [{"response": "utter_records_unavailable"}]

    def test_a_failing_schedule_read_says_the_records_are_unavailable(self, database):
        database.sessions = broken
        sent, _ = run(actions.ActionAnswerRoom())
        assert sent == [{"response": "utter_records_unavailable"}]


class TestLookupStudent:
    def test_a_failing_lookup_says_the_records_are_unavailable(self, database):
        database.student = broken
        sent, events = run(actions.ActionLookupStudent())
        assert sent == [{"response": "utter_records_unavailable"}]
        assert events == []

    def test_an_unknown_student_is_not_found(self, database):
        database.student = None
        sent, events = run(actions.ActionLookupStudent())
        assert sent[0]["response"] == "utter_student_not_found"
        assert events == []


def test_every_reply_the_actions_use_is_in_the_domain():
    """The new replies only reach the user if domain.yml defines them."""
    domain = yaml.safe_load((Path(__file__).resolve().parents[2] / "rasa" / "domain.yml").read_text(encoding="utf-8"))
    for response in ("utter_records_unavailable", "utter_student_not_found"):
        assert response in domain["responses"], response
