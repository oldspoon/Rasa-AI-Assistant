"""Weekly schedule: wording (actions/schedule.py) and seed rules (database/populate_db.py)."""
import populate_db
from actions import schedule


def sessions():
    return [
        {"session_type": "Lecture", "day_of_week": "Monday", "time_range": "10:00-12:00",
         "room": "F14", "campus": "Craiglockhart", "activity": "Fine Arts"},
        {"session_type": "Practical", "day_of_week": "Wednesday", "time_range": "13:00-15:00",
         "room": "A94", "campus": "Craiglockhart", "activity": "Fine Arts"},
    ]


class TestWording:
    def test_session_of_picks_by_type_whatever_the_order(self):
        assert schedule.session_of(list(reversed(sessions())), "Lecture")["day_of_week"] == "Monday"

    def test_day_message_names_the_type_and_day(self):
        text = schedule.session_day_message("Alice", sessions()[1])
        assert "**Practical** session on **Wednesday**" in text

    def test_time_message_gives_both_sessions(self):
        text = schedule.time_message("Alice", sessions())
        assert "**Lecture** on **Monday** runs from **10:00-12:00**" in text
        assert "**Practical** on **Wednesday** runs from **13:00-15:00**" in text

    def test_room_message_gives_both_rooms_and_the_campus(self):
        text = schedule.room_message("Alice", sessions())
        assert "**F14**" in text and "**A94**" in text and "**Craiglockhart**" in text

    def test_campus_and_subject_are_shared(self):
        assert "**Craiglockhart**" in schedule.campus_message("Alice", sessions())
        assert "**Fine Arts**" in schedule.subject_message("Alice", sessions())

    def test_full_schedule_lists_lecture_then_practical(self):
        header, body, closing = schedule.full_schedule_parts("Alice", "Johnson", sessions())
        assert "**Alice Johnson**" in header
        assert body.index("**Lecture**") < body.index("**Practical**")
        assert closing.startswith("Is there anything else")


class TestSeedData:
    def rows(self):
        return populate_db.session_rows()

    def test_every_student_has_one_lecture_and_one_practical(self):
        by_student = {}
        for first, _middle, last, _campus, kind, *_ in self.rows():
            by_student.setdefault((first, last), []).append(kind)
        assert len(by_student) == len(populate_db.STUDENTS)
        assert all(kinds == ["Lecture", "Practical"] for kinds in by_student.values())

    def test_the_two_sessions_are_on_different_days_at_one_campus(self):
        rows = self.rows()
        for lecture, practical in zip(rows[0::2], rows[1::2]):
            assert lecture[5] != practical[5]
            assert lecture[3] == practical[3]

    def test_first_sessions_keep_their_original_room(self):
        alice = self.rows()[0:2]
        assert {r[4]: r[8] for r in alice}["Lecture"] == "F14"
