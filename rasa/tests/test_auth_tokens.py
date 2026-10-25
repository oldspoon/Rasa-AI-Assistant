"""Login tokens and the chat webhook's sender rules. No servers needed."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from sanic.exceptions import SanicException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import auth_channel  # noqa: E402

ALICE = {"first_name": "Alice", "last_name": "Johnson"}
BOB = {"first_name": "Bob", "last_name": "Smith"}


def request(token=None, sender="abc123", metadata=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return SimpleNamespace(headers=headers, json={"sender": sender, "metadata": metadata})


def extract(req):
    return asyncio.run(auth_channel.StudentRestInput()._extract_sender(req))


class TestTokens:
    def test_a_fresh_token_names_the_student(self):
        payload = auth_channel.verify_token(auth_channel.issue_token("Alice Johnson", ALICE))
        assert (payload["u"], payload["f"], payload["l"]) == ("alicejohnson", "Alice", "Johnson")

    def test_a_changed_payload_is_rejected(self):
        token = auth_channel.issue_token("bobsmith", BOB)
        _body, signature = token.split(".")
        forged = auth_channel.issue_token("alicejohnson", ALICE).split(".")[0]
        assert auth_channel.verify_token(f"{forged}.{signature}") is None

    def test_an_expired_token_is_rejected(self):
        token = auth_channel.issue_token("alicejohnson", ALICE, now=0)
        assert auth_channel.verify_token(token) is None

    @pytest.mark.parametrize("junk", [None, "", "abc", "a.b", "a.b.c", 42])
    def test_junk_is_rejected(self, junk):
        assert auth_channel.verify_token(junk) is None


class TestSignOff:
    def test_a_signed_off_token_stops_working(self):
        token = auth_channel.issue_token("alicejohnson", ALICE)
        assert auth_channel.revoke_token(token) is True
        assert auth_channel.verify_token(token) is None

    def test_signing_off_one_login_leaves_the_others(self):
        alice = auth_channel.issue_token("alicejohnson", ALICE)
        bob = auth_channel.issue_token("bobsmith", BOB)
        auth_channel.revoke_token(alice)
        assert auth_channel.verify_token(bob) is not None

    def test_a_forged_or_repeated_sign_off_is_refused(self):
        assert auth_channel.revoke_token("forged.token") is False
        token = auth_channel.issue_token("alicejohnson", ALICE)
        auth_channel.revoke_token(token)
        assert auth_channel.revoke_token(token) is False

    def test_a_signed_off_token_is_refused_by_the_webhook(self, monkeypatch):
        monkeypatch.delenv("RASA_ALLOW_ANONYMOUS", raising=False)
        token = auth_channel.issue_token("alicejohnson", ALICE)
        auth_channel.revoke_token(token)
        with pytest.raises(SanicException):
            extract(request(token))


class TestConversationIds:
    def test_the_login_is_the_prefix(self):
        assert auth_channel.conversation_id("Alice Johnson", "abc") == "alicejohnson:abc"

    def test_a_client_cannot_inject_another_prefix(self):
        assert auth_channel.conversation_id("bobsmith", "alicejohnson:abc") == "bobsmith:alicejohnsonabc"

    def test_a_missing_client_id_gets_a_random_one(self):
        first = auth_channel.conversation_id("bobsmith", None)
        assert first.startswith("bobsmith:") and len(first) > len("bobsmith:")


class TestWebhook:
    def test_a_signed_in_student_gets_a_prefixed_conversation(self):
        token = auth_channel.issue_token("alicejohnson", ALICE)
        assert extract(request(token, sender="abc")) == "alicejohnson:abc"

    def test_a_student_cannot_write_into_another_students_conversation(self):
        token = auth_channel.issue_token("bobsmith", BOB)
        assert extract(request(token, sender="alicejohnson:abc")).startswith("bobsmith:")

    def test_no_token_is_refused(self, monkeypatch):
        monkeypatch.delenv("RASA_ALLOW_ANONYMOUS", raising=False)
        with pytest.raises(SanicException) as refused:
            extract(request())
        assert refused.value.status_code == 401

    def test_a_forged_token_is_refused(self, monkeypatch):
        monkeypatch.delenv("RASA_ALLOW_ANONYMOUS", raising=False)
        with pytest.raises(SanicException):
            extract(request("not.a-real-token"))

    def test_local_testing_can_skip_the_token(self, monkeypatch):
        monkeypatch.setenv("RASA_ALLOW_ANONYMOUS", "1")
        assert extract(request(sender="abc")) == "abc"

    def test_the_student_comes_from_the_token_not_the_request(self):
        token = auth_channel.issue_token("alicejohnson", ALICE)
        forged = {"student": {"first_name": "Bob", "last_name": "Smith"}}
        metadata = auth_channel.StudentRestInput().get_metadata(request(token, metadata=forged))
        assert metadata == {"student": ALICE}

    def test_client_metadata_is_dropped_without_a_token(self):
        forged = {"student": {"first_name": "Bob", "last_name": "Smith"}}
        assert auth_channel.StudentRestInput().get_metadata(request(metadata=forged)) is None
