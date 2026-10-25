"""
tracker_store.py
Conversation-logging tracker store for the attendance bot.

Every conversation is persisted in a SQL database under the conversation's
UUID - the sender id the chat front end generates once per conversation - so
an online conversation can be retrieved and replayed later for debugging:

    venv\\Scripts\\python.exe rasa\\show_conversation.py --list
    venv\\Scripts\\python.exe rasa\\show_conversation.py <uuid>

Where conversations are stored:

    RASA_TRACKER_STORE_URL   full SQLAlchemy URL, for example
                             sqlite:///logs/trackers.db     (local development)
                             postgresql://...               (hosted, Neon)
    (unset)                  -> the SQLite file logs/trackers.db next to this
                                module (what dev-run.sh uses)

The Hugging Face Space container sets the variable to its Neon Postgres
connection string; endpoints.yml just names this class.

The engine is rebuilt with pool_pre_ping so a hosted database that suspends
while idle (Neon's free plan scales to zero after a few idle minutes) does
not break conversation logging: the pool checks each connection before using
it and reconnects when the database has gone away.
"""

import logging
import os
from pathlib import Path

import sqlalchemy as sa

from rasa.core.tracker_store import SQLTrackerStore, create_engine_kwargs

logger = logging.getLogger(__name__)

_ENV_VAR = "RASA_TRACKER_STORE_URL"


def _default_sqlite_url() -> str:
    """The local conversation store: logs/trackers.db next to this module."""
    db_file = Path(__file__).resolve().parent / "logs" / "trackers.db"
    return "sqlite:///" + db_file.as_posix()


def resolve_store_url() -> str:
    """The SQLAlchemy URL the tracker store should use."""
    url = (os.environ.get(_ENV_VAR) or "").strip().strip('"').strip("'")
    if not url:
        return _default_sqlite_url()
    if url.startswith("postgres://"):
        # SQLAlchemy spells the dialect "postgresql://".
        url = "postgresql://" + url[len("postgres://"):]
    return url


def describe_url(url) -> str:
    """URL that is safe to print in logs (password removed)."""
    try:
        return sa.engine.make_url(str(url)).render_as_string(hide_password=True)
    except Exception:
        return str(url)


def _sqlite_path(url: str) -> str | None:
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return None
    path = url[len(prefix):]
    return None if path in ("", ":memory:") else path


class ConversationSQLTrackerStore(SQLTrackerStore):
    """SQLTrackerStore that keeps every conversation keyed by its UUID."""

    def __init__(self, domain=None, event_broker=None, host=None, url=None, **kwargs):
        # Rasa passes endpoints.yml's `url:` value as the `host` argument to
        # custom stores; prefer it, then RASA_TRACKER_STORE_URL, then the
        # local SQLite file.
        url = (url or host or "").strip() or resolve_store_url()

        # SQLite does not create missing folders - and the store retries
        # forever on an unusable path, so prepare the folder up front.
        sqlite_file = _sqlite_path(url)
        if sqlite_file:
            Path(sqlite_file).expanduser().resolve().parent.mkdir(
                parents=True, exist_ok=True
            )

        super().__init__(domain=domain, event_broker=event_broker, host=url, **kwargs)

        # Rebuild the engine with a self-healing pool (see module docstring).
        engine_url = self.engine.url
        engine_kwargs = dict(create_engine_kwargs(engine_url))
        engine_kwargs["pool_pre_ping"] = True
        if not str(engine_url).startswith("sqlite"):
            # Refresh pooled connections before the hosted database can
            # suspend them (Neon pauses idle compute after ~5 minutes).
            engine_kwargs.setdefault("pool_recycle", 240)
        self.engine.dispose()
        self.engine = sa.create_engine(engine_url, **engine_kwargs)
        self.sessionmaker = sa.orm.sessionmaker(bind=self.engine)
        self.Base.metadata.create_all(self.engine)

        logger.info(
            "Conversation logging: trackers are stored in %s", describe_url(engine_url)
        )
