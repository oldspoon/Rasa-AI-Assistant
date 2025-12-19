"""Wording for parking arrears. Pure functions: no database or Rasa imports."""

import calendar
from datetime import datetime

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

PAY_BY_PHONE = "/pay_by_phone"
PAY_AT_INFODESK = "/pay_at_infodesk"

# Buttons under the arrears message. The web chat shows a phone icon on the first one.
BUTTONS = [
    {"title": "Pay by phone", "payload": PAY_BY_PHONE},
    {"title": "Visit the InfoDesk", "payload": PAY_AT_INFODESK},
]


def date_text(moment: datetime) -> str:
    """'14 October 2026'."""
    return f"{moment.day} {MONTHS[moment.month - 1]} {moment.year}"


def pay_by(issued: datetime) -> datetime:
    """One month after the charge was issued (clamped to the end of a short month)."""
    month = issued.month % 12 + 1
    year = issued.year + (1 if issued.month == 12 else 0)
    day = min(issued.day, calendar.monthrange(year, month)[1])
    return issued.replace(year=year, month=month, day=day)


def pounds(pence: int) -> str:
    """6000 -> '£60.00'."""
    return f"£{pence / 100:.2f}"


def describe_arrear(row) -> str:
    """The details of one charge: date, time, vehicle, location, fine and pay-by date."""
    issued = datetime.strptime(row["issued_at"], "%Y-%m-%d %H:%M")
    return "\n".join(
        [
            f"**Date:** {date_text(issued)}",
            f"**Time:** {issued:%H:%M}",
            f"**Vehicle:** {row['license_plate']}",
            f"**Location:** {row['location']}",
            f"**Fine owed:** {pounds(row['fine_pence'])}",
            f"**Pay by:** {date_text(pay_by(issued))}",
        ]
    )


def arrears_message(first_name: str, rows) -> str:
    """The full reply: the charges, the one-month rule and the question about paying."""
    if not rows:
        return f"Hi {first_name}! You have no parking arrears. You're all clear."
    noun = "a parking charge" if len(rows) == 1 else f"{len(rows)} parking charges"
    blocks = "\n\n".join(describe_arrear(row) for row in rows)
    return (
        f"Hi {first_name}! You have {noun} to pay:\n\n{blocks}\n\n"
        "You can pay up to a month after a charge was issued. "
        "After that, charges start to accrue. How would you like to pay?"
    )
