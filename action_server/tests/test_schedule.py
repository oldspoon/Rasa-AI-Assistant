"""Weekly schedule: wording (actions/schedule.py) and seed rules (database/populate_db.py)."""
import populate_db
from actions import schedule


def sessions():
    teacher = {
        "teacher_id": 1,
        "teacher_first_name": "Margaret",
        "teacher_last_name": "Ellison",
        "teacher_discipline": "Fine Arts",
        "teacher_campus": "Craiglockhart",
        "teacher_office_room": "C214",
        "teacher_email": "margaret.ellison@napier.ac.uk",
        "teacher_phone": "0131 496 0142",
    }
    return [
        {"session_type": "Lecture", "day_of_week": "Monday", "time_range": "10:00-12:00",
         "room": "F14", "campus": "Craiglockhart", "activity": "Fine Arts", **teacher},
        {"session_type": "Practical", "day_of_week": "Wednesday", "time_range": "13:00-15:00",
         "room": "A94", "campus": "Craiglockhart", "activity": "Fine Arts", **teacher},
    ]


class TestWording:
    def test_session_of_picks_by_type_whatever_the_order(self):
        assert schedule.session_of(list(reversed(sessions())), "Lecture")["day_of_week"] == "Monday"

    def test_day_message_names_the_type_and_day(self):
        text = schedule.session_day_message("Alice", sessions()[1])
        assert "**Practical** session on **Wednesday**" in text
        assert "Margaret Ellison" in text

    def test_time_message_gives_both_sessions(self):
        text = schedule.time_message("Alice", sessions())
        assert "**Lecture** on **Monday** runs from **10:00-12:00**" in text
        assert "**Practical** on **Wednesday** runs from **13:00-15:00**" in text
        assert "Margaret Ellison" in text

    def test_room_message_gives_both_rooms_and_the_campus(self):
        text = schedule.room_message("Alice", sessions())
        assert "**F14**" in text and "**A94**" in text and "**Craiglockhart**" in text
        assert "C214" in text

    def test_campus_and_subject_are_shared(self):
        assert "**Craiglockhart**" in schedule.campus_message("Alice", sessions())
        assert "**Fine Arts**" in schedule.subject_message("Alice", sessions())
        assert "Margaret Ellison" in schedule.subject_message("Alice", sessions())

    def test_full_schedule_lists_lecture_then_practical(self):
        header, body, closing = schedule.full_schedule_parts("Alice", "Johnson", sessions())
        assert "**Alice Johnson**" in header
        assert body.index("**Lecture**") < body.index("**Practical**")
        assert body.count("**Teacher:** Margaret Ellison") == 3
        assert "C214" in body
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

    def test_every_session_is_hosted_by_the_teacher_of_its_discipline(self):
        for row in self.rows():
            discipline, teacher_id = row[7], row[9]
            assert teacher_id == populate_db.TEACHER_IDS[discipline]

    def test_each_discipline_has_exactly_one_teacher(self):
        disciplines = [t[2] for t in populate_db.TEACHERS]
        assert len(disciplines) == len(set(disciplines))
        assert set(disciplines) == set(populate_db.ACTIVITIES)

    def test_every_teacher_has_an_office_and_free_hours_each_weekday(self):
        for _first, _last, discipline, _campus, office_room, _email, _phone in populate_db.TEACHERS:
            assert office_room
            days = [day for day, _start, _end in populate_db.OFFICE_HOURS[discipline]]
            assert days == populate_db.DAYS

    def test_office_hours_are_two_hour_windows_of_30_minute_slots(self):
        for windows in populate_db.OFFICE_HOURS.values():
            for _day, start, end in windows:
                assert start < end
                assert (int(end[:2]) * 60 + int(end[3:]) - int(start[:2]) * 60 - int(start[3:])) == 120
