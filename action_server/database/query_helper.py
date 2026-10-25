"""
database/query_helper.py
Utility script for manually inspecting the attendance database.
Run:  python database/query_helper.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "attendance.db")


def print_all_students():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM attendance ORDER BY id")
    rows = cursor.fetchall()
    conn.close()

    header = (
        f"{'ID':<4} {'First':<12} {'Middle':<12} {'Last':<12} "
        f"{'Campus':<16} {'Type':<10} {'Day':<12} {'Time':<14} "
        f"{'Activity':<12} {'Room'}"
    )
    print(header)
    print("─" * 115)
    for r in rows:
        print(
            f"{r['id']:<4} {r['first_name']:<12} {r['middle_name']:<12} "
            f"{r['last_name']:<12} {r['campus']:<16} {r['session_type']:<10} "
            f"{r['day_of_week']:<12} {r['time_range']:<14} "
            f"{r['activity']:<12} {r['room']}"
        )


def lookup_student(first_name: str, last_name: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM attendance WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
        (first_name, last_name),
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        print(f"\n✅  Found: {dict(row)}\n")
    else:
        print(f"\n❌  No student found for '{first_name} {last_name}'\n")


def summary_by_campus():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT campus, COUNT(*) AS total FROM attendance GROUP BY campus ORDER BY campus"
    )
    rows = cursor.fetchall()
    conn.close()
    print("\nStudents per campus:")
    for r in rows:
        print(f"  {r[0]:<18} → {r[1]} students")


def summary_by_session_type():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT session_type, COUNT(*) AS total FROM attendance GROUP BY session_type"
    )
    rows = cursor.fetchall()
    conn.close()
    print("\nStudents per session type:")
    for r in rows:
        print(f"  {r[0]:<12} → {r[1]} students")


if __name__ == "__main__":
    print("\n═══════════════════  ALL STUDENTS  ═══════════════════\n")
    print_all_students()
    summary_by_campus()
    summary_by_session_type()
    print()
    lookup_student("Alice", "Johnson")
    lookup_student("Unknown", "Person")
