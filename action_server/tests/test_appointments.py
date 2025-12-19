from types import SimpleNamespace

import pytest

from actions import actions, appointments, teachers

ALICE = {"first_name": "Alice", "last_name": "Johnson"}
TEACHER = {
    "teacher_id": 1,
    "teacher_first_name": "Margaret",
    "teacher_last_name": "Ellison",
    "teacher_discipline": "Fine Arts",
    "teacher_campus": "Craiglockhart",
    "teacher_office_room": "C214",
    "teacher_email": "margaret.ellison@napier.ac.uk",
    "teacher_phone": "0131 496 0142",
}
SESSIONS = [
    {"session_type": "Practical", "day_of_week": "Wednesday", "time_range": "13:00-15:00", "room": "D28",
     "campus": "Craiglockhart", "activity": "Fine Arts", **TEACHER},
    {"session_type": "Lecture", "day_of_week": "Monday", "time_range": "10:00-12:00", "room": "F14",
     "campus": "Craiglockhart", "activity": "Fine Arts", **TEACHER},
]
VISITS = [
    {"day_of_week": "Thursday", "start_time": "14:00", "end_time": "14:30"},
    {"day_of_week": "Tuesday", "start_time": "14:30", "end_time": "15:00"},
]
SUPPORT = [
    {"session_date": "2026-11-23", "topic": "Colour theory workshop", "campus": "Craiglockhart",
     "day_of_week": "Monday", "start_time": "16:00", "end_time": "17:00", "room": "C130",
     "assistant_first_name": "Hannah", "assistant_last_name": "Brooks",
     "assistant_email": "hannah.brooks@napier.ac.uk"},
]
TEACHER_DICT = teachers.teacher_of(SESSIONS)


class TestAppointments:
    def test_visits_are_listed_in_weekday_order(self):
        text = appointments.visit_lines(TEACHER_DICT, VISITS)
        assert text.index("**Tuesday:**") < text.index("**Thursday:**")
        assert "14:30-15:00 with Margaret Ellison, room C214, Craiglockhart campus" in text

    def test_both_kinds_are_listed(self):
        text = appointments.appointments_message("Alice", TEACHER_DICT, VISITS, SUPPORT)
        for part in (
            "**Teacher visits**",
            "**Lab assistant support lectures**",
            "**Colour theory workshop**",
            "**When:** Monday 23 November 2026",
            "**Lab assistant:** Hannah Brooks (hannah.brooks@napier.ac.uk)",
        ):
            assert part in text

    def test_nothing_booked_says_so_and_offers_both_buttons(self):
        assert "no appointments booked" in appointments.appointments_message("Alice", TEACHER_DICT, [], [])
        buttons = appointments.appointments_buttons([], [])
        assert [b["payload"] for b in buttons] == ["/ask_teacher_hours", "/ask_support_lectures"]

    def test_only_the_missing_kind_gets_a_button(self):
        assert [b["payload"] for b in appointments.appointments_buttons(VISITS, [])] == ["/ask_support_lectures"]
        assert appointments.appointments_buttons(VISITS, SUPPORT) is None

    def test_an_empty_section_says_so(self):
        text = appointments.appointments_message("Alice", TEACHER_DICT, VISITS, [])
        assert "No support lectures booked." in text and "No teacher visits booked." not in text


class TestTimetable:
    def test_lists_lecture_then_practical_with_all_their_data(self):
        text = appointments.timetable_message("Alice", "Johnson", SESSIONS, VISITS, SUPPORT)
        assert text.index("**Lecture**") < text.index("**Practical**")
        for part in (
            "**Alice Johnson**",
            "**Subject:** Fine Arts",
            "**Day:** Monday",
            "**Time:** 10:00-12:00",
            "**Room:** F14, Craiglockhart campus",
            "**Day:** Wednesday",
            "**Teacher:** Margaret Ellison",
        ):
            assert part in text

    def test_includes_every_appointment_slot(self):
        text = appointments.timetable_message("Alice", "Johnson", SESSIONS, VISITS, SUPPORT)
        assert "**Appointments**" in text
        assert "**Thursday:** 14:00-14:30" in text and "Colour theory workshop" in text

    def test_an_empty_week_still_shows_the_lecture_and_practical(self):
        text = appointments.timetable_message("Alice", "Johnson", SESSIONS, [], [])
        assert "No teacher visits booked." in text and "No support lectures booked." in text


def tracker():
    return SimpleNamespace(
        sender_id="alicejohnson:test",
        slots={},
        latest_message={"metadata": {"student": ALICE}, "entities": [], "text": ""},
        get_slot=lambda key: None,
    )


@pytest.fixture
def appointment_db(monkeypatch):
    state = SimpleNamespace(visits=VISITS, support=SUPPORT, sent=[])

    def fetch_one(sql, params=()):
        return ALICE

    def fetch_all(sql, params=()):
        if "FROM   attendance" in sql:
            return SESSIONS
        if "FROM   teacher_bookings" in sql:
            return state.visits
        if "FROM   support_bookings b" in sql:
            return state.support
        raise AssertionError(sql)

    monkeypatch.setattr(actions.db, "fetch_one", fetch_one)
    monkeypatch.setattr(actions.db, "fetch_all", fetch_all)
    return state


def run(action, state):
    dispatcher = SimpleNamespace(utter_message=lambda **kwargs: state.sent.append(kwargs))
    action.run(dispatcher, tracker(), {})
    return state.sent[-1]


class TestActions:
    def test_the_appointments_action_lists_both_kinds(self, appointment_db):
        sent = run(actions.ActionListAppointments(), appointment_db)
        assert "**Teacher visits**" in sent["text"] and "Colour theory workshop" in sent["text"]
        assert sent["buttons"] is None

    def test_the_timetable_action_shows_the_week_and_appointments(self, appointment_db):
        sent = run(actions.ActionShowTimetable(), appointment_db)
        assert "**Lecture**" in sent["text"] and "**Appointments**" in sent["text"]

    def test_an_empty_list_offers_to_book(self, appointment_db):
        appointment_db.visits, appointment_db.support = [], []
        sent = run(actions.ActionListAppointments(), appointment_db)
        assert "no appointments booked" in sent["text"] and len(sent["buttons"]) == 2
