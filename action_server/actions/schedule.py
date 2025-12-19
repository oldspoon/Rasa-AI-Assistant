"""Wording for a student's weekly schedule. Pure functions: no database or Rasa imports.

Every student has one Lecture and one Practical, passed in as `sessions`. Both are
hosted by the teacher of the student's discipline (one teacher per discipline).
"""

from actions import teachers

KINDS = ("Lecture", "Practical")


def session_of(sessions: list, kind: str) -> dict:
    """The student's session of one kind ('Lecture' or 'Practical')."""
    return next(s for s in sessions if s["session_type"] == kind)


def session_day_message(first: str, session: dict) -> str:
    """Reply to 'what day is my lecture/practical?'."""
    return (
        f"Hi {first}! You have a **{session['session_type']}** session on "
        f"**{session['day_of_week']}**, hosted by **{session['teacher_first_name']} "
        f"{session['teacher_last_name']}**. Would you like to know more details such "
        f"as your campus, time, subject, or room?"
    )


def campus_message(first: str, sessions: list) -> str:
    teacher = teachers.teacher_of(sessions)
    return (
        f"{first}, your lecture and practical both take place at the "
        f"**{sessions[0]['campus']}** campus, hosted by "
        f"**{teachers.teacher_name(teacher)}**."
    )


def time_message(first: str, sessions: list) -> str:
    lecture, practical = (session_of(sessions, k) for k in KINDS)
    teacher = teachers.teacher_of(sessions)
    return (
        f"{first}, your **Lecture** on **{lecture['day_of_week']}** runs from "
        f"**{lecture['time_range']}** and your **Practical** on "
        f"**{practical['day_of_week']}** runs from **{practical['time_range']}**. "
        f"Both are hosted by **{teachers.teacher_name(teacher)}**."
    )


def subject_message(first: str, sessions: list) -> str:
    teacher = teachers.teacher_of(sessions)
    return (
        f"{first}, your subject is **{sessions[0]['activity']}**, taught by "
        f"**{teachers.teacher_name(teacher)}**."
    )


def room_message(first: str, sessions: list) -> str:
    lecture, practical = (session_of(sessions, k) for k in KINDS)
    teacher = teachers.teacher_of(sessions)
    return (
        f"{first}, your **Lecture** is in room **{lecture['room']}** and your "
        f"**Practical** is in room **{practical['room']}**, both at the "
        f"**{lecture['campus']}** campus. Your teacher **{teachers.teacher_name(teacher)}** "
        f"has office hours in room **{teacher['office_room']}**."
    )


def full_schedule_parts(first: str, last: str, sessions: list) -> list:
    """The weekly schedule as three paragraphs: header, details, closing line."""
    teacher = teachers.teacher_of(sessions)
    blocks = "\n\n".join(
        f"**{s['session_type']}**\n"
        f"**Day:** {s['day_of_week']}\n**Time:** {s['time_range']}\n**Room:** {s['room']}\n"
        f"**Teacher:** {teachers.teacher_name(teacher)}"
        for s in (session_of(sessions, k) for k in KINDS)
    )
    return [
        f"Here is the weekly schedule for **{first} {last}**:",
        f"**Campus:** {sessions[0]['campus']}\n**Subject:** {sessions[0]['activity']}\n"
        f"**Teacher:** {teachers.teacher_name(teacher)} (office **{teacher['office_room']}**)\n\n{blocks}",
        "Is there anything else you'd like to know?",
    ]
