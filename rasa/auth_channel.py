"""
auth_channel.py
Login endpoint on the Rasa server: POST /auth/login.

The React web chat gates the bot behind a student login. Credentials live in
the attendance database (the `users` table - seed it with
`python action_server/database/populate_db.py`):

    username = first name + last name  (e.g. alicejohnson)
    password = last name  + first name (e.g. johnsonalice)

Matching is case-insensitive and ignores whitespace, so "Alice Johnson" /
"Johnson Alice" work too.

How it plugs in
---------------
This is a Rasa *custom input channel*: credentials.yml names the class
(``auth_channel.LoginAuthChannel:``) and Rasa mounts its Sanic blueprint on
the server it already runs, so the endpoint shares the bot's single public
port - locally and in the Docker Space (HF exposes only one port):

    http://localhost:5005/auth/login        (local dev)
    https://<space>.hf.space/auth/login     (hosted)

Request/response:

    POST  {"username": "alicejohnson", "password": "johnsonalice"}
    200   {"ok": true,  "first_name": "Alice", "last_name": "Johnson"}
    400   {"ok": false, "error": "username and password are required"}
    401   {"ok": false, "error": "invalid credentials"}
    503   {"ok": false, "error": "login service unavailable"}

Log lines name the username and the result - never the password. The lookup
goes through the action server's own module (action_server/database/db.py),
so the SQLite/Postgres switch (DATABASE_URL) behaves exactly like the rest
of the project.
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
    """The action server's db.py module (the dual-mode SQLite/Postgres layer)."""
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
    """Normalize a field: drop whitespace, lowercase ('Alice Johnson' -> 'alicejohnson')."""
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
    """Custom channel that adds POST /auth/login to the Rasa server."""

    @classmethod
    def name(cls) -> Text:
        return "login_auth"

    def url_prefix(self) -> Text:
        # An absolute path here replaces Rasa's default '/webhooks/' prefix,
        # so the route lands exactly on /auth/login.
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
            except Exception:  # users table missing, database unreachable, ...
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
