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


def test_student_asks_about_their_teacher() -> None:
    """Story: `student asks about their teacher` (Alice)."""
    turns = converse(
        ["I'm Alice Johnson", "Who is my teacher?",
         "Where is my teacher's office?", "When can I visit my teacher?"]
    )
    assert_reply(turns, 0, "found your record, Alice Johnson")
    assert_reply(turns, 1, "Margaret Ellison", "Fine Arts", "C214")
    assert_reply(turns, 2, "C214", "Craiglockhart")
    assert_reply(turns, 3, "Monday", "10:00-12:00", "30 minutes")


def test_booking_prompt_lists_free_hours() -> None:
    """Story: `student books a teacher slot after being asked` (Mia, prompt only)."""
    turns = converse(["I'm Mia Thomas", "I want to book an office hour"])
    assert_reply(turns, 1, "Margaret Ellison", "Tuesday", "14:00-16:00",
                 "Which day and time")


def test_booking_outside_office_hours_is_declined() -> None:
    """Story: `booking outside office hours is declined` (Grace)."""
    turns = converse(["I'm Grace Miller", "Book Friday at 09:30"])
    assert_reply(turns, 1, "only from", "10:00", "12:00")


def _buttons(sender: str, message: str) -> list:
    response = requests.post(
        RASA_WEBHOOK, json={"sender": sender, "message": message}, timeout=TIMEOUT
    )
    response.raise_for_status()
    return [b for msg in response.json() for b in msg.get("buttons", [])]


def test_student_asks_how_to_contact_the_teacher() -> None:
    """Story: `student asks how to contact the teacher` (Alice)."""
    turns = converse(["I'm Alice Johnson", "How can I contact my teacher?"])
    assert_reply(turns, 1, "margaret.ellison@napier.ac.uk", "0131 496 0142",
                 "Microsoft Teams")


def test_student_finds_the_library() -> None:
    """Story: `student finds the library` (Carol)."""
    turns = converse(["I'm Carol Williams", "Where is the library?"])
    assert_reply(turns, 1, "Merchiston Library", "East Wing", "Sighthill Library",
                 "Craiglockhart Library")


def test_library_location_needs_no_introduction() -> None:
    turns = converse(["Where is the library?"])
    assert_reply(turns, 0, "Merchiston Library", "Sighthill Library")


def test_student_is_offered_five_books_for_their_subject() -> None:
    """Story: `student borrows a book digitally` (Bob, recommendations)."""
    sender = f"pytest-{uuid.uuid4().hex}"
    _send(sender, "I'm Bob Smith")
    buttons = _buttons(sender, "Recommend books")
    assert [b["title"] for b in buttons] == [f"Borrow book {n}" for n in range(1, 6)]
    turns = converse(["I'm Bob Smith", "Recommend books"])
    assert_reply(turns, 1, "The C Programming Language", "Computing")


def test_borrowing_without_a_format_offers_two_choices() -> None:
    sender = f"pytest-{uuid.uuid4().hex}"
    _send(sender, "I'm Bob Smith")
    buttons = _buttons(sender, "I want to borrow book 4")
    assert [b["title"] for b in buttons] == ["Borrow digitally", "Collect in person"]


def test_student_borrows_a_book_from_the_buttons() -> None:
    """Story: `student borrows a book in person` (Mia)."""
    turns = converse(
        ["I'm Mia Thomas",
         '/borrow_book{"book": "5", "format": "in person"}',
         "Show my borrowed books"]
    )
    text = "\n".join(turns[1])
    assert "Collection code:** CRA-" in text or "already have" in text
    assert_reply(turns, 2, "The Art of Color", "Return to")


def test_student_checks_book_fines() -> None:
    """Story: `student checks book fines` (Alice)."""
    turns = converse(["I'm Alice Johnson", "Do I have any library fines?"])
    assert_reply(turns, 1, "The Story of Art", "Overdue by", "Fine owed", "Total fines",
                 "for each month")


def test_student_without_book_fines() -> None:
    """Story: `student without book fines` (Frank)."""
    turns = converse(["I'm Frank Garcia", "Show my borrowed books"])
    assert_reply(turns, 1, "no borrowed books")


def test_student_asks_about_borrowed_books_without_intro() -> None:
    turns = converse(["Show my borrowed books"])
    assert_reply(turns, 0, "introduce yourself")


def test_student_sees_support_lectures_with_lab_assistants() -> None:
    """Story: `student books a support lecture` (Bob, listing)."""
    sender = f"pytest-{uuid.uuid4().hex}"
    _send(sender, "I'm Bob Smith")
    buttons = _buttons(sender, "What support lectures are available?")
    assert [b["title"] for b in buttons] == [f"Book session {n}" for n in range(1, 4)]
    turns = converse(["I'm Bob Smith", "What support lectures are available?"])
    assert_reply(turns, 1, "Computing", "C programming lab", "Omar Haddad",
                 "Chloe Bennett", "Seats left")


def test_student_books_a_support_lecture_and_sees_it() -> None:
    """Story: `student books a support lecture` (Bob)."""
    turns = converse(
        ["I'm Bob Smith", "Book support lecture 3", "Show my support lectures"]
    )
    text = "\n".join(turns[1])
    assert "Booked, Bob!" in text or "already have a seat" in text
    assert_reply(turns, 2, "Debugging clinic", "Omar Haddad")


def test_booking_without_a_number_lists_the_sessions() -> None:
    """Story: `student picks a support lecture after being asked` (Mia)."""
    sender = f"pytest-{uuid.uuid4().hex}"
    _send(sender, "I'm Mia Thomas")
    buttons = _buttons(sender, "I want to book a support lecture")
    assert len(buttons) == 3


def test_a_support_lecture_that_clashes_is_refused() -> None:
    turns = converse(["I'm Mia Thomas", "Book support lecture 3"])
    assert_reply(turns, 1, "clashes with your", "Practical")


def test_support_lectures_need_an_introduction() -> None:
    """Story: `student asks about support lectures without introducing`."""
    turns = converse(["What support lectures are available?"])
    assert_reply(turns, 0, "introduce yourself")


def test_student_lists_teacher_and_lab_assistant_appointments() -> None:
    """Story: `student lists their appointments` (Grace)."""
    turns = converse(
        ["I'm Grace Miller", "Book Thursday at 14:00", "Book support lecture 2",
         "Show my appointments"]
    )
    assert_reply(turns, 3, "Teacher visits", "Thursday", "14:00-14:30",
                 "Margaret Ellison", "Lab assistant support lectures",
                 "Drawing techniques lab", "Callum Reid")


def test_student_shows_the_full_timetable() -> None:
    """Story: `student shows the full timetable` (Bob)."""
    turns = converse(["I'm Bob Smith", "Show my timetable"])
    assert_reply(turns, 1, "full timetable", "Bob Smith", "Lecture", "Thursday",
                 "14:00-16:00", "Practical", "Tuesday", "11:00-13:00",
                 "Daniel Fraser", "Appointments")


def test_timetable_needs_an_introduction() -> None:
    """Story: `student asks for the timetable without introducing`."""
    turns = converse(["Show my timetable"])
    assert_reply(turns, 0, "introduce yourself")
