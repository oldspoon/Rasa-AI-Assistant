from datetime import date
from types import SimpleNamespace

import populate_db
import pytest

from actions import actions, support

TODAY = date(2026, 11, 16)
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
TIMETABLE = [
    {"session_type": "Lecture", "day_of_week": "Monday", "time_range": "10:00-12:00",
     "campus": "Craiglockhart", "activity": "Fine Arts", **TEACHER},
    {"session_type": "Practical", "day_of_week": "Wednesday", "time_range": "15:30-17:00",
     "campus": "Craiglockhart", "activity": "Fine Arts", **TEACHER},
]


def lecture(number=1, day="Monday", start="16:00", end="17:00", capacity=8, **extra):
    base = {
        "id": number,
        "number": number,
        "discipline": "Fine Arts",
        "topic": f"Topic {number}",
        "campus": "Craiglockhart",
        "day_of_week": day,
        "start_time": start,
        "end_time": end,
        "room": "C130",
        "capacity": capacity,
        "assistant_first_name": "Hannah",
        "assistant_last_name": "Brooks",
        "assistant_email": "hannah.brooks@napier.ac.uk",
    }
    return {**base, **extra}


def booking(lecture_id=1, day="2026-11-23", first="Bob", last="Smith"):
    return {"support_lecture_id": lecture_id, "first_name": first, "last_name": last, "session_date": day}


class TestDates:
    def test_next_date_is_the_following_occurrence_never_today(self):
        assert support.next_date("Monday", TODAY) == date(2026, 11, 23)
        assert support.next_date("Tuesday", TODAY) == date(2026, 11, 17)
        assert support.next_date("Friday", TODAY) == date(2026, 11, 20)

    def test_a_weekday_already_passed_rolls_to_next_week(self):
        assert support.next_date("Monday", date(2026, 11, 18)) == date(2026, 11, 23)


class TestParsing:
    def test_session_numbers(self):
        assert support.normalise_session("2") == 2
        assert support.normalise_session("third") == 3
        assert support.parse_session("book support lecture 2") == 2
        assert support.parse_session("book a support lecture") is None

    def test_payload_carries_the_session(self):
        assert support.book_payload(3) == '/book_support_lecture{"session": "3"}'


class TestRules:
    def test_a_free_session_can_be_booked_for_its_next_date(self):
        assert support.decide(lecture(), TIMETABLE, [], ALICE, TODAY) == ("ok", date(2026, 11, 23))

    def test_a_session_overlapping_the_timetable_clashes(self):
        result = support.decide(lecture(start="11:00", end="12:00"), TIMETABLE, [], ALICE, TODAY)
        assert result[0] == "clash" and result[1]["session_type"] == "Lecture"

    def test_a_partial_overlap_clashes(self):
        result = support.decide(lecture(day="Wednesday", start="16:00", end="17:00"), TIMETABLE, [], ALICE, TODAY)
        assert result[0] == "clash" and result[1]["session_type"] == "Practical"

    def test_back_to_back_sessions_do_not_clash(self):
        assert support.decide(lecture(start="12:00", end="13:00"), TIMETABLE, [], ALICE, TODAY)[0] == "ok"

    def test_a_full_session_is_refused(self):
        bookings = [booking(first=f"S{n}") for n in range(2)]
        assert support.decide(lecture(capacity=2), TIMETABLE, bookings, ALICE, TODAY) == "full"

    def test_bookings_for_other_dates_do_not_fill_the_next_session(self):
        bookings = [booking(day="2026-11-30", first=f"S{n}") for n in range(2)]
        assert support.decide(lecture(capacity=2), TIMETABLE, bookings, ALICE, TODAY)[0] == "ok"

    def test_booking_twice_is_refused(self):
        bookings = [booking(first="Alice", last="Johnson")]
        assert support.decide(lecture(), TIMETABLE, bookings, ALICE, TODAY) == "already"

    def test_seats_left_counts_the_next_date_only(self):
        bookings = [booking(), booking(first="C"), booking(day="2026-11-30", first="D")]
        assert support.seats_left(lecture(), bookings, TODAY) == 6


class TestWording:
    def test_the_list_shows_topic_time_room_assistant_and_seats(self):
        text = support.sessions_message("Alice", "Fine Arts", [lecture(1), lecture(2, day="Friday")], [booking()], TODAY)
        for part in (
            "**1.** Topic 1",
            "**Next:** Monday 23 November 2026",
            "**Time:** 16:00-17:00",
            "**Room:** C130, Craiglockhart campus",
            "**Lab assistant:** Hannah Brooks",
            "**Seats left:** 7",
            "**Next:** Friday 20 November 2026",
        ):
            assert part in text

    def test_a_full_session_says_full(self):
        text = support.describe(lecture(capacity=1), [booking()], TODAY)
        assert "**Seats left:** Full" in text

    def test_buttons_are_one_per_session(self):
        buttons = support.sessions_buttons([lecture(1), lecture(2), lecture(3)])
        assert [b["title"] for b in buttons] == ["Book session 1", "Book session 2", "Book session 3"]

    def test_confirmation_names_date_room_and_the_lab_assistant(self):
        text = support.confirmation("Alice", lecture(), date(2026, 11, 23))
        for part in ("Booked, Alice!", "Monday 23 November 2026", "**16:00** to **17:00**",
                     "room **C130**", "Hannah Brooks", "hannah.brooks@napier.ac.uk"):
            assert part in text

    def test_clash_message_names_what_it_clashes_with(self):
        text = support.clash_message("Alice", lecture(), TIMETABLE[0])
        assert "**Lecture** at 10:00-12:00" in text

    def test_nothing_booked_says_so(self):
        assert "no upcoming support lectures" in support.mine_message("Alice", [], TODAY)

    def test_my_lectures_lists_each_booking(self):
        row = {**lecture(), "session_date": "2026-11-23"}
        text = support.mine_message("Alice", [row], TODAY)
        assert "a support lecture booked" in text and "Hannah Brooks" in text and "23 November 2026" in text


class TestSeedData:
    def test_every_programme_has_three_support_lectures_each_with_an_assistant(self):
        rows = populate_db.support_lecture_rows()
        assert len(rows) == 9
        assistant_ids = {row[0] for row in populate_db.lab_assistant_rows()}
        for row in rows:
            assert row[9] in assistant_ids

    def test_each_programme_has_two_assistants_who_belong_to_it(self):
        by_discipline = {}
        for _id, _first, _last, discipline, email in populate_db.lab_assistant_rows():
            by_discipline.setdefault(discipline, []).append(email)
            assert email.endswith("@napier.ac.uk")
        assert {d: len(v) for d, v in by_discipline.items()} == {d: 2 for d in populate_db.ACTIVITIES}
        ids = {row[0]: row[3] for row in populate_db.lab_assistant_rows()}
        for row in populate_db.support_lecture_rows():
            assert ids[row[9]] == row[1]

    def test_sessions_are_one_hour_on_weekdays_on_the_programmes_campus(self):
        campuses = {t[2]: t[3] for t in populate_db.TEACHERS}
        for _id, discipline, _n, _topic, campus, day, start, end, _room, _a, capacity in populate_db.support_lecture_rows():
            assert day in populate_db.DAYS and campus == campuses[discipline] and capacity > 0
            assert int(end[:2]) * 60 + int(end[3:]) - int(start[:2]) * 60 - int(start[3:]) == 60


def tracker(text, entities=()):
    return SimpleNamespace(
        sender_id="alicejohnson:test",
        slots={},
        latest_message={"metadata": {"student": ALICE}, "entities": list(entities), "text": text},
        get_slot=lambda key: None,
    )


@pytest.fixture
def support_db(monkeypatch):
    state = SimpleNamespace(bookings=[], mine=[], inserted=[], sent=[], lectures=[lecture(1), lecture(2, day="Friday"), lecture(3, day="Tuesday")])

    def fetch_one(sql, params=()):
        return ALICE

    def fetch_all(sql, params=()):
        if "FROM   attendance" in sql:
            return TIMETABLE
        if "FROM   support_lectures s" in sql and "support_bookings" not in sql:
            return state.lectures
        if "FROM   support_bookings b" in sql and "lab_assistants" in sql:
            return state.mine
        if "FROM   support_bookings b" in sql:
            return state.bookings
        raise AssertionError(sql)

    def execute(sql, params=()):
        state.inserted.append(params)
        return 1

    monkeypatch.setattr(actions.db, "fetch_one", fetch_one)
    monkeypatch.setattr(actions.db, "fetch_all", fetch_all)
    monkeypatch.setattr(actions.db, "execute", execute)
    return state


def run(action, state, text="", entities=()):
    dispatcher = SimpleNamespace(utter_message=lambda **kwargs: state.sent.append(kwargs))
    action.run(dispatcher, tracker(text, entities), {})
    return state.sent[-1]


class TestActions:
    def test_listing_offers_a_button_for_each_session(self, support_db):
        sent = run(actions.ActionListSupportLectures(), support_db)
        assert len(sent["buttons"]) == 3 and "Hannah Brooks" in sent["text"]

    def test_booking_without_a_number_lists_the_sessions(self, support_db):
        sent = run(actions.ActionBookSupportLecture(), support_db, "I want to book a support lecture")
        assert len(sent["buttons"]) == 3 and support_db.inserted == []

    def test_booking_stores_the_next_date_and_confirms(self, support_db):
        sent = run(actions.ActionBookSupportLecture(), support_db, "book support lecture 2")
        params = support_db.inserted[0]
        assert params[0] == 2 and params[1:3] == ("Alice", "Johnson")
        assert "Booked, Alice!" in sent["text"] and "Hannah Brooks" in sent["text"]

    def test_the_entity_picks_the_session(self, support_db):
        run(actions.ActionBookSupportLecture(), support_db, "x", [{"entity": "session", "value": "3"}])
        assert support_db.inserted[0][0] == 3

    def test_an_unknown_session_is_refused(self, support_db):
        sent = run(actions.ActionBookSupportLecture(), support_db, "book support lecture 7")
        assert "couldn't find that session" in sent["text"] and support_db.inserted == []

    def test_a_clashing_session_is_refused(self, support_db):
        support_db.lectures = [lecture(1, start="11:00", end="12:00")]
        sent = run(actions.ActionBookSupportLecture(), support_db, "book support lecture 1")
        assert "clashes" in sent["text"] and support_db.inserted == []

    def test_a_full_session_is_refused(self, support_db):
        support_db.lectures = [lecture(1, capacity=1)]
        next_day = support.next_date("Monday", date.today()).isoformat()
        support_db.bookings = [booking(lecture_id=1, day=next_day)]
        sent = run(actions.ActionBookSupportLecture(), support_db, "book support lecture 1")
        assert "is full" in sent["text"] and support_db.inserted == []

    def test_checking_with_nothing_booked_says_so(self, support_db):
        sent = run(actions.ActionCheckSupportBookings(), support_db)
        assert "no upcoming support lectures" in sent["text"]

    def test_checking_lists_the_booked_lectures(self, support_db):
        support_db.mine = [{**lecture(), "session_date": "2026-11-23"}]
        sent = run(actions.ActionCheckSupportBookings(), support_db)
        assert "Topic 1" in sent["text"] and sent["buttons"][0]["payload"] == "/ask_support_lectures"
