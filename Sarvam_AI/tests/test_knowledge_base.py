import json
from pathlib import Path

from identitygraph.form_check import verify_form_against_docs
from identitygraph.knowledge_base import (
    validate_aadhaar, validate_mobile, validate_pan, validate_against_knowledge,
)
from identitygraph.services import get_service

ROOT = Path(__file__).parent.parent
SAMPLES = json.loads((ROOT / "sample_data" / "sample_extractions.json").read_text())
FORM = json.loads((ROOT / "sample_data" / "sample_form_answers.json").read_text())
FORM_RTO = json.loads((ROOT / "sample_data" / "sample_form_rto.json").read_text())
DOCS_RTO = json.loads((ROOT / "sample_data" / "sample_extractions_rto.json").read_text())
FORM_SCHEME = json.loads((ROOT / "sample_data" / "sample_form_scheme.json").read_text())
DOCS_SCHEME = json.loads((ROOT / "sample_data" / "sample_extractions_scheme.json").read_text())


def test_aadhaar_format():
    ok, _ = validate_aadhaar("4821 6634 9012")
    assert ok
    ok, msg = validate_aadhaar("123")
    assert not ok


def test_mobile_and_pan():
    assert validate_mobile("9876543210")[0]
    assert not validate_mobile("12345")[0]
    assert validate_pan("BXQPS4821K")[0]
    assert not validate_pan("BAD")[0]


def test_aadhaar_demo_scores_ready_or_fix():
    service = get_service("link_mobile_aadhaar")
    form_ver = verify_form_against_docs(FORM, service["form_fields"], SAMPLES)
    statuses = {c.form_key: c.status for c in form_ver.checks}
    kb = validate_against_knowledge("link_mobile_aadhaar", FORM, SAMPLES, statuses)
    assert kb.score >= 70
    assert kb.grade in ("READY", "FIX_REQUIRED")
    assert not any("12 digits" in i.message for i in kb.field_issues if i.severity == "FAIL")


def test_bad_mobile_blocks():
    bad = dict(FORM)
    bad["mobile"] = "123"
    kb = validate_against_knowledge("link_mobile_aadhaar", bad, SAMPLES, {})
    assert kb.grade in ("BLOCKED", "FIX_REQUIRED")
    assert any(i.field_key == "mobile" and i.severity == "FAIL" for i in kb.field_issues)


def test_rto_demo_validates_dl():
    service = get_service("rto_dl_update")
    form_ver = verify_form_against_docs(FORM_RTO, service["form_fields"], DOCS_RTO)
    statuses = {c.form_key: c.status for c in form_ver.checks}
    kb = validate_against_knowledge("rto_dl_update", FORM_RTO, DOCS_RTO, statuses)
    assert kb.score >= 65
    assert "Driving License" not in kb.missing_docs


def test_scheme_catalogue_match():
    service = get_service("scheme_apply")
    form_ver = verify_form_against_docs(FORM_SCHEME, service["form_fields"], DOCS_SCHEME)
    statuses = {c.form_key: c.status for c in form_ver.checks}
    kb = validate_against_knowledge("scheme_apply", FORM_SCHEME, DOCS_SCHEME, statuses)
    assert kb.details["eligibility_score"] >= 90
    assert any("e-Shram" in r or "catalogue" in r.lower() or "Matched" in r for r in kb.rejection_risks) or kb.score >= 70


def test_incomplete_form_fails_completeness():
    kb = validate_against_knowledge("grievance_complaint", {"full_name": "X"}, [], {})
    assert kb.details["completeness"] < 50
    assert kb.grade == "BLOCKED"
