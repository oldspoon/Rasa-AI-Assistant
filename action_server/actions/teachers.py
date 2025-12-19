"""Wording and booking rules for the teacher who hosts a student's sessions.

Pure functions: no database or Rasa imports. Sessions carry the teacher columns
added to the attendance query (see actions.py), so one discipline always has the
same teacher.
"""

import re

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

DAY_ALIASES = {
    "mon": "Monday",
    "monday": "Monday",
    "tue": "Tuesday",
    "tues": "Tuesday",
    "tuesday": "Tuesday",
    "wed": "Wednesday",
    "weds": "Wednesday",
    "wednesday": "Wednesday",
    "thu": "Thursday",
    "thur": "Thursday",
    "thurs": "Thursday",
    "thursday": "Thursday",
    "fri": "Friday",
    "friday": "Friday",
}

SLOT_MINUTES = 30

_TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", re.IGNORECASE)


def teacher_of(sessions: list) -> dict:
    """The teacher shared by the student's sessions (both are one discipline)."""
    session = sessions[0]
    return {
        "id": session["teacher_id"],
        "first_name": session["teacher_first_name"],
        "last_name": session["teacher_last_name"],
        "discipline": session["teacher_discipline"],
        "campus": session["teacher_campus"],
        "office_room": session["teacher_office_room"],
        "email": session["teacher_email"],
        "phone": session["teacher_phone"],
    }


def teacher_name(teacher: dict) -> str:
    return f"{teacher['first_name']} {teacher['last_name']}"


def teacher_message(first: str, sessions: list) -> str:
    """Reply to 'who is my teacher?'."""
    teacher = teacher_of(sessions)
    return (
        f"{first}, your teacher is **{teacher_name(teacher)}**, who hosts both your "
        f"**Lecture** and your **Practical** for **{teacher['discipline']}** at the "
        f"**{teacher['campus']}** campus. Their office is room "
        f"**{teacher['office_room']}**."
    )


def office_message(first: str, sessions: list) -> str:
    """Reply to 'where is my teacher's office?'."""
    teacher = teacher_of(sessions)
    return (
        f"{first}, **{teacher_name(teacher)}** holds office hours in room "
        f"**{teacher['office_room']}** at the **{teacher['campus']}** campus. "
        "Ask me when you can visit and I'll show the free hours."
    )


def contact_message(first: str, sessions: list) -> str:
    """Reply to 'how can I contact my teacher?'."""
    teacher = teacher_of(sessions)
    name = teacher_name(teacher)
    return (
        f"{first}, here is how to reach **{name}**:\n\n"
        f"**Email:** {teacher['email']}\n"
        f"**Phone:** {teacher['phone']}\n"
        f"**Microsoft Teams:** search for {name} in Teams to send a chat message or start a call\n\n"
        f"You can also visit room **{teacher['office_room']}** at the **{teacher['campus']}** campus. "
        "Ask me for the office hours to see when and to book a visit."
    )


def hours_lines(hours: list) -> str:
    """Office hours as one markdown line per day, Monday first."""
    order = {day: index for index, day in enumerate(DAY_NAMES)}
    ordered = sorted(hours, key=lambda h: order.get(h["day_of_week"], 99))
    return "\n".join(
        f"**{h['day_of_week']}:** {h['start_time']}-{h['end_time']}" for h in ordered
    )


def hours_message(first: str, sessions: list, hours: list) -> str:
    """Reply to 'when can I visit my teacher?'."""
    teacher = teacher_of(sessions)
    return (
        f"{first}, you can visit **{teacher_name(teacher)}** in room "
        f"**{teacher['office_room']}** at the **{teacher['campus']}** campus during "
        f"these free hours:\n\n{hours_lines(hours)}\n\n"
        "Appointments are 30 minutes. Tell me a day and time to book one "
        "(for example: 'Book Tuesday at 14:30')."
    )


def booking_prompt(first: str, sessions: list, hours: list) -> str:
    """Ask for a day and time when the booking request had neither."""
    teacher = teacher_of(sessions)
    return (
        f"Sure, {first}. **{teacher_name(teacher)}** is free in room "
        f"**{teacher['office_room']}** at these times:\n\n{hours_lines(hours)}\n\n"
        "Which day and time would you like? Slots are 30 minutes and start on the "
        "hour or half hour (for example: 'Tuesday at 14:30')."
    )


def normalise_day(value: str | None) -> str | None:
    """'tuesdays' / 'TUE' / 'Tuesday' -> 'Tuesday'; anything else -> None."""
    if not value:
        return None
    word = re.sub(r"[^a-z]", "", value.strip().lower())
    return DAY_ALIASES.get(word) or DAY_ALIASES.get(word.rstrip("s"))


def parse_day(text: str | None) -> str | None:
    """First weekday named in a free-text message."""
    if not text:
        return None
    for word in re.findall(r"[a-z]+", text.lower()):
        day = DAY_ALIASES.get(word) or DAY_ALIASES.get(word.rstrip("s"))
        if day:
            return day
    return None


def normalise_time(value: str | None) -> str | None:
    """'2:30pm' / '14:30' / '10am' -> '14:30' / '14:30' / '10:00'."""
    if not value:
        return None
    match = _TIME_RE.search(value.strip())
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    suffix = (match.group(3) or "").lower()
    if suffix == "pm" and hour < 12:
        hour += 12
    elif suffix == "am" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def parse_time(text: str | None) -> str | None:
    """First clock time in a free-text message, normalised to HH:MM."""
    if not text:
        return None
    for match in _TIME_RE.finditer(text):
        has_clock = match.group(2) is not None or match.group(3) is not None
        if has_clock:
            found = normalise_time(match.group(0))
            if found:
                return found
    return None


def time_to_minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def minutes_to_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def add_minutes(value: str, minutes: int) -> str:
    return minutes_to_time(time_to_minutes(value) + minutes)


def slots_between(start: str, end: str) -> list:
    """Bookable slots inside one office-hours window."""
    first, last = time_to_minutes(start), time_to_minutes(end)
    return [
        minutes_to_time(at)
        for at in range(first, last - SLOT_MINUTES + 1, SLOT_MINUTES)
    ]


def free_slots(day: str, hours: list, bookings: list) -> list:
    """Slots still free on one day."""
    window = next((h for h in hours if h["day_of_week"] == day), None)
    if window is None:
        return []
    taken = {b["start_time"] for b in bookings if b["day_of_week"] == day}
    return [slot for slot in slots_between(window["start_time"], window["end_time"]) if slot not in taken]


def validate_slot(day: str, start: str, hours: list, bookings: list):
    """(start, end) for a bookable slot, or an error code string."""
    window = next((h for h in hours if h["day_of_week"] == day), None)
    if window is None:
        return "day_unavailable"

    minutes = time_to_minutes(start)
    if minutes % SLOT_MINUTES:
        return "bad_time"
    if minutes < time_to_minutes(window["start_time"]) or (
        minutes + SLOT_MINUTES > time_to_minutes(window["end_time"])
    ):
        return "outside_hours"
    if any(
        b["day_of_week"] == day and b["start_time"] == start
        for b in bookings
    ):
        return "taken"
    return start, add_minutes(start, SLOT_MINUTES)


def already_booked_message(first: str, sessions: list, day: str, start: str, end: str) -> str:
    teacher = teacher_of(sessions)
    return (
        f"{first}, you already have that appointment: **{day}** from **{start}** to "
        f"**{end}** with **{teacher_name(teacher)}** in room "
        f"**{teacher['office_room']}**. Ask me to book a different free slot."
    )


def booking_confirmation(first: str, sessions: list, day: str, start: str, end: str) -> str:
    teacher = teacher_of(sessions)
    return (
        f"Booked! **{first}**, you will meet **{teacher_name(teacher)}** on "
        f"**{day}** from **{start}** to **{end}** in room "
        f"**{teacher['office_room']}** at the **{teacher['campus']}** campus. "
        "Please arrive on time. Ask me any time to see your teacher's free hours again."
    )


def booking_error(code: str, first: str, sessions: list, hours: list, day: str, bookings: list) -> str:
    """Explain why a slot could not be booked, with the times that are free."""
    teacher = teacher_of(sessions)
    name = teacher_name(teacher)

    if code == "day_unavailable":
        return (
            f"{first}, **{name}** does not hold office hours on **{day}**. "
            f"These are the free hours:\n\n{hours_lines(hours)}"
        )

    if code == "bad_time":
        return (
            f"{first}, appointments are 30 minutes and start on the hour or half "
            "hour. Try a time like **14:00** or **14:30**."
        )

    if code == "taken":
        slots = free_slots(day, hours, bookings)
        free = ", ".join(f"**{slot}**" for slot in slots) if slots else "none left"
        return (
            f"{first}, that slot on **{day}** is already booked. Free slots that day: "
            f"{free}."
        )

    window = next((h for h in hours if h["day_of_week"] == day), None)
    if window:
        return (
            f"{first}, **{name}** is free on **{day}** only from "
            f"**{window['start_time']}** to **{window['end_time']}**. "
            "Book a 30-minute slot inside that window, e.g. "
            f"**{window['start_time']}**."
        )
    return (
        f"{first}, **{name}** has no office hours on **{day}**. "
        f"These are the free hours:\n\n{hours_lines(hours)}"
    )
