"""
populate_db.py
Populates the attendance SQLite database with 15 students,
their campus assignments, sessions, rooms, and activities.
"""

import sqlite3
import os
import random

DB_PATH = os.path.join(os.path.dirname(__file__), "attendance.db")


def create_database():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DROP TABLE IF EXISTS attendance")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name      TEXT    NOT NULL,
            middle_name     TEXT    NOT NULL,
            last_name       TEXT    NOT NULL,
            campus          TEXT    NOT NULL CHECK(campus IN ('Craiglockhart', 'Sighthill', 'Merchiston')),
            session_type    TEXT    NOT NULL CHECK(session_type IN ('Lecture', 'Practical')),
            day_of_week     TEXT    NOT NULL CHECK(day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')),
            time_range      TEXT    NOT NULL,
            activity        TEXT    NOT NULL CHECK(activity IN ('Fine Arts', 'Computing', 'Biology')),
            room            TEXT    NOT NULL
        )
    """)

    # 15 students with first, middle, last names
    students = [
        ("Alice",   "Marie",    "Johnson"),
        ("Bob",     "James",    "Smith"),
        ("Carol",   "Anne",     "Williams"),
        ("David",   "Lee",      "Brown"),
        ("Emma",    "Grace",    "Jones"),
        ("Frank",   "Thomas",   "Garcia"),
        ("Grace",   "Louise",   "Miller"),
        ("Henry",   "Charles",  "Davis"),
        ("Isabella","Rose",     "Wilson"),
        ("Jack",    "Edward",   "Moore"),
        ("Katie",   "Lynn",     "Taylor"),
        ("Liam",    "Patrick",  "Anderson"),
        ("Mia",     "Claire",   "Thomas"),
        ("Noah",    "William",  "Jackson"),
        ("Olivia",  "Faith",    "White"),
    ]

    campuses      = ["Craiglockhart", "Sighthill", "Merchiston"]
    session_types = ["Lecture", "Practical"]
    days          = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    activities    = ["Fine Arts", "Computing", "Biology"]

    # Valid 2-hour time slots within 10:00–17:00
    time_slots = [
        "10:00-12:00",
        "11:00-13:00",
        "12:00-14:00",
        "13:00-15:00",
        "14:00-16:00",
        "15:00-17:00",
    ]

    def random_room():
        letter = random.choice("ABCDEF")
        number = random.randint(0, 99)
        return f"{letter}{number:02d}"

    random.seed(42)

    rows = []
    for i, (first, middle, last) in enumerate(students):
        campus       = campuses[i % len(campuses)]
        session_type = session_types[i % len(session_types)]
        day          = days[i % len(days)]
        time_range   = time_slots[i % len(time_slots)]
        activity     = activities[i % len(activities)]
        room         = random_room()
        rows.append((first, middle, last, campus, session_type, day, time_range, activity, room))

    cursor.executemany("""
        INSERT INTO attendance
            (first_name, middle_name, last_name, campus, session_type,
             day_of_week, time_range, activity, room)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows)

    conn.commit()

    cursor.execute("SELECT * FROM attendance")
    records = cursor.fetchall()
    print(f"✅  Database created at: {DB_PATH}")
    print(f"✅  {len(records)} student records inserted.\n")
    print(f"{'ID':<4} {'First':<10} {'Middle':<10} {'Last':<12} {'Campus':<16} "
          f"{'Type':<10} {'Day':<12} {'Time':<14} {'Activity':<12} {'Room'}")
    print("-" * 110)
    for r in records:
        print(f"{r[0]:<4} {r[1]:<10} {r[2]:<10} {r[3]:<12} {r[4]:<16} "
              f"{r[5]:<10} {r[6]:<12} {r[7]:<14} {r[8]:<12} {r[9]}")

    conn.close()


if __name__ == "__main__":
    create_database()
