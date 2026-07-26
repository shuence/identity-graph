"""Tests for the desk voice agent (confirm-before-advance)."""

from identitygraph.desk_agent import run_agent_turn
from identitygraph.services import get_service


def test_greeting_asks_first_empty_field():
    service = get_service("rto_dl_update")
    out = run_agent_turn(service=service, transcript="", answers={}, use_llm=False)
    assert out["action"] == "ask"
    assert out["active_field"]
    assert "hello" in out["reply_en"].lower() or "please" in out["reply_en"].lower()
    assert out["pending_confirm"] is None


def test_name_goes_to_confirm_not_commit():
    service = get_service("rto_dl_update")
    out = run_agent_turn(
        service=service,
        transcript="Sanika Santosh Chavan",
        answers={},
        active_field="full_name",
        use_llm=False,
    )
    assert out["action"] == "confirm"
    assert out["field_updates"] == {}
    assert out["pending_confirm"]["field_key"] == "full_name"
    assert "SANIKA" in out["pending_confirm"]["value"]
    assert out["active_field"] == "full_name"
    assert "yes" in out["reply_en"].lower()


def test_yes_commits_and_advances():
    service = get_service("rto_dl_update")
    pending = {"field_key": "full_name", "value": "SANIKA SANTOSH CHAVAN"}
    out = run_agent_turn(
        service=service,
        transcript="yes",
        answers={},
        active_field="full_name",
        pending_confirm=pending,
        use_llm=False,
    )
    assert out["field_updates"]["full_name"] == "SANIKA SANTOSH CHAVAN"
    assert out["pending_confirm"] is None
    assert out["active_field"] != "full_name"
    assert "saved" in out["reply_en"].lower() or "next" in out["reply_en"].lower()


def test_no_clears_pending_and_reasks():
    service = get_service("rto_dl_update")
    pending = {"field_key": "full_name", "value": "WRONG NAME"}
    out = run_agent_turn(
        service=service,
        transcript="no",
        answers={},
        active_field="full_name",
        pending_confirm=pending,
        use_llm=False,
    )
    assert out["field_updates"] == {}
    assert out["pending_confirm"] is None
    assert out["active_field"] == "full_name"
    assert "again" in out["reply_en"].lower()


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
    answers = {f["key"]: "X" * 5 for f in service["form_fields"]}
    # leave last empty, confirm it
    last = service["form_fields"][-1]["key"]
    answers.pop(last)
    pending = {"field_key": last, "value": "FINAL VALUE HERE"}
    out = run_agent_turn(
        service=service,
        transcript="yes",
        answers=answers,
        active_field=last,
        pending_confirm=pending,
        use_llm=False,
    )
    assert out["redirect"] == "review_form"
    assert out["field_updates"][last] == "FINAL VALUE HERE"
