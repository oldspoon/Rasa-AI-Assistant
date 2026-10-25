"""Dialogue tests - one per story in ``data/stories/`` (19 total).

Each test replays a minimal user script against the live bot over the Rasa
REST webhook (http://localhost:5005) and checks the key facts in the replies.
The custom actions that read the SQLite database run in the action server
(http://localhost:5055), so BOTH servers must be running.

Run from this folder (``rasa/``):

    ..\\venv\\Scripts\\python.exe -m pytest tests\\test_dialogues.py -v

Expected result: 19 passed.
"""
import uuid

import pytest
import requests

RASA_API = "http://localhost:5005"
RASA_WEBHOOK = f"{RASA_API}/webhooks/rest/webhook"
ACTIONS_HEALTH = "http://localhost:5055/health"
TIMEOUT = 30


def _send(sender: str, message: str) -> list:
    """POST one user message; return the bot's reply texts for that turn."""
    response = requests.post(
        RASA_WEBHOOK, json={"sender": sender, "message": message}, timeout=TIMEOUT
    )
    response.raise_for_status()
    return [msg.get("text", "") for msg in response.json()]


def converse(prompts: list) -> list:
    """Run a fresh conversation (unique sender); replies grouped per turn."""
    sender = f"pytest-{uuid.uuid4().hex}"
    return [_send(sender, prompt) for prompt in prompts]


def assert_reply(turns: list, turn: int, *expected: str) -> None:
    """Fail unless every expected substring shows up in that turn's reply."""
    text = "\n".join(turns[turn])
    missing = [fragment for fragment in expected if fragment not in text]
    assert not missing, (
        f"turn {turn + 1} reply is missing {missing}\n"
        f"(expected substrings: {list(expected)})\n"
        f"actual reply:\n{text}"
    )


@pytest.fixture(scope="session", autouse=True)
def _servers_must_be_running() -> None:
    """Fail fast with instructions if the bot or the action server is down."""
    for label, url in (
        ("Rasa server (REST API)", f"{RASA_API}/"),
        ("action server", ACTIONS_HEALTH),
    ):
        try:
            requests.get(url, timeout=5).raise_for_status()
        except requests.RequestException:
            pytest.fail(
                f"{label} is not reachable at {url}.\n"
                "Start both servers before running the dialogue tests:\n"
                "  cd action_server && ./dev-run.sh -r   (or .\\dev-run.ps1 -r)\n"
                "  cd rasa         && ./dev-run.sh -r"
            )


# --------------------------------------------------------------------------
# One test per file in data/stories/ - same order as the directory listing.
# --------------------------------------------------------------------------


def test_ask_both_lecture_and_practical_days() -> None:
    """Story: `ask both lecture and practical days`."""
    turns = converse(
        ["I'm Mia Thomas", "What days do I have lectures?",
         "What days do I have practicals?"]
    )
    assert_reply(turns, 0, "found your record, Mia Thomas")
    assert_reply(turns, 1, "Lecture", "Wednesday")
    assert_reply(turns, 2, "do not have any practical sessions", "Wednesday")


def test_complete_practical_session_with_all_details() -> None:
    """Story: `complete practical session with all details` (Bob)."""
    turns = converse(
        ["I'm Bob Smith", "What days do I have practicals?",
         "Which campus am I at?", "What time is my session?",
         "What room am I in?", "Give me all my details", "Goodbye"]
    )
    assert_reply(turns, 0, "found your record, Bob Smith")
    assert_reply(turns, 1, "Practical", "Tuesday")
    assert_reply(turns, 2, "Sighthill")
    assert_reply(turns, 3, "11:00-13:00")
    assert_reply(turns, 4, "A94")
    assert_reply(turns, 5, "Bob Smith", "Tuesday", "Sighthill", "Practical",
                 "11:00-13:00", "Computing", "A94")
    assert_reply(turns, 6, "Goodbye")


def test_complete_session_noah() -> None:
    """Story: `complete session Noah`."""
    turns = converse(
        ["Hi", "I'm Noah Jackson", "What days do I have practicals?",
         "What subject do I have?", "Which campus am I at?", "Goodbye"]
    )
    assert_reply(turns, 1, "found your record, Noah Jackson")
    assert_reply(turns, 2, "Practical", "Thursday")
    assert_reply(turns, 3, "Computing")
    assert_reply(turns, 4, "Sighthill")
    assert_reply(turns, 5, "Goodbye")


def test_complete_session_olivia() -> None:
    """Story: `complete session Olivia`."""
    turns = converse(
        ["Hi", "I'm Olivia White", "What days do I have lectures?",
         "What time is my session?", "What room am I in?", "Goodbye"]
    )
    assert_reply(turns, 1, "found your record, Olivia White")
    assert_reply(turns, 2, "Lecture", "Friday")
    assert_reply(turns, 3, "12:00-14:00")
    assert_reply(turns, 4, "F69", "Merchiston")
    assert_reply(turns, 5, "Goodbye")


def test_direct_intro_no_greet() -> None:
    """Story: `direct intro no greet` (Liam)."""
    turns = converse(
        ["I'm Liam Anderson", "Which campus am I at?",
         "What time is my session?", "What room am I in?"]
    )
    assert_reply(turns, 0, "found your record, Liam Anderson")
    assert_reply(turns, 1, "Liam", "Tuesday", "Merchiston")
    assert_reply(turns, 2, "15:00-17:00")
    assert_reply(turns, 3, "E03", "Merchiston")


def test_full_multi_turn_conversation() -> None:
    """Story: `full multi-turn conversation` (Henry)."""
    turns = converse(
        ["Hi", "I'm Henry Davis", "What days do I have lectures?",
         "Which campus am I at?", "What time is my session?",
         "What subject do I have?", "What room am I in?",
         "Give me all my details", "Goodbye"]
    )
    assert_reply(turns, 1, "found your record, Henry Davis")
    assert_reply(turns, 2, "do not have any lecture sessions", "Wednesday",
                 "Practical")
    assert_reply(turns, 3, "Sighthill")
    assert_reply(turns, 4, "11:00-13:00")
    assert_reply(turns, 5, "Computing")
    assert_reply(turns, 6, "E54")
    assert_reply(turns, 7, "Henry Davis", "Wednesday", "Sighthill", "Practical",
                 "11:00-13:00", "Computing", "E54")
    assert_reply(turns, 8, "Goodbye")


def test_greet_then_introduce_and_check_all() -> None:
    """Story: `greet then introduce and check all` (Katie)."""
    turns = converse(
        ["Hi", "I'm Katie Taylor", "Give me all my details", "Goodbye"]
    )
    assert_reply(turns, 1, "found your record, Katie Taylor")
    assert_reply(turns, 2, "Katie Taylor", "Monday", "Sighthill", "Lecture",
                 "14:00-16:00", "Computing", "B64")
    assert_reply(turns, 3, "Goodbye")


def test_out_of_scope_question() -> None:
    """Story: `out of scope question`."""
    turns = converse(["Tell me a joke"])
    assert_reply(turns, 0, "only help with campus attendance")


def test_retry_after_unknown_student() -> None:
    """Story: `retry after unknown student` (John Doe, then Mia)."""
    turns = converse(
        ["Hi", "I'm John Doe", "I'm Mia Thomas", "What days do I have lectures?",
         "What room am I in?", "Goodbye"]
    )
    assert_reply(turns, 1, "couldn't find a student with the name John Doe")
    assert_reply(turns, 2, "found your record, Mia Thomas")
    assert_reply(turns, 3, "Wednesday")
    assert_reply(turns, 4, "E25", "Craiglockhart")
    assert_reply(turns, 5, "Goodbye")


def test_student_asks_all_details_after_intro() -> None:
    """Story: `student asks all details after intro` (Carol)."""
    turns = converse(["I'm Carol Williams", "Give me all my details"])
    assert_reply(turns, 0, "found your record, Carol Williams")
    assert_reply(turns, 1, "Carol Williams", "Wednesday", "Merchiston", "Lecture",
                 "12:00-14:00", "Biology", "C31")


def test_student_asks_campus_after_intro() -> None:
    """Story: `student asks campus after intro` (David)."""
    turns = converse(["I'm David Brown", "Which campus am I at?"])
    assert_reply(turns, 0, "found your record, David Brown")
    assert_reply(turns, 1, "David", "Thursday", "Craiglockhart")


def test_student_asks_practical_then_full_details() -> None:
    """Story: `student asks practical then full details` (Isabella)."""
    turns = converse(
        ["Hi", "I'm Isabella Wilson", "What days do I have practicals?",
         "Give me all my details", "Goodbye"]
    )
    assert_reply(turns, 1, "found your record, Isabella Wilson")
    assert_reply(turns, 2, "do not have any practical sessions", "Thursday",
                 "Lecture")
    assert_reply(turns, 3, "Isabella Wilson", "Thursday", "Merchiston", "Lecture",
                 "12:00-14:00", "Biology", "A03")
    assert_reply(turns, 4, "Goodbye")


def test_student_asks_room_after_intro() -> None:
    """Story: `student asks room after intro` (Grace)."""
    turns = converse(["I'm Grace Miller", "What room am I in?"])
    assert_reply(turns, 0, "found your record, Grace Miller")
    assert_reply(turns, 1, "Grace", "E11", "Craiglockhart")


def test_student_asks_subject_after_intro() -> None:
    """Story: `student asks subject after intro` (Frank)."""
    turns = converse(["I'm Frank Garcia", "What subject do I have?"])
    assert_reply(turns, 0, "found your record, Frank Garcia")
    assert_reply(turns, 1, "Frank", "Monday", "Biology")


def test_student_asks_time_after_intro() -> None:
    """Story: `student asks time after intro` (Emma)."""
    turns = converse(["I'm Emma Jones", "What time is my session?"])
    assert_reply(turns, 0, "found your record, Emma Jones")
    assert_reply(turns, 1, "Emma", "Lecture", "Friday", "14:00-16:00")


def test_student_asks_without_intro() -> None:
    """Story: `student asks without intro` (guard reaction)."""
    turns = converse(["What days do I have lectures?"])
    assert_reply(turns, 0, "don't have your information yet", "introduce yourself")


def test_student_checks_lecture_days() -> None:
    """Story: `student checks lecture days` (Alice)."""
    turns = converse(["Hi", "I'm Alice Johnson", "What days do I have lectures?"])
    assert_reply(turns, 1, "found your record, Alice Johnson")
    assert_reply(turns, 2, "Lecture", "Monday")


def test_student_checks_practical_days() -> None:
    """Story: `student checks practical days` (Bob)."""
    turns = converse(["Hi", "I'm Bob Smith", "What days do I have practicals?"])
    assert_reply(turns, 1, "found your record, Bob Smith")
    assert_reply(turns, 2, "Practical", "Tuesday")


def test_student_introduces_then_asks_schedule() -> None:
    """Story: `student introduces then asks schedule` (Jack)."""
    turns = converse(["I'm Jack Moore", "Give me all my details"])
    assert_reply(turns, 0, "found your record, Jack Moore")
    assert_reply(turns, 1, "Jack Moore", "Friday", "Craiglockhart", "Practical",
                 "13:00-15:00", "Fine Arts", "A27")
