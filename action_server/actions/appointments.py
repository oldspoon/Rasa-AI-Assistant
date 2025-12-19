"""Wording for a student's appointments and full timetable. Pure functions."""

from actions import library, parking, support, teachers

SHOW_TEACHER_HOURS = "/ask_teacher_hours"
SHOW_SUPPORT = support.SHOW_SUPPORT


def sort_visits(visits: list) -> list:
    order = {day: index for index, day in enumerate(teachers.DAY_NAMES)}
    return sorted(visits, key=lambda v: (order.get(v["day_of_week"], 99), v["start_time"]))


def visit_lines(teacher: dict, visits: list) -> str:
    if not visits:
        return "No teacher visits booked."
    name = teachers.teacher_name(teacher)
    return "\n".join(
        f"**{v['day_of_week']}:** {v['start_time']}-{v['end_time']} with {name}, "
        f"room {teacher['office_room']}, {teacher['campus']} campus"
        for v in sort_visits(visits)
    )


def support_blocks(rows: list) -> str:
    if not rows:
        return "No support lectures booked."
    return "\n\n".join(
        "\n".join(
            [
                f"**{row['topic']}**",
                f"**When:** {row['day_of_week']} {parking.date_text(library.to_date(row['session_date']))}",
                f"**Time:** {row['start_time']}-{row['end_time']}",
                f"**Room:** {row['room']}, {row['campus']} campus",
                f"**Lab assistant:** {support.assistant_name(row)} ({row['assistant_email']})",
            ]
        )
        for row in rows
    )


def appointment_sections(teacher: dict, visits: list, support_rows: list) -> str:
    return (
        f"**Teacher visits**\n{visit_lines(teacher, visits)}\n\n"
        f"**Lab assistant support lectures**\n{support_blocks(support_rows)}"
    )


def appointments_message(first: str, teacher: dict, visits: list, support_rows: list) -> str:
    if not visits and not support_rows:
        return (
            f"Hi {first}! You have no appointments booked. "
            "You can book a visit with your teacher or a seat in a support lecture."
        )
    return (
        f"Hi {first}! Here are your appointments:\n\n"
        f"{appointment_sections(teacher, visits, support_rows)}"
    )


def appointments_buttons(visits: list, support_rows: list) -> list | None:
    buttons = []
    if not visits:
        buttons.append({"title": "Book a teacher visit", "payload": SHOW_TEACHER_HOURS})
    if not support_rows:
        buttons.append({"title": "Book a support lecture", "payload": SHOW_SUPPORT})
    return buttons or None


def timetable_message(first: str, last: str, sessions: list, visits: list, support_rows: list) -> str:
    teacher = teachers.teacher_of(sessions)
    name = teachers.teacher_name(teacher)
    blocks = "\n\n".join(
        f"**{s['session_type']}**\n"
        f"**Day:** {s['day_of_week']}\n**Time:** {s['time_range']}\n"
        f"**Room:** {s['room']}, {s['campus']} campus\n**Teacher:** {name}"
        for s in sorted(sessions, key=lambda s: ("Lecture", "Practical").index(s["session_type"]))
    )
    return (
        f"Here is the full timetable for **{first} {last}**:\n\n"
        f"**Subject:** {sessions[0]['activity']}\n"
        f"**Teacher:** {name} (office **{teacher['office_room']}**)\n\n"
        f"{blocks}\n\n"
        f"**Appointments**\n\n{appointment_sections(teacher, visits, support_rows)}"
    )

