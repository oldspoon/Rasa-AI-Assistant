"""
Login endpoint on the Rasa server (POST /auth/login), used by the web chat.

Credentials are checked against the users table. Matching ignores case and spaces.
Responses: 200 ok, 400 missing fields, 401 bad credentials, 503 database down.
Passwords are never logged.
"""

import importlib.util
import logging
import sys
from pathlib import Path
from typing import Awaitable, Callable, Dict, Optional, Text

from sanic import Blueprint, response
from sanic.request import Request
from sanic.response import HTTPResponse

from rasa.core.channels.channel import InputChannel, UserMessage

logger = logging.getLogger(__name__)

_LOGIN_SQL = """
    SELECT first_name, last_name
    FROM   users
    WHERE  LOWER(username) = LOWER(?)
      AND  LOWER(password) = LOWER(?)
    LIMIT  1
"""

_db_module = None


def _action_server_db():
    """The action server db.py module (SQLite or Postgres)."""
    global _db_module
    if _db_module is None:
        db_file = (
            Path(__file__).resolve().parents[1]
            / "action_server"
            / "database"
            / "db.py"
        )
        spec = importlib.util.spec_from_file_location("attendance_action_db", db_file)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        _db_module = module
        logger.info("Login auth: user lookup goes to %s", module.describe_backend())
    return _db_module


def _clean(value) -> Text:
    """Drop spaces and lowercase: 'Alice Johnson' -> 'alicejohnson'."""
    return "".join(str(value or "").split()).lower()


def authenticate(username, password) -> Optional[Dict[Text, Text]]:
    """Return {"first_name", "last_name"} for valid credentials, else None."""
    username, password = _clean(username), _clean(password)
    if not username or not password:
        return None
    row = _action_server_db().fetch_one(_LOGIN_SQL, (username, password))
    if row is None:
        return None
    return {"first_name": row["first_name"], "last_name": row["last_name"]}


class LoginAuthChannel(InputChannel):
    """Input channel that serves POST /auth/login."""

    @classmethod
    def name(cls) -> Text:
        return "login_auth"

    def url_prefix(self) -> Text:
        # Absolute path: replaces Rasa's '/webhooks/' prefix.
        return "/auth"

    def blueprint(
        self, on_new_message: Callable[[UserMessage], Awaitable[None]]
    ) -> Blueprint:
        login_blueprint = Blueprint("login_auth", __name__)

        @login_blueprint.route("/login", methods=["POST"])
        async def login(request: Request) -> HTTPResponse:
            try:
                payload = request.json or {}
            except Exception:
                payload = {}

            username = payload.get("username")
            password = payload.get("password")
            if not _clean(username) or not _clean(password):
                return response.json(
                    {"ok": False, "error": "username and password are required"},
                    status=400,
                )

            try:
                student = authenticate(username, password)
            except Exception:  # missing table or database down
                logger.exception("Login lookup failed (user=%r)", _clean(username))
                return response.json(
                    {"ok": False, "error": "login service unavailable"}, status=503
                )

            if student is None:
                logger.info("login user=%r result=invalid", _clean(username))
                return response.json(
                    {"ok": False, "error": "invalid credentials"}, status=401
                )

            logger.info(
                "login user=%r result=ok student=%s %s",
                _clean(username),
                student["first_name"],
                student["last_name"],
            )
            return response.json({"ok": True, **student})

        return login_blueprint
