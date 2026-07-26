"""API + OCR extract path tests (no live Sarvam calls)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api import (
    _filter_form_answers,
    _guess_doc_type,
    _id_document_extractions,
    app,
)
from identitygraph.form_check import verify_form_against_docs
from identitygraph.reconcile import VARIANT, reconcile
from identitygraph.sarvam_pipeline import regex_fallback_fields
from identitygraph.services import get_service

ROOT = Path(__file__).parent.parent
SAMPLE = ROOT / "sample_data"
client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_id_document_filter_excludes_scanned_form():
    raw = json.loads((SAMPLE / "sample_extractions_sanika.json").read_text())
    filtered = _id_document_extractions(raw)
    types = {e["doc_type"] for e in filtered}
    assert "Scanned Application Form" not in types
    assert "Aadhaar Card" in types
    assert "Driving License" in types


def test_demo_rto_returns_sanika_without_scanned_form():
    res = client.get("/demo/rto_dl_update")
    assert res.status_code == 200
    data = res.json()
    assert "Sanika" in data["form_answers"]["full_name"]
    assert data["form_answers"]["mobile"] == "7887403910"
    types = {e["doc_type"] for e in data["extractions"]}
    assert "Scanned Application Form" not in types
    assert "father_name" in data["form_answers"]


def test_verify_sanika_rto_excludes_form_from_cross_doc():
    demo = client.get("/demo/rto_dl_update").json()
    # Inject scanned form into payload — API must still ignore it for reconcile
    raw = json.loads((SAMPLE / "sample_extractions_sanika.json").read_text())
    res = client.post(
        "/verify",
        json={
            "service_id": "rto_dl_update",
            "form_answers": demo["form_answers"],
            "extractions": raw,
        },
    )
    assert res.status_code == 200
    body = res.json()
    docs_mentioned = " ".join(
        f"{c['doc_a']} {c['doc_b']}" for c in body["cross_document"]["comparisons"]
    )
    assert "Scanned Application Form" not in docs_mentioned
    # Name on DL includes father — harmless variant vs form
    name_checks = [
        c for c in body["form_verification"]["checks"] if c["form_key"] == "full_name"
    ]
    assert name_checks
    assert name_checks[0]["status"] in ("MATCH", "VARIANT")
    assert "mobile" in body["form_verification"]["approved_fields"]


def test_extract_form_requires_api_key():
    form_img = SAMPLE / "sanika_chavan_filled_form.png"
    with patch("api._api_key", return_value=""):
        res = client.post(
            "/extract/form",
            data={"service_id": "rto_dl_update", "language": "en-IN"},
            files={"file": ("sanika_chavan_filled_form.png", form_img.read_bytes(), "image/png")},
        )
    assert res.status_code == 503
    assert "API_KEY" in res.json()["detail"]


def test_extract_documents_requires_api_key():
    form_img = SAMPLE / "sanika_chavan_filled_form.png"
    with patch("api._api_key", return_value=""):
        res = client.post(
            "/extract/documents",
            data={
                "service_id": "link_mobile_aadhaar",
                "doc_types": json.dumps(["Bank Passbook"]),
                "languages": json.dumps(["en-IN"]),
            },
            files=[
                ("files", ("Bank details (1).jpg", form_img.read_bytes(), "image/jpeg")),
            ],
        )
    assert res.status_code == 503


def test_guess_doc_type():
    assert _guess_doc_type("pan_card.jpg", ["Aadhaar Card"]) == "PAN Card"
    assert _guess_doc_type("my_aadhaar.png", []) == "Aadhaar Card"
    assert _guess_doc_type("dl_scan.jpg", ["Driving License"]) == "Driving License"


def test_dl_regex_fallback():
    ocr = "Driving Licence No: MH20 20190045678\nName: Sanika Chavan"
    fields = {
        "full_name": "UNCERTAIN",
        "father_name": "UNCERTAIN",
        "dob": "UNCERTAIN",
        "address": "UNCERTAIN",
        "id_number": "UNCERTAIN",
        "confidence_notes": "",
    }
    out = regex_fallback_fields(ocr, "Driving License", fields)
    assert "MH20" in out["id_number"]
    assert "20190045678" in out["id_number"].replace(" ", "")


def test_filter_form_answers_only_service_keys():
    service = get_service("rto_dl_update")
    raw = json.loads((SAMPLE / "sample_form_sanika.json").read_text())
    filtered = _filter_form_answers(service, raw)
    assert "email" not in filtered  # not an RTO form field
    assert "mobile" in filtered
    assert "dl_number" in filtered


def test_sanika_form_vs_docs_local():
    service = get_service("rto_dl_update")
    answers = _filter_form_answers(
        service, json.loads((SAMPLE / "sample_form_sanika.json").read_text())
    )
    docs = _id_document_extractions(
        json.loads((SAMPLE / "sample_extractions_sanika.json").read_text())
    )
    ver = verify_form_against_docs(answers, service["form_fields"], docs)
    assert "mobile" in ver.approved_fields
    cross = reconcile(docs)
    # Address differs between Aadhaar (new) and DL (old) — expected CRITICAL or VARIANT
    addr = [c for c in cross.comparisons if c.field == "address"]
    assert addr
    name = [c for c in cross.comparisons if c.field == "full_name"]
    assert name
    assert all(c.status in ("MATCH", "VARIANT", "CRITICAL", "UNCERTAIN") for c in name)
    # Sanika vs Sanika Santosh should be VARIANT
    assert any(c.status == VARIANT for c in name) or any(c.status == "MATCH" for c in name)
