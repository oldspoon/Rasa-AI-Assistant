"""Wording and rules for library books. Pure functions: no database or Rasa imports."""

import json
import math
import random
import re
from datetime import date, datetime, timedelta

from actions import parking

DIGITAL = "Digital"
IN_PERSON = "In person"

LOAN_DAYS = 28
HOLD_DAYS = 3
FINE_PENCE_PER_MONTH = 500
MONTH_DAYS = 30

NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5}

SHOW_LIBRARY = "/ask_library_location"
SHOW_BOOKS = "/ask_books"


def borrow_payload(book: int, kind: str | None = None) -> str:
    """Button payload that sets the book (and optionally the format) as entities."""
    entities = {"book": str(book)}
    if kind:
        entities["format"] = "digital" if kind == DIGITAL else "in person"
    return f"/borrow_book{json.dumps(entities)}"


def normalise_book(value) -> int | None:
    """'2' / 'book 2' / 'second' -> 2."""
    if value is None:
        return None
    text = str(value).strip().lower()
    match = re.search(r"\b(\d{1,2})\b", text)
    if match:
        return int(match.group(1))
    for word, number in NUMBER_WORDS.items():
        if re.search(rf"\b{word}\b", text):
            return number
    return None


def parse_book(text: str | None) -> int | None:
    """The book number named in a free-text message."""
    if not text:
        return None
    match = re.search(r"\b(?:book|number|no\.?|#)\s*(\d{1,2})\b", text.lower())
    if match:
        return int(match.group(1))
    return normalise_book(text)


def normalise_format(value) -> str | None:
    """'digitally' -> 'Digital'; 'in person' -> 'In person'; anything else -> None."""
    if not value:
        return None
    text = str(value).lower()
    if re.search(r"digital|online|e-?book|electronic|screen", text):
        return DIGITAL
    if re.search(r"person|collect|physical|pick|paper|print|hard", text):
        return IN_PERSON
    return None


def to_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def due_date(borrowed_on) -> date:
    return to_date(borrowed_on) + timedelta(days=LOAN_DAYS)


def collect_by(borrowed_on) -> date:
    return to_date(borrowed_on) + timedelta(days=HOLD_DAYS)


def overdue_days(due_on, today) -> int:
    return max(0, (to_date(today) - to_date(due_on)).days)


def overdue_months(due_on, today) -> int:
    """Every month, or part of a month, past the due date counts."""
    return math.ceil(overdue_days(due_on, today) / MONTH_DAYS)


def fine_pence(loan: dict, today) -> int:
    """£5 for each month overdue. Digital loans end by themselves, so never fined."""
    if loan["format"] != IN_PERSON or loan.get("returned_on"):
        return 0
    return overdue_months(loan["due_on"], today) * FINE_PENCE_PER_MONTH


def current_loans(loans: list, today) -> list:
    """Loans still open: not returned, and not a digital loan past its due date."""
    return [
        loan
        for loan in loans
        if not loan.get("returned_on")
        and not (loan["format"] == DIGITAL and to_date(loan["due_on"]) < to_date(today))
    ]


def total_fines(loans: list, today) -> int:
    return sum(fine_pence(loan, today) for loan in loans)


def new_pickup_code(campus: str, taken: set, rng: random.Random | None = None) -> str:
    """A collection code such as 'MER-4821' that no other loan uses."""
    rng = rng or random.SystemRandom()
    prefix = campus[:3].upper()
    while True:
        code = f"{prefix}-{rng.randint(1000, 9999)}"
        if code not in taken:
            return code


def libraries_message(libraries: list) -> str:
    blocks = "\n\n".join(
        f"**{lib['name']}** ({lib['campus']} campus)\n"
        f"**Where:** {lib['location']}\n**Room:** {lib['room']}\n**Open:** {lib['opening_hours']}"
        for lib in libraries
    )
    return (
        "Here is where to find the library on each campus:\n\n"
        f"{blocks}\n\n"
        "Say 'recommend books' to see five books for your subject."
    )


def books_message(first: str, discipline: str, books: list) -> str:
    lines = "\n".join(f"**{b['number']}.** {b['title']} by {b['author']}" for b in books)
    return (
        f"Hi {first}! Here are 5 books for **{discipline}**:\n\n{lines}\n\n"
        "Choose a number to borrow a book. You can borrow it digitally here in the chat, "
        "or collect it in person from your campus library."
    )


def books_buttons(books: list) -> list:
    return [
        {"title": f"Borrow book {b['number']}", "payload": borrow_payload(b["number"])}
        for b in books
    ]


def format_prompt(first: str, book: dict) -> str:
    return (
        f"{first}, you picked **{book['title']}** by {book['author']}. "
        "How would you like to borrow it? A digital copy is ready straight away. "
        "An in-person copy gets you a collection code and a receipt."
    )


def format_buttons(book_number: int) -> list:
    return [
        {"title": "Borrow digitally", "payload": borrow_payload(book_number, DIGITAL)},
        {"title": "Collect in person", "payload": borrow_payload(book_number, IN_PERSON)},
    ]


def digital_confirmation(first: str, book: dict, due_on) -> str:
    return (
        f"Done, {first}! **{book['title']}** is now in your digital library. "
        f"It stays with you until **{parking.date_text(to_date(due_on))}** and then returns "
        "by itself, so there is nothing to bring back and no fine. "
        "Say 'my borrowed books' to see everything you have on loan."
    )


def receipt(first: str, book: dict, library: dict, code: str, borrowed_on, due_on) -> str:
    return (
        f"Booked, {first}! Here is your receipt:\n\n"
        f"**Book:** {book['title']} by {book['author']}\n"
        f"**Collection code:** {code}\n"
        f"**Collect from:** {library['name']}, {library['location']}, room {library['room']}\n"
        f"**Collect by:** {parking.date_text(collect_by(borrowed_on))}\n"
        f"**Return by:** {parking.date_text(to_date(due_on))}\n"
        f"**Return to:** {library['name']}, room {library['room']}\n"
        f"**Late fine:** {parking.pounds(FINE_PENCE_PER_MONTH)} for each month (or part of a month) overdue\n\n"
        "Show the code at the library desk to pick up your book."
    )


def already_borrowed(first: str, book: dict) -> str:
    return (
        f"{first}, you already have **{book['title']}** on loan. "
        "Say 'my borrowed books' to see it, or choose another book."
    )


def unknown_book(first: str) -> str:
    return f"{first}, I couldn't find that book. Choose a number from 1 to 5."


def describe_loan(loan: dict, today) -> str:
    due = to_date(loan["due_on"])
    lines = [
        f"**Book:** {loan['title']} by {loan['author']}",
        f"**Format:** {loan['format']}",
        f"**Borrowed:** {parking.date_text(to_date(loan['borrowed_on']))}",
        f"**Return by:** {parking.date_text(due)}",
    ]
    if loan["format"] == IN_PERSON:
        lines.append(f"**Return to:** {loan['library_name']}, room {loan['library_room']}")
        if loan.get("pickup_code"):
            lines.append(f"**Collection code:** {loan['pickup_code']}")
    late = overdue_days(due, today)
    if loan["format"] == DIGITAL:
        lines.append(f"**Status:** Returns by itself in {(due - to_date(today)).days} days")
    elif late:
        lines.append(f"**Status:** Overdue by {late} days")
        lines.append(f"**Fine owed:** {parking.pounds(fine_pence(loan, today))}")
    else:
        lines.append(f"**Status:** {(due - to_date(today)).days} days left")
    return "\n".join(lines)


def loans_message(first: str, loans: list, today) -> str:
    if not loans:
        return f"Hi {first}! You have no borrowed books and no library fines. You're all clear."
    noun = "a borrowed book" if len(loans) == 1 else f"{len(loans)} borrowed books"
    blocks = "\n\n".join(describe_loan(loan, today) for loan in loans)
    total = total_fines(loans, today)
    if total:
        ending = (
            f"**Total fines:** {parking.pounds(total)}\n\n"
            "Late books are fined "
            f"{parking.pounds(FINE_PENCE_PER_MONTH)} for each month (or part of a month) overdue. "
            "Return the book to its library desk and pay the fine there."
        )
    else:
        ending = "You have no library fines. Return in-person books on time to keep it that way."
    return f"Hi {first}! You have {noun}:\n\n{blocks}\n\n{ending}"


def loans_buttons(loans: list, today) -> list | None:
    if total_fines(loans, today):
        return [{"title": "Where is the library?", "payload": SHOW_LIBRARY}]
    return None
