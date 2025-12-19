"""Teachers, office hours and appointment booking: wording rules and the actions."""
from types import SimpleNamespace

import pytest

from actions import actions, teachers

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
    {"session_type": "Lecture", "day_of_week": "Monday", "time_range": "10:00-12:00",
     "room": "F14", "campus": "Craiglockhart", "activity": "Fine Arts", **TEACHER},
    {"session_type": "Practical", "day_of_week": "Wednesday", "time_range": "13:00-15:00",
     "room": "D28", "campus": "Craiglockhart", "activity": "Fine Arts", **TEACHER},
]
HOURS = [
    {"day_of_week": "Monday", "start_time": "10:00", "end_time": "12:00"},
    {"day_of_week": "Tuesday", "start_time": "14:00", "end_time": "16:00"},
]


class TestTimeAndDay:
    def test_day_aliases_and_weekdays(self):
        assert teachers.normalise_day("Tuesday") == "Tuesday"
        assert teachers.normalise_day("tues") == "Tuesday"
        assert teachers.normalise_day("FRI") == "Friday"
        assert teachers.normalise_day("someday") is None
        assert teachers.normalise_day(None) is None

    def test_parse_day_finds_the_weekday_in_a_sentence(self):
        assert teachers.parse_day("Book Tuesday at 14:30") == "Tuesday"
        assert teachers.parse_day("nothing here") is None

    def test_time_normalisation_handles_24h_12h_and_bare_hours(self):
        assert teachers.normalise_time("14:30") == "14:30"
        assert teachers.normalise_time("2:30pm") == "14:30"
        assert teachers.normalise_time("10am") == "10:00"
        assert teachers.normalise_time("12:00pm") == "12:00"
        assert teachers.normalise_time("nonsense") is None

    def test_parse_time_needs_a_clock_marker(self):
        assert teachers.parse_time("Book Tuesday at 14:30") == "14:30"
        assert teachers.parse_time("I want 2 slots") is None

    def test_slots_are_thirty_minutes_inside_the_window(self):
        assert teachers.slots_between("14:00", "16:00") == ["14:00", "14:30", "15:00", "15:30"]


class TestBookingRules:
    def test_a_slot_inside_the_free_hours_is_bookable(self):
        assert teachers.validate_slot("Tuesday", "14:30", HOURS, []) == ("14:30", "15:00")

    def test_a_day_without_office_hours_is_refused(self):
        assert teachers.validate_slot("Friday", "10:00", HOURS, []) == "day_unavailable"

    def test_a_time_outside_the_window_is_refused(self):
        assert teachers.validate_slot("Tuesday", "13:00", HOURS, []) == "outside_hours"
        assert teachers.validate_slot("Tuesday", "15:30", HOURS, []) == ("15:30", "16:00")
        assert teachers.validate_slot("Tuesday", "16:00", HOURS, []) == "outside_hours"

    def test_a_slot_must_start_on_the_hour_or_half_hour(self):
        assert teachers.validate_slot("Tuesday", "14:15", HOURS, []) == "bad_time"

    def test_a_slot_already_booked_is_refused(self):
        bookings = [{"first_name": "Bob", "last_name": "Smith",
                     "day_of_week": "Tuesday", "start_time": "14:30", "end_time": "15:00"}]
        assert teachers.validate_slot("Tuesday", "14:30", HOURS, bookings) == "taken"

    def test_hours_message_lists_every_free_day_and_invites_a_booking(self):
        text = teachers.hours_message("Alice", SESSIONS, HOURS)
        assert "**Margaret Ellison**" in text
        assert "**C214**" in text
        assert "**Monday:** 10:00-12:00" in text
        assert "Tuesday:** 14:00-16:00" in text
        assert "Book Tuesday at 14:30" in text

    def test_confirmation_names_teacher_day_slot_and_office(self):
        text = teachers.booking_confirmation("Alice", SESSIONS, "Tuesday", "14:30", "15:00")
        assert "Booked!" in text
        assert "**Margaret Ellison**" in text
        assert "**Tuesday**" in text and "**14:30**" in text and "**15:00**" in text
        assert "**C214**" in text


def tracker(text, entities=()):
    return SimpleNamespace(
        sender_id="alicejohnson:test",
        slots={},
        latest_message={
            "metadata": {"student": ALICE},
            "entities": list(entities),
            "text": text,
        },
        get_slot=lambda key: None,
    )


def run(text, entities=(), bookings=None):
    sent = []
    inserted = []
    fake = SimpleNamespace(bookings=bookings or [])

    def fetch_one(sql, params):
        return ALICE

    def fetch_all(sql, params):
        if "FROM   attendance" in sql:
            return SESSIONS
        if "FROM   teacher_office_hours" in sql:
            return HOURS
        if "FROM   teacher_bookings" in sql:
            return [b for b in fake.bookings if b["day_of_week"] == params[1]]
        raise AssertionError(f"unexpected query: {sql}")

    def execute(sql, params):
        inserted.append(params)
        return 1

    dispatcher = SimpleNamespace(utter_message=lambda **kwargs: sent.append(kwargs))
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(actions.db, "fetch_one", fetch_one)
        mp.setattr(actions.db, "fetch_all", fetch_all)
        mp.setattr(actions.db, "execute", execute)
        events = actions.ActionBookTeacherSlot().run(dispatcher, tracker(text, entities), {})
    return sent, events, inserted


class TestBookingAction:
    def test_without_a_day_or_time_it_lists_the_free_hours_and_asks(self):
        sent, _, inserted = run("I want to book an office hour")
        assert "Which day and time" in sent[0]["text"]
        assert "Tuesday" in sent[0]["text"]
        assert inserted == []

    def test_a_valid_slot_is_inserted_and_confirmed(self):
        sent, _, inserted = run("Book Tuesday at 14:30")
        assert inserted == [
            (1, "Alice", "Johnson", "Tuesday", "14:30", "15:00", inserted[0][6])
        ]
        assert "Booked!" in sent[0]["text"]
        assert "C214" in sent[0]["text"]

    def test_entities_work_without_text_annotations(self):
        sent, _, inserted = run(
            "that one please",
            entities=[{"entity": "day", "value": "Tuesday"},
                      {"entity": "time", "value": "15:00"}],
        )
        assert inserted[0][4:6] == ("15:00", "15:30")
        assert "Booked!" in sent[0]["text"]

    def test_an_outside_hours_slot_is_refused(self):
        sent, _, inserted = run("Book Tuesday at 13:00")
        assert inserted == []
        assert "only from" in sent[0]["text"]

    def test_a_taken_slot_lists_the_remaining_free_slots(self):
        bookings = [{"first_name": "Bob", "last_name": "Smith",
                     "day_of_week": "Tuesday", "start_time": "14:30", "end_time": "15:00"}]
        sent, _, inserted = run("Book Tuesday at 14:30", bookings=bookings)
        assert inserted == []
        assert "already booked" in sent[0]["text"]
        assert "14:00" in sent[0]["text"]

    def test_the_same_student_booking_twice_is_told_it_is_already_theirs(self):
        bookings = [{"first_name": "Alice", "last_name": "Johnson",
                     "day_of_week": "Tuesday", "start_time": "14:30", "end_time": "15:00"}]
        sent, _, inserted = run("Book Tuesday at 14:30", bookings=bookings)
        assert inserted == []
        assert "already have that appointment" in sent[0]["text"]

    def test_a_misaligned_time_asks_for_the_hour_or_half_hour(self):
        sent, _, inserted = run("Book Tuesday at 14:15")
        assert inserted == []
        assert "hour or half hour" in sent[0]["text"]


class TestTeacherMessages:
    def test_teacher_message_names_the_single_teacher_and_office(self):
        text = teachers.teacher_message("Alice", SESSIONS)
        assert "**Margaret Ellison**" in text
        assert "Fine Arts" in text and "C214" in text

    def test_office_message_names_room_and_campus(self):
        text = teachers.office_message("Alice", SESSIONS)
        assert "**C214**" in text and "**Craiglockhart**" in text


class TestTeacherContact:
    def test_contact_message_gives_email_phone_and_teams(self):
        text = teachers.contact_message("Alice", SESSIONS)
        assert "margaret.ellison@napier.ac.uk" in text
        assert "0131 496 0142" in text
        assert "Microsoft Teams" in text and "Margaret Ellison" in text

    def test_every_seeded_teacher_has_a_napier_email_and_a_phone_number(self):
        import populate_db

        for first, last, _discipline, _campus, _room, email, phone in populate_db.TEACHERS:
            assert email == f"{first}.{last}@napier.ac.uk".lower()
            assert phone.startswith("0131 496 ")
