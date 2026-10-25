"""
Conversation-logging tracker store. Keeps every conversation keyed by its UUID.

Store URL: RASA_TRACKER_STORE_URL, else the local SQLite file logs/trackers.db.
Hosted Neon connections use pool_pre_ping, so suspended databases reconnect.
"""

import logging
import os
from pathlib import Path

import sqlalchemy as sa

from rasa.core.tracker_store import SQLTrackerStore, create_engine_kwargs

logger = logging.getLogger(__name__)

_ENV_VAR = "RASA_TRACKER_STORE_URL"


def _default_sqlite_url() -> str:
    """Local store: logs/trackers.db next to this module."""
    db_file = Path(__file__).resolve().parent / "logs" / "trackers.db"
    return "sqlite:///" + db_file.as_posix()


def resolve_store_url() -> str:
    """The SQLAlchemy URL the store should use."""
    url = (os.environ.get(_ENV_VAR) or "").strip().strip('"').strip("'")
    if not url:
        return _default_sqlite_url()
    if url.startswith("postgres://"):
        # SQLAlchemy needs the postgresql:// dialect name.
        url = "postgresql://" + url[len("postgres://"):]
    return url


def describe_url(url) -> str:
    """URL with the password removed, safe for logs."""
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
    """SQLTrackerStore keyed by conversation UUID."""

    def __init__(self, domain=None, event_broker=None, host=None, url=None, **kwargs):
        # Order: endpoints.yml url, then env var, then local file.
        url = (url or host or "").strip() or resolve_store_url()

        # Create the SQLite folder first; the store retries forever otherwise.
        sqlite_file = _sqlite_path(url)
        if sqlite_file:
            Path(sqlite_file).expanduser().resolve().parent.mkdir(
                parents=True, exist_ok=True
            )

        super().__init__(domain=domain, event_broker=event_broker, host=url, **kwargs)

        # Rebuild the engine with a self-healing pool.
        engine_url = self.engine.url
        engine_kwargs = dict(create_engine_kwargs(engine_url))
        engine_kwargs["pool_pre_ping"] = True
        if not str(engine_url).startswith("sqlite"):
            # Refresh pooled connections before Neon suspends them.
            engine_kwargs.setdefault("pool_recycle", 240)
        self.engine.dispose()
        self.engine = sa.create_engine(engine_url, **engine_kwargs)
        self.sessionmaker = sa.orm.sessionmaker(bind=self.engine)
        self.Base.metadata.create_all(self.engine)

        logger.info(
            "Conversation logging: trackers are stored in %s", describe_url(engine_url)
        )
