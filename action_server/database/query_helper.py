"""Inspect the attendance database. Run: python database/query_helper.py"""

import sys

# Windows console encoding fix.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    from database import db  # package import
except ImportError:  # direct run
    import db


def print_all_students():
    rows = db.fetch_all("SELECT * FROM attendance ORDER BY id")

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
    row = db.fetch_one(
        "SELECT * FROM attendance WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
        (first_name, last_name),
    )
    if row:
        print(f"\n✅  Found: {row}\n")
    else:
        print(f"\n❌  No student found for '{first_name} {last_name}'\n")


def summary_by_campus():
    rows = db.fetch_all(
        "SELECT campus, COUNT(*) AS total FROM attendance GROUP BY campus ORDER BY campus"
    )
    print("\nStudents per campus:")
    for r in rows:
        print(f"  {r['campus']:<18} → {r['total']} students")


def summary_by_session_type():
    rows = db.fetch_all(
        "SELECT session_type, COUNT(*) AS total FROM attendance GROUP BY session_type"
    )
    print("\nStudents per session type:")
    for r in rows:
        print(f"  {r['session_type']:<12} → {r['total']} students")


def print_login_accounts():
    """Print the login accounts."""
    try:
        rows = db.fetch_all(
            "SELECT username, password, first_name, last_name FROM users ORDER BY id"
        )
    except Exception:
        print("\nNo `users` table yet - create the login accounts with:")
        print("  python database/populate_db.py --users-only\n")
        return
    print("\nLogin accounts (username / password):")
    for r in rows:
        print(f"  {r['username']:<20} {r['password']:<20} {r['first_name']} {r['last_name']}")


if __name__ == "__main__":
    print("\n═══════════════════  ALL STUDENTS  ═══════════════════\n")
    print_all_students()
    summary_by_campus()
    summary_by_session_type()
    print()
    lookup_student("Alice", "Johnson")
    lookup_student("Unknown", "Person")
    print_login_accounts()
    print()
