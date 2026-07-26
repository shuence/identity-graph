"""Tests for the desk voice agent (save-and-advance, no yes/no)."""

from identitygraph.desk_agent import run_agent_turn
from identitygraph.services import get_service


def test_greeting_asks_first_empty_field():
    service = get_service("rto_dl_update")
    out = run_agent_turn(service=service, transcript="", answers={}, use_llm=False)
    assert out["action"] == "ask"
    assert out["active_field"]
    assert "hello" in out["reply_en"].lower() or "please" in out["reply_en"].lower()
    assert out["pending_confirm"] is None


def test_name_saves_and_advances_immediately():
    service = get_service("rto_dl_update")
    out = run_agent_turn(
        service=service,
        transcript="Sanika Santosh Chavan",
        answers={},
        active_field="full_name",
        use_llm=False,
    )
    assert out["action"] == "ask"
    assert out["field_updates"]["full_name"]
    assert "SANIKA" in out["field_updates"]["full_name"]
    assert out["pending_confirm"] is None
    assert out["active_field"] != "full_name"
    assert "got it" in out["reply_en"].lower()


def test_wrong_clears_last_and_reasks():
    service = get_service("rto_dl_update")
    out = run_agent_turn(
        service=service,
        transcript="wrong",
        answers={"full_name": "SANIKA SANTOSH CHAVAN"},
        active_field="father_name",
        use_llm=False,
    )
    assert out["field_updates"].get("full_name") == ""
    assert out["active_field"] == "full_name"
    assert out["pending_confirm"] is None


def test_short_name_rejected():
    service = get_service("rto_dl_update")
    out = run_agent_turn(
        service=service,
        transcript="Sa",
        answers={},
        active_field="full_name",
        use_llm=False,
    )
    assert out["action"] == "clarify"
    assert out["pending_confirm"] is None
    assert out["field_updates"] == {}


def test_all_fields_done_opens_review():
    service = get_service("rto_dl_update")
    # Fill all required (high_stakes) fields except one
    required = [f for f in service["form_fields"] if f.get("high_stakes")]
    answers = {f["key"]: "VALUE HERE" for f in required[:-1]}
    last = required[-1]["key"]
    out = run_agent_turn(
        service=service,
        transcript="FINAL VALUE HERE",
        answers=answers,
        active_field=last,
        use_llm=False,
    )
    assert out["redirect"] == "review_form"
    assert out["field_updates"][last]
    assert out["pending_confirm"] is None
