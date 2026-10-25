"""
Dialogue tests: one per story in data/stories/, run against the live servers.
Needs the Rasa server (localhost:5005) and the action server (localhost:5055).
"""
import uuid

import pytest
import requests

RASA_API = "http://localhost:5005"
RASA_WEBHOOK = f"{RASA_API}/webhooks/rest/webhook"
ACTIONS_HEALTH = "http://localhost:5055/health"
TIMEOUT = 30


def _send(sender: str, message: str) -> list:
    """POST one message; return the bot's reply texts."""
    response = requests.post(
        RASA_WEBHOOK, json={"sender": sender, "message": message}, timeout=TIMEOUT
    )
    response.raise_for_status()
    return [msg.get("text", "") for msg in response.json()]


def converse(prompts: list) -> list:
    """Start a fresh conversation; replies grouped per turn."""
    sender = f"pytest-{uuid.uuid4().hex}"
    return [_send(sender, prompt) for prompt in prompts]


def assert_reply(turns: list, turn: int, *expected: str) -> None:
    """Fail unless each expected substring is in that turn."""
    text = "\n".join(turns[turn])
    missing = [fragment for fragment in expected if fragment not in text]
    assert not missing, (
        f"turn {turn + 1} reply is missing {missing}\n"
        f"(expected substrings: {list(expected)})\n"
        f"actual reply:\n{text}"
    )


@pytest.fixture(scope="session", autouse=True)
def _servers_must_be_running() -> None:
    """Fail fast if a server is down."""
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
                "  cd action_server && ./dev-run.sh -r\n"
                "  cd rasa         && ./dev-run.sh -r"
            )


# One test per story in data/stories/, in directory order.


def test_ask_both_lecture_and_practical_days() -> None:
    """Story: `ask both lecture and practical days`."""
    turns = converse(
        ["I'm Mia Thomas", "What days do I have lectures?",
         "What days do I have practicals?"]
    )
    assert_reply(turns, 0, "found your record, Mia Thomas")
    assert_reply(turns, 1, "Lecture", "Wednesday")
    assert_reply(turns, 2, "Practical", "Friday")


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
    assert_reply(turns, 3, "14:00-16:00", "11:00-13:00")
    assert_reply(turns, 4, "D75", "A94")
    assert_reply(turns, 5, "Bob Smith", "Sighthill", "Computing", "Lecture",
                 "Thursday", "14:00-16:00", "D75", "Practical", "Tuesday",
                 "11:00-13:00", "A94")
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
    assert_reply(turns, 3, "12:00-14:00", "15:00-17:00")
    assert_reply(turns, 4, "F69", "D10", "Merchiston")
    assert_reply(turns, 5, "Goodbye")


def test_direct_intro_no_greet() -> None:
    """Story: `direct intro no greet` (Liam)."""
    turns = converse(
        ["I'm Liam Anderson", "Which campus am I at?",
         "What time is my session?", "What room am I in?"]
    )
    assert_reply(turns, 0, "found your record, Liam Anderson")
    assert_reply(turns, 1, "Liam", "Merchiston")
    assert_reply(turns, 2, "12:00-14:00", "15:00-17:00")
    assert_reply(turns, 3, "C05", "E03", "Merchiston")


def test_explain_the_bot() -> None:
    """Story: `explain the bot`."""
    turns = converse(["What can you do?"])
    assert_reply(turns, 0, "Campus Attendance Assistant", "lecture or practical days",
                 "first and last name")


def test_full_multi_turn_conversation() -> None:
    """Story: `full multi-turn conversation` (Henry)."""
    turns = converse(
        ["Hi", "I'm Henry Davis", "What days do I have lectures?",
         "Which campus am I at?", "What time is my session?",
         "What subject do I have?", "What room am I in?",
         "Give me all my details", "Goodbye"]
    )
    assert_reply(turns, 1, "found your record, Henry Davis")
    assert_reply(turns, 2, "Lecture", "Friday")
    assert_reply(turns, 3, "Sighthill")
    assert_reply(turns, 4, "14:00-16:00", "11:00-13:00")
    assert_reply(turns, 5, "Computing")
    assert_reply(turns, 6, "C13", "E54")
    assert_reply(turns, 7, "Henry Davis", "Sighthill", "Computing", "Lecture",
                 "Friday", "14:00-16:00", "C13", "Practical", "Wednesday",
                 "11:00-13:00", "E54")
    assert_reply(turns, 8, "Goodbye")


def test_greet_then_introduce_and_check_all() -> None:
    """Story: `greet then introduce and check all` (Katie)."""
    turns = converse(
        ["Hi", "I'm Katie Taylor", "Give me all my details", "Goodbye"]
    )
    assert_reply(turns, 1, "found your record, Katie Taylor")
    assert_reply(turns, 2, "Katie Taylor", "Sighthill", "Computing", "Lecture",
                 "Monday", "14:00-16:00", "B64", "Practical", "Wednesday",
                 "11:00-13:00", "C77")
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
    assert_reply(turns, 4, "E25", "F58", "Craiglockhart")
    assert_reply(turns, 5, "Goodbye")


def test_student_asks_all_details_after_intro() -> None:
    """Story: `student asks all details after intro` (Carol)."""
    turns = converse(["I'm Carol Williams", "Give me all my details"])
    assert_reply(turns, 0, "found your record, Carol Williams")
    assert_reply(turns, 1, "Carol Williams", "Merchiston", "Biology", "Lecture",
                 "Wednesday", "12:00-14:00", "C31", "Practical", "Friday",
                 "15:00-17:00", "C00")


def test_student_asks_campus_after_intro() -> None:
    """Story: `student asks campus after intro` (David)."""
    turns = converse(["I'm David Brown", "Which campus am I at?"])
    assert_reply(turns, 0, "found your record, David Brown")
    assert_reply(turns, 1, "David", "Craiglockhart")


def test_student_asks_practical_then_full_details() -> None:
    """Story: `student asks practical then full details` (Isabella)."""
    turns = converse(
        ["Hi", "I'm Isabella Wilson", "What days do I have practicals?",
         "Give me all my details", "Goodbye"]
    )
    assert_reply(turns, 1, "found your record, Isabella Wilson")
    assert_reply(turns, 2, "Practical", "Monday")
    assert_reply(turns, 3, "Isabella Wilson", "Merchiston", "Biology", "Lecture",
                 "Thursday", "12:00-14:00", "A03", "Practical", "Monday",
                 "15:00-17:00", "A48")
    assert_reply(turns, 4, "Goodbye")


def test_student_asks_room_after_intro() -> None:
    """Story: `student asks room after intro` (Grace)."""
    turns = converse(["I'm Grace Miller", "What room am I in?"])
    assert_reply(turns, 0, "found your record, Grace Miller")
    assert_reply(turns, 1, "Grace", "E11", "B97", "Craiglockhart")


def test_student_asks_subject_after_intro() -> None:
    """Story: `student asks subject after intro` (Frank)."""
    turns = converse(["I'm Frank Garcia", "What subject do I have?"])
    assert_reply(turns, 0, "found your record, Frank Garcia")
    assert_reply(turns, 1, "Frank", "Biology")


def test_student_asks_time_after_intro() -> None:
    """Story: `student asks time after intro` (Emma)."""
    turns = converse(["I'm Emma Jones", "What time is my session?"])
    assert_reply(turns, 0, "found your record, Emma Jones")
    assert_reply(turns, 1, "Emma", "Lecture", "Friday", "14:00-16:00",
                 "Practical", "Tuesday", "11:00-13:00")


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
    assert_reply(turns, 1, "Jack Moore", "Craiglockhart", "Fine Arts", "Lecture",
                 "Tuesday", "10:00-12:00", "A45", "Practical", "Friday",
                 "13:00-15:00", "A27")


# Parking arrears stories.


def test_student_checks_parking_arrears() -> None:
    """Story: `student checks parking arrears` (Alice)."""
    turns = converse(["I'm Alice Johnson", "Do I have any parking arrears?"])
    assert_reply(turns, 1, "LB21 XQT", "14 October 2026", "09:32", "£60.00",
                 "Craiglockhart campus grounds", "14 November 2026",
                 "charges start to accrue")


def test_parking_arrears_reply_offers_two_buttons() -> None:
    """The arrears reply carries a phone button and an InfoDesk button."""
    sender = f"pytest-{uuid.uuid4().hex}"
    _send(sender, "I'm Alice Johnson")
    response = requests.post(
        RASA_WEBHOOK,
        json={"sender": sender, "message": "Do I have any parking arrears?"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    buttons = [b for msg in response.json() for b in msg.get("buttons", [])]
    assert [b["payload"] for b in buttons] == ["/pay_by_phone", "/pay_at_infodesk"]
    assert [b["title"] for b in buttons] == ["Pay by phone", "Visit the InfoDesk"]


def test_student_pays_arrears_by_phone() -> None:
    """Story: `student pays arrears by phone` (Carol)."""
    turns = converse(["I'm Carol Williams", "Do I have any parking arrears?",
                      "/pay_by_phone"])
    assert_reply(turns, 1, "SK19 DPN", "Merchiston campus grounds")
    assert_reply(turns, 2, "020 7946 0321")


def test_student_pays_arrears_at_infodesk() -> None:
    """Story: `student pays arrears at infodesk` (Emma)."""
    turns = converse(["I'm Emma Jones", "Do I have any parking arrears?",
                      "/pay_at_infodesk"])
    assert_reply(turns, 1, "YH70 RMV", "Sighthill campus grounds")
    assert_reply(turns, 2, "InfoDesk")


def test_student_without_parking_arrears() -> None:
    """Story: `student without parking arrears` (Bob)."""
    turns = converse(["I'm Bob Smith", "Do I have any parking arrears?"])
    assert_reply(turns, 1, "no parking arrears")


def test_student_asks_parking_without_intro() -> None:
    """Story: `student asks parking without intro` (guard reaction)."""
    turns = converse(["Do I have any parking arrears?"])
    assert_reply(turns, 0, "introduce yourself")


def test_typed_payment_choices_work_too() -> None:
    """Typing the choice instead of clicking a button gives the same answers."""
    turns = converse(["I want to pay by phone", "I will pay at the InfoDesk"])
    assert_reply(turns, 0, "020 7946 0321")
    assert_reply(turns, 1, "InfoDesk")
