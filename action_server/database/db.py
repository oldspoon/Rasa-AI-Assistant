"""
database/db.py
Dual-mode attendance database access.

Default (local development): the SQLite file `attendance.db` in this folder.
Hosted mode: set the DATABASE_URL environment variable - for example a Neon
Postgres connection string - and the same queries run against Postgres.

Everything else in the project talks to the database through this module:

    db.is_postgres()          -> True when DATABASE_URL is set
    db.describe_backend()     -> where queries currently go (for log output)
    db.connect()              -> a raw connection (row factory applied)
    db.fetch_one(sql, params) -> dict | None
    db.fetch_all(sql, params) -> list[dict]

Write queries with `?` placeholders; in Postgres mode they are translated to
psycopg2-style `%s` placeholders automatically.
"""

import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "attendance.db")

_DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()


def is_postgres() -> bool:
    """True when DATABASE_URL is set (hosted Postgres mode)."""
    return bool(_DATABASE_URL)


def describe_backend() -> str:
    """Human-readable summary of where queries currently go."""
    if is_postgres():
        return "Postgres (from DATABASE_URL)"
    return DB_PATH


def connect():
    """Open a connection to whichever backend is configured (caller closes it)."""
    if is_postgres():
        import psycopg2
        import psycopg2.extras

        return psycopg2.connect(
            _DATABASE_URL,
            connect_timeout=10,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )

    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(
            f"Attendance database not found at: {DB_PATH}\n"
            "Please run:  python database/populate_db.py"
        )
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def adapt_sql(sql: str) -> str:
    """Translate `?` placeholders for the active backend."""
    return sql.replace("?", "%s") if is_postgres() else sql


def fetch_one(sql: str, params=()):
    """Run a query and return the first row as a dict, or None."""
    conn = connect()
    try:
        cursor = conn.cursor()
        cursor.execute(adapt_sql(sql), tuple(params))
        row = cursor.fetchone()
        return dict(row) if row is not None else None
    finally:
        conn.close()


def fetch_all(sql: str, params=()):
    """Run a query and return every row as a list of dicts."""
    conn = connect()
    try:
        cursor = conn.cursor()
        cursor.execute(adapt_sql(sql), tuple(params))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()
