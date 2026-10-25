"""A signed-in chat always uses the verified student, whatever name is typed."""
from types import SimpleNamespace

from actions import actions


def tracker(metadata=None, entities=(), slots=None):
    slots = slots or {}
    return SimpleNamespace(
        sender_id="alicejohnson:test",
        slots=slots,
        latest_message={"metadata": metadata, "entities": list(entities)},
        get_slot=lambda key: slots.get(key),
    )


def entity(name, value):
    return {"entity": name, "value": value}


SIGNED_IN = {"student": {"first_name": "Alice", "last_name": "Johnson"}}


class TestSignedInName:
    def test_the_verified_student_beats_slots(self):
        t = tracker(SIGNED_IN, slots={"first_name": "Bob", "last_name": "Smith"})
        assert actions._get_full_name(t) == ("Alice", "Johnson")

    def test_the_verified_student_beats_a_typed_name(self):
        t = tracker(SIGNED_IN, entities=[entity("first_name", "Bob"), entity("last_name", "Smith")])
        assert actions._get_full_name(t) == ("Alice", "Johnson")

    def test_without_a_login_the_slots_are_used(self):
        t = tracker(None, slots={"first_name": "Bob", "last_name": "Smith"})
        assert actions._signed_in_name(t) is None
        assert actions._get_full_name(t) == ("Bob", "Smith")

    def test_an_incomplete_student_is_ignored(self):
        assert actions._signed_in_name(tracker({"student": {"first_name": "Alice"}})) is None


class TestLookup:
    def run(self, t):
        sent = []
        dispatcher = SimpleNamespace(utter_message=lambda **kwargs: sent.append(kwargs))
        events = actions.ActionLookupStudent().run(dispatcher, t, {})
        return sent, events

    def test_asking_for_someone_else_is_refused(self):
        t = tracker(SIGNED_IN, entities=[entity("first_name", "Bob"), entity("last_name", "Smith")])
        sent, events = self.run(t)
        assert "signed in as Alice Johnson" in sent[0]["text"]
        assert [e["value"] for e in events] == ["Alice", "Johnson"]

    def test_a_matching_name_is_confirmed(self, monkeypatch):
        monkeypatch.setattr(actions, "_fetch_student", lambda f, l: {"first_name": "Alice", "last_name": "Johnson"})
        t = tracker(SIGNED_IN, entities=[entity("first_name", "alice"), entity("last_name", "JOHNSON")])
        sent, _events = self.run(t)
        assert sent[0]["response"] == "utter_student_found"
