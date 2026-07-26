import json
from pathlib import Path

from identitygraph.form_check import verify_form_against_docs
from identitygraph.reconcile import (
    CRITICAL, MATCH, UNCERTAIN, VARIANT,
    compare_address, compare_dob, compare_names, reconcile,
)
from identitygraph.services import get_service

SAMPLES = json.loads((Path(__file__).parent.parent / "sample_data" / "sample_extractions.json").read_text())
FORM = json.loads((Path(__file__).parent.parent / "sample_data" / "sample_form_answers.json").read_text())


def test_mohd_expansion_is_variant():
    status, _ = compare_names("Mohd Irfan Shaikh", "Mohammed Irfan Shaikh")
    assert status == VARIANT


def test_phonetic_spelling_is_variant():
    status, _ = compare_names("Mohammed Irfan Shaik", "Mohammed Irfan Shaikh")
    assert status == VARIANT
    status, _ = compare_names("Abdul Rahim Sheikh", "Abdul Rahim Shaikh")
    assert status == VARIANT


def test_initials_are_variant():
    status, _ = compare_names("A R Shaikh", "Abdul Rahim Shaikh")
    assert status == VARIANT


def test_extra_middle_name_is_variant():
    status, _ = compare_names("Mohamad Irfan Ahemad Shaikh", "Mohammed Irfan Shaikh")
    assert status == VARIANT


def test_different_person_is_critical():
    status, _ = compare_names("Mohammed Irfan Shaikh", "Ramesh Kumar Gupta")
    assert status == CRITICAL


def test_identical_name_is_match():
    status, _ = compare_names("Mohammed Irfan Shaikh", "Mohammed Irfan Shaikh")
    assert status == MATCH


def test_dob_format_variant():
    status, _ = compare_dob("14/06/1992", "14-06-1992")
    assert status == VARIANT


def test_dob_year_mismatch_is_critical():
    status, _ = compare_dob("14/06/1992", "14/06/1993")
    assert status == CRITICAL


def test_address_same_locality_is_variant():
    status, _ = compare_address(
        "H No 42, Gandhi Nagar, Kurla West, Mumbai, Maharashtra 400070",
        "42 Gandhi Nagar, Kurla (W), Mumbai 400070",
    )
    assert status in (MATCH, VARIANT)


def test_sample_names_are_variants_not_critical():
    result = reconcile(SAMPLES)
    crit_names = [c for c in result.critical if c.field in ("full_name", "father_name")]
    assert crit_names == [], f"Name variants wrongly flagged critical: {crit_names}"


def test_passbook_uncertain_dob_not_guessed():
    result = reconcile(SAMPLES)
    unc = [c for c in result.comparisons if c.status == UNCERTAIN and c.field == "dob"]
    assert any("Bank Passbook" in (c.doc_a, c.doc_b) for c in unc)


def test_form_matches_aadhaar_on_demo_answers():
    service = get_service("link_mobile_aadhaar")
    ver = verify_form_against_docs(FORM, service["form_fields"], SAMPLES)
    # Name / father / dob / aadhaar should be MATCH or VARIANT against Aadhaar
    by_key = {c.form_key: c for c in ver.checks}
    assert by_key["full_name"].status in (MATCH, VARIANT)
    assert by_key["dob"].status in (MATCH, VARIANT)
    assert by_key["aadhaar_number"].status in (MATCH, VARIANT)
    assert "mobile" in ver.approved_fields  # no doc counterpart, still carried forward
