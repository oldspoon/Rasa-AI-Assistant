"""Wording and rules for extra support lectures run by lab assistants. Pure functions."""

import json
import re
from datetime import date, timedelta

from actions import library, parking, teachers

SHOW_SUPPORT = "/ask_support_lectures"
SHOW_MINE = "/ask_my_support_lectures"


def book_payload(number: int) -> str:
    return f"/book_support_lecture{json.dumps({'session': str(number)})}"


def normalise_session(value) -> int | None:
    return library.normalise_book(value)


def parse_session(text: str | None) -> int | None:
    if not text:
        return None
    match = re.search(r"\b(?:session|lecture|class|number|no\.?|#)\s*(\d{1,2})\b", text.lower())
    if match:
        return int(match.group(1))
    return library.normalise_book(text)


def next_date(day: str, today) -> date:
    """The next occurrence of a weekday, never today."""
    today = library.to_date(today)
    ahead = (teachers.DAY_NAMES.index(day) - today.weekday()) % 7
    return today + timedelta(days=ahead or 7)


def booked_count(bookings: list, lecture_id: int, session_date) -> int:
    wanted = library.to_date(session_date).isoformat()
    return sum(
        1
        for b in bookings
        if b["support_lecture_id"] == lecture_id and str(b["session_date"])[:10] == wanted
    )


def seats_left(lecture: dict, bookings: list, today) -> int:
    taken = booked_count(bookings, lecture["id"], next_date(lecture["day_of_week"], today))
    return max(0, lecture["capacity"] - taken)


def clash(lecture: dict, timetable: list) -> dict | None:
    """The lecture or practical this session overlaps, if any."""
    start = teachers.time_to_minutes(lecture["start_time"])
    end = teachers.time_to_minutes(lecture["end_time"])
    for item in timetable:
        if item["day_of_week"] != lecture["day_of_week"]:
            continue
        first, last = item["time_range"].split("-")
        if start < teachers.time_to_minutes(last) and teachers.time_to_minutes(first) < end:
            return item
    return None


def decide(lecture: dict, timetable: list, bookings: list, student: dict, today):
    """('ok', date) or an error code: 'already', 'full', or ('clash', timetable item)."""
    when = next_date(lecture["day_of_week"], today)
    mine = [
        b for b in bookings
        if b["support_lecture_id"] == lecture["id"]
        and str(b["session_date"])[:10] == when.isoformat()
        and b["first_name"].lower() == student["first_name"].lower()
        and b["last_name"].lower() == student["last_name"].lower()
    ]
    if mine:
        return "already"
    if seats_left(lecture, bookings, today) == 0:
        return "full"
    conflict = clash(lecture, timetable)
    if conflict:
        return ("clash", conflict)
    return ("ok", when)


def assistant_name(lecture: dict) -> str:
    return f"{lecture['assistant_first_name']} {lecture['assistant_last_name']}"


def describe(lecture: dict, bookings: list, today) -> str:
    when = next_date(lecture["day_of_week"], today)
    left = seats_left(lecture, bookings, today)
    return "\n".join(
        [
            f"**{lecture['number']}.** {lecture['topic']}",
            f"**Next:** {lecture['day_of_week']} {parking.date_text(when)}",
            f"**Time:** {lecture['start_time']}-{lecture['end_time']}",
            f"**Room:** {lecture['room']}, {lecture['campus']} campus",
            f"**Lab assistant:** {assistant_name(lecture)}",
            f"**Seats left:** {left}" if left else "**Seats left:** Full",
        ]
    )


def sessions_message(first: str, discipline: str, lectures: list, bookings: list, today) -> str:
    blocks = "\n\n".join(describe(lecture, bookings, today) for lecture in lectures)
    return (
        f"Hi {first}! Here are the extra support lectures for **{discipline}**. "
        f"Each one is a weekly one-hour class run by a lab assistant:\n\n{blocks}\n\n"
        "Choose a number to book a seat. You book the next session shown."
    )


def sessions_buttons(lectures: list) -> list:
    return [
        {"title": f"Book session {lecture['number']}", "payload": book_payload(lecture["number"])}
        for lecture in lectures
    ]


def confirmation(first: str, lecture: dict, when) -> str:
    return (
        f"Booked, {first}! You have a seat in **{lecture['topic']}** on "
        f"**{lecture['day_of_week']} {parking.date_text(library.to_date(when))}** from "
        f"**{lecture['start_time']}** to **{lecture['end_time']}** in room **{lecture['room']}** "
        f"at the **{lecture['campus']}** campus. Your lab assistant is "
        f"**{assistant_name(lecture)}** ({lecture['assistant_email']}). "
        "Say 'my support lectures' to see everything you have booked."
    )


def already_booked(first: str, lecture: dict) -> str:
    return (
        f"{first}, you already have a seat in **{lecture['topic']}** next "
        f"{lecture['day_of_week']}. Say 'my support lectures' to see it."
    )


def full_message(first: str, lecture: dict) -> str:
    return (
        f"{first}, **{lecture['topic']}** is full next {lecture['day_of_week']}. "
        "Say 'support lectures' to see the sessions that still have seats."
    )


def clash_message(first: str, lecture: dict, item: dict) -> str:
    return (
        f"{first}, **{lecture['topic']}** on {lecture['day_of_week']} "
        f"({lecture['start_time']}-{lecture['end_time']}) clashes with your "
        f"**{item['session_type']}** at {item['time_range']}. Choose another session."
    )


def unknown_message(first: str, count: int) -> str:
    return f"{first}, I couldn't find that session. Choose a number from 1 to {count}."


def mine_message(first: str, rows: list, today) -> str:
    if not rows:
        return (
            f"Hi {first}! You have no upcoming support lectures booked. "
            "Say 'support lectures' to see what is available."
        )
    noun = "a support lecture" if len(rows) == 1 else f"{len(rows)} support lectures"
    blocks = "\n\n".join(
        "\n".join(
            [
                f"**{row['topic']}**",
                f"**When:** {row['day_of_week']} {parking.date_text(library.to_date(row['session_date']))}",
                f"**Time:** {row['start_time']}-{row['end_time']}",
                f"**Room:** {row['room']}, {row['campus']} campus",
                f"**Lab assistant:** {assistant_name(row)} ({row['assistant_email']})",
            ]
        )
        for row in rows
    )
    return f"Hi {first}! You have {noun} booked:\n\n{blocks}"


def mine_buttons() -> list:
    return [{"title": "Book another", "payload": SHOW_SUPPORT}]
