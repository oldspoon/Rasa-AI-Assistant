"""Parking arrears: wording (actions/parking.py) and seed rules (database/populate_db.py)."""
from datetime import datetime

import populate_db
from actions import parking


def row(issued_at="2026-10-14 09:32", pence=6000):
    return {
        "license_plate": "LB21 XQT",
        "issued_at": issued_at,
        "fine_pence": pence,
        "location": "Craiglockhart campus grounds",
    }


class TestWording:
    def test_pay_by_is_one_month_after_issue(self):
        assert parking.date_text(parking.pay_by(datetime(2026, 10, 14))) == "14 November 2026"

    def test_pay_by_rolls_over_the_year(self):
        assert parking.date_text(parking.pay_by(datetime(2026, 12, 20))) == "20 January 2027"

    def test_pay_by_clamps_to_the_end_of_a_short_month(self):
        assert parking.date_text(parking.pay_by(datetime(2026, 1, 31))) == "28 February 2026"

    def test_fine_is_shown_in_pounds(self):
        assert parking.pounds(6000) == "£60.00"
        assert parking.pounds(10050) == "£100.50"

    def test_a_charge_shows_date_time_vehicle_location_fine_and_pay_by(self):
        text = parking.describe_arrear(row())
        for part in (
            "**Date:** 14 October 2026",
            "**Time:** 09:32",
            "**Vehicle:** LB21 XQT",
            "**Location:** Craiglockhart campus grounds",
            "**Fine owed:** £60.00",
            "**Pay by:** 14 November 2026",
        ):
            assert part in text

    def test_the_message_explains_accruing_charges_and_asks_how_to_pay(self):
        text = parking.arrears_message("Alice", [row()])
        assert text.startswith("Hi Alice! You have a parking charge to pay:")
        assert "charges start to accrue" in text
        assert text.endswith("How would you like to pay?")

    def test_several_charges_are_counted(self):
        assert "2 parking charges" in parking.arrears_message("Alice", [row(), row("2026-10-20 10:00")])

    def test_no_charges_means_all_clear(self):
        assert "no parking arrears" in parking.arrears_message("Bob", [])

    def test_buttons_offer_phone_first_then_the_infodesk(self):
        assert [b["payload"] for b in parking.BUTTONS] == ["/pay_by_phone", "/pay_at_infodesk"]
        assert [b["title"] for b in parking.BUTTONS] == ["Pay by phone", "Visit the InfoDesk"]


class TestSeedData:
    def test_alice_johnson_owes_on_craiglockhart_campus_grounds(self):
        rows = {(r[0], r[1]): r for r in populate_db.parking_rows()}
        alice = rows[("Alice", "Johnson")]
        assert alice[2] == "Craiglockhart"
        assert alice[3] == "Craiglockhart campus grounds"

    def test_eight_of_fifteen_students_owe(self):
        assert len(populate_db.STUDENTS) == 15
        assert len(populate_db.PARKING_ARREARS) == 8

    def test_every_charge_is_on_the_campus_the_student_attends(self):
        for index, *_ in populate_db.PARKING_ARREARS:
            first, _middle, last = populate_db.STUDENTS[index]
            row_for_student = next(r for r in populate_db.parking_rows() if (r[0], r[1]) == (first, last))
            assert row_for_student[2] == populate_db.campus_for(index)

    def test_each_charge_has_a_plate_a_time_and_a_fine(self):
        for _first, _last, _campus, _location, plate, issued_at, fine_pence in populate_db.parking_rows():
            assert len(plate) == 8 and plate[4] == " "
            datetime.strptime(issued_at, "%Y-%m-%d %H:%M")
            assert fine_pence > 0

    def test_no_student_is_listed_twice(self):
        names = [(r[0], r[1]) for r in populate_db.parking_rows()]
        assert len(names) == len(set(names))
