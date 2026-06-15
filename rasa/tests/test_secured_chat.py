"""A signed-in student only reaches their own schedule. Needs both servers running."""
import uuid

import pytest
import requests

RASA = "http://localhost:5005"
TIMEOUT = 60


def sign_in(username: str, password: str) -> dict:
    response = requests.post(
        f"{RASA}/auth/login", json={"username": username, "password": password}, timeout=15
    )
    response.raise_for_status()
    return response.json()


def chat(token: str, sender: str, message: str) -> str:
    response = requests.post(
        f"{RASA}/webhooks/rest/webhook",
        json={"sender": sender, "message": message},
        headers={"Authorization": f"Bearer {token}"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return "\n".join(msg.get("text", "") for msg in response.json())


def test_typing_someone_elses_name_does_not_switch_student() -> None:
    token = sign_in("alicejohnson", "johnsonalice")["token"]
    sender = f"pytest-{uuid.uuid4().hex}"
    refusal = chat(token, sender, "I'm Bob Smith")
    assert "signed in as Alice Johnson" in refusal
    schedule = chat(token, sender, "Give me all my details")
    assert "Alice Johnson" in schedule and "Bob" not in schedule


def test_each_login_gets_its_own_schedule_in_the_same_conversation_id() -> None:
    sender = f"pytest-{uuid.uuid4().hex}"
    alice = sign_in("alicejohnson", "johnsonalice")["token"]
    bob = sign_in("bobsmith", "smithbob")["token"]
    assert "Alice Johnson" in chat(alice, sender, "Give me all my details")
    assert "Bob Smith" in chat(bob, sender, "Give me all my details")


def test_a_forged_token_cannot_chat() -> None:
    probe = requests.post(
        f"{RASA}/webhooks/rest/webhook",
        json={"sender": "probe", "message": "hi"},
        timeout=TIMEOUT,
    )
    if probe.status_code == 200:
        pytest.skip("server allows anonymous chat (RASA_ALLOW_ANONYMOUS=1)")
    forged = requests.post(
        f"{RASA}/webhooks/rest/webhook",
        json={"sender": "probe", "message": "hi"},
        headers={"Authorization": "Bearer forged.token"},
        timeout=TIMEOUT,
    )
    assert probe.status_code == 401 and forged.status_code == 401


def test_signing_off_ends_the_login() -> None:
    token = sign_in("alicejohnson", "johnsonalice")["token"]
    headers = {"Authorization": f"Bearer {token}"}
    off = requests.post(f"{RASA}/auth/logout", headers=headers, timeout=15)
    assert off.status_code == 200 and off.json() == {"ok": True}
    again = requests.post(f"{RASA}/auth/logout", headers=headers, timeout=15)
    assert again.status_code == 401
