"""
Login endpoint on the Rasa server (POST /auth/login), used by the web chat,
and the chat webhook that only accepts that login.

Credentials are checked against the users table. Matching ignores case and spaces.
Responses: 200 ok (with a signed token), 400 missing fields, 401 bad credentials,
503 database down. Passwords are never logged. POST /auth/logout revokes the token.

The chat webhook needs the token (Authorization: Bearer). The student comes from
the token, never from the message, and every conversation id is prefixed with the
login, so nobody can read or write another student's conversation.
RASA_ALLOW_ANONYMOUS=1 reopens the webhook without a token, for local testing.
"""

import base64
import hashlib
import hmac
import importlib.util
import json
import logging
import os
import re
import secrets
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional, Text

from sanic import Blueprint, response
from sanic.exceptions import SanicException
from sanic.request import Request
from sanic.response import HTTPResponse

from rasa.core.channels.channel import InputChannel, UserMessage
from rasa.core.channels.rest import RestInput

logger = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 12 * 60 * 60
_generated_secret: Optional[bytes] = None
# Signed-off tokens (signature -> expiry). Forgotten on restart; a token then lasts to its expiry.
_revoked: Dict[str, int] = {}

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


def _secret() -> bytes:
    """AUTH_SECRET, else a random key that lasts until the server restarts."""
    global _generated_secret
    configured = (os.environ.get("AUTH_SECRET") or "").strip()
    if configured:
        return configured.encode()
    if _generated_secret is None:
        _generated_secret = secrets.token_bytes(32)
        logger.warning("AUTH_SECRET is not set: logins expire when the server restarts")
    return _generated_secret


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _sign(body: str) -> str:
    return _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())


def issue_token(username: Text, student: Dict[Text, Text], now: Optional[float] = None) -> Text:
    """A signed, expiring proof that this login belongs to this student."""
    payload = {
        "u": _clean(username),
        "f": student["first_name"],
        "l": student["last_name"],
        "exp": int((time.time() if now is None else now) + TOKEN_TTL_SECONDS),
        "n": secrets.token_hex(8),  # one token per login, so signing one off leaves the others
    }
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{body}.{_sign(body)}"


def verify_token(token: Any, now: Optional[float] = None) -> Optional[Dict[Text, Any]]:
    """The token's payload, or None if it is forged, malformed or expired."""
    try:
        body, signature = str(token).split(".")
        if not hmac.compare_digest(signature, _sign(body)) or signature in _revoked:
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if payload["exp"] < (time.time() if now is None else now):
            return None
        return payload if payload["u"] and payload["f"] and payload["l"] else None
    except Exception:
        return None


def revoke_token(token: Any, now: Optional[float] = None) -> bool:
    """Sign a token off for good. False if it was not a valid token."""
    payload = verify_token(token, now)
    if payload is None:
        return False
    current = time.time() if now is None else now
    for signature in [s for s, exp in _revoked.items() if exp < current]:
        del _revoked[signature]
    _revoked[str(token).split(".")[1]] = payload["exp"]
    return True


def bearer_token(request: Request) -> Text:
    """The token from an 'Authorization: Bearer ...' header, else ''."""
    scheme, _, token = (request.headers.get("Authorization") or "").partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""


def conversation_id(username: Text, client_id: Any) -> Text:
    """'<login>:<client id>': the login prefix is what keeps conversations apart."""
    safe = re.sub(r"[^A-Za-z0-9_-]", "", str(client_id or ""))[:64] or uuid.uuid4().hex
    return f"{_clean(username)}:{safe}"


class StudentRestInput(RestInput):
    """REST chat webhook (/webhooks/rest/webhook) that requires a login token."""

    @classmethod
    def name(cls) -> Text:
        return "rest"

    @staticmethod
    def _allow_anonymous() -> bool:
        return os.environ.get("RASA_ALLOW_ANONYMOUS") == "1"

    @staticmethod
    def _student(request: Request) -> Optional[Dict[Text, Any]]:
        return verify_token(bearer_token(request))

    async def _extract_sender(self, req: Request) -> Optional[Text]:
        client_id = await super()._extract_sender(req)
        student = self._student(req)
        if student is not None:
            return conversation_id(student["u"], client_id)
        if self._allow_anonymous():
            return client_id
        raise SanicException("Sign in to chat.", status_code=401)

    def get_metadata(self, request: Request) -> Optional[Dict[Text, Any]]:
        """The signed-in student, for the actions. Client-sent metadata is ignored."""
        student = self._student(request)
        if student is None:
            return None
        return {
            "student": {"first_name": student["f"], "last_name": student["l"]},
        }


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
            return response.json(
                {"ok": True, **student, "token": issue_token(username, student)}
            )

        @login_blueprint.route("/logout", methods=["POST"])
        async def logout(request: Request) -> HTTPResponse:
            signed_off = revoke_token(bearer_token(request))
            logger.info("logout result=%s", "ok" if signed_off else "no valid token")
            return response.json({"ok": signed_off}, status=200 if signed_off else 401)

        return login_blueprint
