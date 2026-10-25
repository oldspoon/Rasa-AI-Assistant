"""
Debug viewer for bot conversations: list recent ones or replay one by UUID.

Usage (repository root):
    venv\\Scripts\\python.exe rasa\\show_conversation.py --list [--neon]
    venv\\Scripts\\python.exe rasa\\show_conversation.py <uuid> [--url URL | --neon]

Store lookup: --url, then --neon, then RASA_TRACKER_STORE_URL, then rasa/logs/trackers.db.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_LOCAL_URL = "sqlite:///" + (SCRIPT_DIR / "logs" / "trackers.db").as_posix()

try:
    import sqlalchemy as sa
except ImportError:
    sys.exit(
        "sqlalchemy is not importable - run this script with the repository's\n"
        "virtual environment, e.g.:  venv\\Scripts\\python.exe rasa\\show_conversation.py"
    )


def load_env_local() -> dict:
    """Load KEY=VALUE pairs from .env.local, if present."""
    values = {}
    env_file = REPO_ROOT / ".env.local"
    if not env_file.exists():
        return values
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_url(args) -> str:
    if args.url:
        return args.url
    if args.neon:
        values = load_env_local()
        url = values.get("DATABASE_URL_UNPOOLED") or values.get("DATABASE_URL")
        if not url:
            sys.exit("--neon: no DATABASE_URL_UNPOOLED / DATABASE_URL found in .env.local")
        return url
    return (os.environ.get("RASA_TRACKER_STORE_URL") or "").strip() or DEFAULT_LOCAL_URL


def describe_url(url: str) -> str:
    """URL with the password removed, safe to print."""
    try:
        return sa.engine.make_url(url).render_as_string(hide_password=True)
    except Exception:
        return url


def fmt_ts(ts) -> str:
    try:
        return datetime.fromtimestamp(float(ts)).strftime("%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return "-"


def _sqlite_file(url: str) -> Path | None:
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return None
    path = url[len(prefix):]
    if path in ("", ":memory:"):
        return None
    return Path(path)


def _engine(url: str):
    kwargs = {}
    if not url.startswith("sqlite"):
        # Fail fast on an unreachable database.
        kwargs["connect_args"] = {"connect_timeout": 10}
    return sa.create_engine(url, **kwargs)


def list_conversations(url: str, limit: int) -> int:
    file = _sqlite_file(url)
    if file is not None and not file.exists():
        print(f"No conversation store yet at {file}")
        print("(start the bot with  ./dev-run.sh -r  and it will be created)")
        return 0

    try:
        engine = _engine(url)
    except Exception as exc:
        print(f"Cannot open the store at {describe_url(url)}: {exc}")
        return 1

    try:
        if not sa.inspect(engine).has_table("events"):
            print(f"No conversations stored yet in {describe_url(url)}")
            return 0
        with engine.connect() as conn:
            rows = conn.execute(
                sa.text(
                    "SELECT sender_id, COUNT(*) AS events, "
                    "MIN(timestamp) AS started, MAX(timestamp) AS last "
                    "FROM events GROUP BY sender_id ORDER BY last DESC LIMIT :n"
                ),
                {"n": max(limit, 1)},
            ).all()
        if not rows:
            print(f"No conversations stored yet in {describe_url(url)}")
            return 0
        print(f"Most recent {len(rows)} conversation(s) in {describe_url(url)}:\n")
        for sender_id, events, _started, last in rows:
            print(f"  {sender_id}")
            print(f"      {events:>4} events · last activity {fmt_ts(last)}")
        print("\nReplay one with:  python rasa/show_conversation.py <uuid> [--neon]")
        return 0
    except Exception as exc:
        print(f"Could not read the store at {describe_url(url)}: {exc}")
        return 1
    finally:
        engine.dispose()


def _clip(text: str, width: int = 300) -> str:
    shown = repr(text)
    return shown if len(shown) <= width else shown[: width - 3] + "...'"


def replay_conversation(url: str, sender_id: str) -> int:
    try:
        engine = _engine(url)
    except Exception as exc:
        print(f"Cannot open the store at {describe_url(url)}: {exc}")
        return 1

    try:
        if not sa.inspect(engine).has_table("events"):
            print(f"No conversations stored yet in {describe_url(url)}")
            return 1
        with engine.connect() as conn:
            rows = conn.execute(
                sa.text(
                    "SELECT data FROM events WHERE sender_id = :sender ORDER BY id"
                ),
                {"sender": sender_id},
            ).all()
    except Exception as exc:
        print(f"Could not read the store at {describe_url(url)}: {exc}")
        return 1
    finally:
        engine.dispose()

    if not rows:
        print(f"No conversation found with id {sender_id} in {describe_url(url)}")
        print("Tip:  --list  shows the most recent conversation ids.")
        return 1

    events = []
    for (data,) in rows:
        try:
            events.append(json.loads(data))
        except (TypeError, ValueError):
            pass

    def is_kind(event, kind):
        return event.get("event") == kind

    user = [e for e in events if is_kind(e, "user")]
    bot = [e for e in events if is_kind(e, "bot")]
    actions = [e for e in events if is_kind(e, "action")]
    timestamps = [e.get("timestamp") for e in events if e.get("timestamp")]

    print(f"Conversation {sender_id}")
    print(f"Store        {describe_url(url)}")
    if timestamps:
        span = float(max(timestamps)) - float(min(timestamps))
        print(f"Span         {fmt_ts(min(timestamps))} -> {fmt_ts(max(timestamps))}  ({span:.0f}s)")
    print(f"Turns        {len(user)} user · {len(bot)} bot · {len(actions)} actions · {len(events)} events")
    print()

    for event in events:
        kind = event.get("event", "?")
        when = fmt_ts(event.get("timestamp"))
        if kind == "user":
            parse = event.get("parse_data") or {}
            intent = parse.get("intent") or {}
            name = intent.get("name") or "-"
            confidence = intent.get("confidence")
            conf = f" · {confidence:.2f}" if isinstance(confidence, (int, float)) else ""
            entities = parse.get("entities") or []
            ent = ""
            if entities:
                ent = "  [" + ", ".join(
                    f"{e.get('entity')}={e.get('value')}" for e in entities
                ) + "]"
            print(f"{when}  USER    {_clip(event.get('text') or '')}  [intent {name}{conf}]{ent}")
        elif kind == "bot":
            print(f"{when}  BOT     {_clip(event.get('text') or '')}")
        elif kind == "action":
            print(f"{when}  ACTION  {event.get('name')}  [{event.get('policy') or '-'}]")
        elif kind == "slot":
            print(f"{when}  SLOT    {event.get('name')} = {event.get('value')!r}")
        elif kind in ("session_started", "conversation_started", "user_featurization"):
            continue
        else:
            label = re.sub(r"[^A-Za-z0-9_]", "", kind).upper() or "EVENT"
            extra = event.get("name") or event.get("text") or ""
            print(f"{when}  {label:<7} {extra}".rstrip())

    return 0


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

    parser = argparse.ArgumentParser(
        description="List or replay the conversations stored by the tracker store.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "store selection, first match wins:\n"
            "  --url <SQLAlchemy URL>   anything, e.g. sqlite:///logs/trackers.db\n"
            "  --neon                   DATABASE_URL(_UNPOOLED) from .env.local\n"
            "  RASA_TRACKER_STORE_URL   environment variable\n"
            "  (default)                rasa/logs/trackers.db - local dev store\n"
        ),
    )
    parser.add_argument("sender_id", nargs="?", help="conversation UUID to replay")
    parser.add_argument(
        "--list", action="store_true", help="list the most recent conversations"
    )
    parser.add_argument(
        "--limit", type=int, default=20, help="how many conversations --list shows (default 20)"
    )
    parser.add_argument("--url", help="SQLAlchemy store URL (overrides everything else)")
    parser.add_argument(
        "--neon", action="store_true", help="use the .env.local Neon connection"
    )
    args = parser.parse_args()

    url = resolve_url(args)
    if args.list:
        return list_conversations(url, args.limit)
    if not args.sender_id:
        parser.error("give a conversation id to replay, or use --list")
    return replay_conversation(url, args.sender_id)


if __name__ == "__main__":
    sys.exit(main())
