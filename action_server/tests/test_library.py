from datetime import date
from types import SimpleNamespace

import populate_db
import pytest

from actions import actions, library

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
SESSIONS = [
    {"session_type": "Lecture", "campus": "Craiglockhart", "activity": "Fine Arts", **TEACHER},
    {"session_type": "Practical", "campus": "Craiglockhart", "activity": "Fine Arts", **TEACHER},
]
BOOKS = [
    {"id": n, "number": n, "title": f"Title {n}", "author": f"Author {n}"} for n in range(1, 6)
]
LIBRARY = {
    "campus": "Craiglockhart",
    "name": "Craiglockhart Library",
    "location": "Main Building, second floor",
    "room": "M221",
    "opening_hours": "Mon-Fri 09:00-18:30",
}


def loan(**overrides):
    base = {
        "book_id": 1,
        "campus": "Craiglockhart",
        "format": "In person",
        "pickup_code": "CRA-1042",
        "borrowed_on": "2026-09-01",
        "due_on": "2026-09-29",
        "returned_on": None,
        "title": "Title 1",
        "author": "Author 1",
        "number": 1,
        "library_name": "Craiglockhart Library",
        "library_room": "M221",
    }
    return {**base, **overrides}


class TestFines:
    def test_a_book_not_yet_due_has_no_fine(self):
        assert library.fine_pence(loan(due_on="2026-11-20"), TODAY) == 0

    def test_a_book_on_its_due_date_has_no_fine(self):
        assert library.fine_pence(loan(due_on="2026-11-16"), TODAY) == 0

    def test_the_first_day_late_costs_a_month(self):
        assert library.fine_pence(loan(due_on="2026-11-15"), TODAY) == 500

    def test_thirty_days_late_is_still_one_month(self):
        assert library.fine_pence(loan(due_on="2026-10-17"), TODAY) == 500

    def test_thirty_one_days_late_is_two_months(self):
        assert library.fine_pence(loan(due_on="2026-10-16"), TODAY) == 1000

    def test_the_seeded_overdue_loan_owes_ten_pounds(self):
        assert library.fine_pence(loan(), TODAY) == 1000

    def test_digital_loans_are_never_fined(self):
        assert library.fine_pence(loan(format="Digital", due_on="2026-01-01"), TODAY) == 0

    def test_returned_books_are_never_fined(self):
        assert library.fine_pence(loan(returned_on="2026-10-01"), TODAY) == 0

    def test_total_adds_every_loan(self):
        assert library.total_fines([loan(), loan(due_on="2026-11-02")], TODAY) == 1500

    def test_expired_digital_loans_drop_off_the_list(self):
        loans = [loan(), loan(format="Digital", due_on="2026-11-01"), loan(format="Digital", due_on="2026-11-30")]
        assert [l["due_on"] for l in library.current_loans(loans, TODAY)] == ["2026-09-29", "2026-11-30"]


class TestParsing:
    def test_book_numbers(self):
        assert library.normalise_book("2") == 2
        assert library.normalise_book("book 4") == 4
        assert library.normalise_book("third") == 3
        assert library.normalise_book("9") == 9
        assert library.normalise_book(None) is None

    def test_a_book_number_in_a_sentence(self):
        assert library.parse_book("I want to borrow book 3 please") == 3
        assert library.parse_book("borrow it") is None

    def test_formats(self):
        assert library.normalise_format("digitally") == "Digital"
        assert library.normalise_format("online") == "Digital"
        assert library.normalise_format("in person") == "In person"
        assert library.normalise_format("collect it") == "In person"
        assert library.normalise_format("sometime") is None

    def test_button_payloads_carry_entities(self):
        assert library.borrow_payload(2) == '/borrow_book{"book": "2"}'
        assert library.borrow_payload(2, "Digital") == '/borrow_book{"book": "2", "format": "digital"}'
        assert library.borrow_payload(2, "In person") == '/borrow_book{"book": "2", "format": "in person"}'

    def test_pickup_codes_start_with_the_campus_and_are_unique(self):
        code = library.new_pickup_code("Merchiston", {"MER-1000"})
        assert code.startswith("MER-") and code != "MER-1000"


class TestWording:
    def test_libraries_message_names_all_three_campuses(self):
        libraries = [dict(LIBRARY, campus=c, name=f"{c} Library") for c in ("Merchiston", "Sighthill", "Craiglockhart")]
        text = library.libraries_message(libraries)
        for campus in ("Merchiston", "Sighthill", "Craiglockhart"):
            assert f"**{campus} Library**" in text

    def test_books_message_lists_five_with_borrow_buttons(self):
        text = library.books_message("Alice", "Fine Arts", BOOKS)
        assert text.count("**") >= 10 and "Title 5 by Author 5" in text
        buttons = library.books_buttons(BOOKS)
        assert [b["title"] for b in buttons] == [f"Borrow book {n}" for n in range(1, 6)]

    def test_format_buttons_offer_digital_then_in_person(self):
        titles = [b["title"] for b in library.format_buttons(2)]
        assert titles == ["Borrow digitally", "Collect in person"]

    def test_receipt_has_code_collection_return_and_fine(self):
        text = library.receipt("Alice", BOOKS[0], LIBRARY, "CRA-4821", "2026-11-16", "2026-12-14")
        for part in (
            "**Collection code:** CRA-4821",
            "**Collect from:** Craiglockhart Library, Main Building, second floor, room M221",
            "**Collect by:** 19 November 2026",
            "**Return by:** 14 December 2026",
            "**Return to:** Craiglockhart Library, room M221",
            "£5.00 for each month",
        ):
            assert part in text

    def test_digital_confirmation_has_the_due_date_and_no_fine(self):
        text = library.digital_confirmation("Alice", BOOKS[0], "2026-12-14")
        assert "14 December 2026" in text and "no fine" in text

    def test_loans_message_lists_the_loan_and_the_total_fine(self):
        text = library.loans_message("Alice", [loan()], TODAY)
        for part in (
            "**Book:** Title 1 by Author 1",
            "**Status:** Overdue by 48 days",
            "**Fine owed:** £10.00",
            "**Total fines:** £10.00",
            "£5.00 for each month",
        ):
            assert part in text

    def test_loans_message_with_no_loans_is_all_clear(self):
        assert "no borrowed books and no library fines" in library.loans_message("Bob", [], TODAY)

    def test_loans_without_fines_say_so(self):
        text = library.loans_message("Bob", [loan(due_on="2026-12-01")], TODAY)
        assert "no library fines" in text and "**Fine owed:**" not in text

    def test_a_fine_offers_the_library_button(self):
        assert library.loans_buttons([loan()], TODAY)[0]["payload"] == "/ask_library_location"
        assert library.loans_buttons([loan(due_on="2026-12-01")], TODAY) is None


class TestSeedData:
    def test_every_discipline_has_five_books(self):
        assert {d: len(b) for d, b in populate_db.BOOKS.items()} == {d: 5 for d in populate_db.ACTIVITIES}

    def test_there_is_one_library_per_campus_and_merchiston_is_in_the_east_wing(self):
        assert [row[0] for row in populate_db.LIBRARIES] == ["Merchiston", "Sighthill", "Craiglockhart"]
        assert "East Wing" in populate_db.LIBRARIES[0][2]

    def test_seeded_loans_use_the_students_own_subject_and_campus(self):
        for book_id, first, last, campus, *_ in populate_db.loan_rows():
            index = next(i for i, s in enumerate(populate_db.STUDENTS) if (s[0], s[2]) == (first, last))
            assert campus == populate_db.campus_for(index)
            assert book_id in {populate_db.BOOK_IDS[(populate_db.ACTIVITIES[index % 3], n)] for n in range(1, 6)}

    def test_pickup_codes_are_unique(self):
        codes = [row[5] for row in populate_db.loan_rows() if row[5]]
        assert len(codes) == len(set(codes))


def tracker(text, entities=()):
    return SimpleNamespace(
        sender_id="alicejohnson:test",
        slots={},
        latest_message={"metadata": {"student": ALICE}, "entities": list(entities), "text": text},
        get_slot=lambda key: None,
    )


@pytest.fixture
def library_db(monkeypatch):
    state = SimpleNamespace(loans=[], inserted=[], sent=[])

    def fetch_one(sql, params=()):
        return ALICE

    def fetch_all(sql, params=()):
        if "FROM   attendance" in sql:
            return SESSIONS
        if "FROM   books" in sql:
            return BOOKS
        if "FROM   libraries" in sql:
            return [LIBRARY]
        if "FROM   book_loans" in sql:
            return state.loans
        if "SELECT pickup_code" in sql:
            return []
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
    def test_contact_action_gives_email_phone_and_teams(self, library_db):
        sent = run(actions.ActionAnswerTeacherContact(), library_db)
        assert "margaret.ellison@napier.ac.uk" in sent["text"] and "Teams" in sent["text"]

    def test_library_location_action_lists_the_libraries(self, library_db):
        sent = run(actions.ActionAnswerLibraryLocation(), library_db)
        assert "Craiglockhart Library" in sent["text"]

    def test_books_action_offers_five_borrow_buttons(self, library_db):
        sent = run(actions.ActionSuggestBooks(), library_db)
        assert len(sent["buttons"]) == 5 and "Fine Arts" in sent["text"]

    def test_borrowing_without_a_number_lists_the_books_again(self, library_db):
        sent = run(actions.ActionBorrowBook(), library_db, "I want to borrow a book")
        assert len(sent["buttons"]) == 5 and library_db.inserted == []

    def test_borrowing_without_a_format_asks_with_two_buttons(self, library_db):
        sent = run(actions.ActionBorrowBook(), library_db, "borrow book 2")
        assert [b["title"] for b in sent["buttons"]] == ["Borrow digitally", "Collect in person"]
        assert library_db.inserted == []

    def test_a_digital_loan_is_stored_without_a_code(self, library_db):
        sent = run(actions.ActionBorrowBook(), library_db, "borrow book 2 digitally")
        params = library_db.inserted[0]
        assert params[0] == 2 and params[4] == "Digital" and params[5] is None
        assert "digital library" in sent["text"]

    def test_an_in_person_loan_stores_a_code_and_sends_a_receipt(self, library_db):
        entities = [{"entity": "book", "value": "3"}, {"entity": "format", "value": "in person"}]
        sent = run(actions.ActionBorrowBook(), library_db, "x", entities)
        params = library_db.inserted[0]
        assert params[4] == "In person" and params[5].startswith("CRA-")
        assert params[5] in sent["text"] and "**Return by:**" in sent["text"]

    def test_borrowing_the_same_book_twice_is_refused(self, library_db):
        library_db.loans = [loan(book_id=2, due_on="2099-01-01")]
        sent = run(actions.ActionBorrowBook(), library_db, "borrow book 2 in person")
        assert "already have" in sent["text"] and library_db.inserted == []

    def test_an_unknown_book_number_is_refused(self, library_db):
        entities = [{"entity": "book", "value": "9"}]
        sent = run(actions.ActionBorrowBook(), library_db, "borrow book 9", entities)
        assert "couldn't find that book" in sent["text"]

    def test_checking_loans_shows_fines_and_a_button(self, library_db):
        library_db.loans = [loan()]
        sent = run(actions.ActionCheckBorrowedBooks(), library_db)
        assert "**Fine owed:**" in sent["text"] and sent["buttons"]

    def test_checking_with_no_loans_is_all_clear(self, library_db):
        sent = run(actions.ActionCheckBorrowedBooks(), library_db)
        assert "no borrowed books" in sent["text"] and sent["buttons"] is None
