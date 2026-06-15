"""
Login endpoint tests (POST /auth/login). Needs the Rasa server on localhost:5005.
"""
import pytest
import requests

LOGIN_URL = "http://localhost:5005/auth/login"
TIMEOUT = 15


def _login(username: str, password: str) -> requests.Response:
    return requests.post(
        LOGIN_URL, json={"username": username, "password": password}, timeout=TIMEOUT
    )


@pytest.fixture(scope="session", autouse=True)
def _rasa_must_be_running() -> None:
    """Fail fast if the bot is down."""
    try:
        requests.get("http://localhost:5005/", timeout=5).raise_for_status()
    except requests.RequestException:
        pytest.fail(
            "Rasa server is not reachable at http://localhost:5005/.\n"
            "Start it before running the login tests:\n"
            "  cd rasa && ./dev-run.sh -r"
        )


def test_lowercase_credentials_are_accepted() -> None:
    """alicejohnson / johnsonalice signs Alice Johnson in."""
    response = _login("alicejohnson", "johnsonalice")
    assert response.status_code == 200
    body = response.json()
    assert body.pop("token")
    assert body == {
        "ok": True,
        "first_name": "Alice",
        "last_name": "Johnson",
    }


def test_case_and_spaces_are_ignored() -> None:
    """Spaces and letter case are ignored."""
    response = _login("Alice Johnson", "Johnson Alice")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert (body["first_name"], body["last_name"]) == ("Alice", "Johnson")


def test_another_seeded_student() -> None:
    """A different student: noahjackson / jacksonnoah."""
    response = _login("noahjackson", "jacksonnoah")
    assert response.status_code == 200
    body = response.json()
    assert (body["first_name"], body["last_name"]) == ("Noah", "Jackson")


def test_wrong_password_is_rejected() -> None:
    response = _login("alicejohnson", "notmypassword")
    assert response.status_code == 401
    assert response.json()["ok"] is False


def test_unknown_student_is_rejected() -> None:
    response = _login("johnsmith", "smithjohn")
    assert response.status_code == 401
    assert response.json()["ok"] is False


def test_missing_fields_are_rejected() -> None:
    response = _login("alicejohnson", "")
    assert response.status_code == 400
    assert response.json()["ok"] is False
