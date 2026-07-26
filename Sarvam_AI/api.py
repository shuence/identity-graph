"""IdentityGraph Suvidha Desk API — FastAPI, live Sarvam Vision / 30B / Saaras / Bulbul."""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from identitygraph.config import DOC_TYPES, FIELD_LABELS, LANGUAGES, REMEDIATION_PORTALS
from identitygraph.form_check import verify_form_against_docs
from identitygraph.knowledge_base import validate_against_knowledge
from identitygraph.reconcile import ReconciliationResult, reconcile
from identitygraph.report import build_audit_pdf, build_filled_form_pdf
from identitygraph.services import get_service
from identitygraph.operator import serialize_all_services, serialize_service

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

app = FastAPI(title="IdentityGraph Suvidha Desk API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _jsonable(obj: Any) -> Any:
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: _jsonable(v) for k, v in asdict(obj).items()}
    if isinstance(obj, list):
        return [_jsonable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _jsonable(v) for k, v in obj.items()}
    return obj


def _api_key() -> str:
    return os.environ.get("API_KEY") or os.environ.get("SARVAM_API_KEY") or ""


def _demo_form_path(service: dict) -> Path:
    return ROOT / "sample_data" / (service.get("demo_answers") or "sample_form_answers.json")


def _demo_docs_path(service_id: str) -> Path:
    special = {
        "rto_dl_update": "sample_extractions_rto.json",
        "scheme_apply": "sample_extractions_scheme.json",
        "grievance_complaint": "sample_extractions.json",
    }
    return ROOT / "sample_data" / special.get(service_id, "sample_extractions.json")


class VerifyRequest(BaseModel):
    service_id: str
    form_answers: dict[str, str] = Field(default_factory=dict)
    extractions: list[dict] = Field(default_factory=list)
    operator_notes: str = ""


class SpeakRequest(BaseModel):
    text: str
    language: str = "hi-IN"
    speaker: str = "priya"


def _run_verify(body: VerifyRequest) -> dict:
    try:
        service = get_service(body.service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {body.service_id}") from exc

    form_ver = verify_form_against_docs(
        body.form_answers, service["form_fields"], body.extractions
    )
    cross: ReconciliationResult = (
        reconcile(body.extractions) if len(body.extractions) >= 2 else ReconciliationResult()
    )
    statuses = {c.form_key: c.status for c in form_ver.checks}
    kb = validate_against_knowledge(
        body.service_id, body.form_answers, body.extractions, statuses
    )

    if cross.primary_blocker_doc:
        portal = REMEDIATION_PORTALS.get(
            cross.primary_blocker_doc, REMEDIATION_PORTALS["Other"]
        )
        rem = {
            "primary_doc": cross.primary_blocker_doc,
            "blocker_count": cross.blocker_counts.get(cross.primary_blocker_doc, 0),
            "portal_name": portal["portal"],
            "portal_url": portal.get("url") or "",
            "how": portal["how"],
        }
    else:
        rem = {
            "primary_doc": None,
            "blocker_count": 0,
            "portal_name": service["portal"]["name"],
            "portal_url": service["portal"].get("url") or "",
            "how": "No critical cross-document blockers. Proceed to portal after operator review.",
        }

    return {
        "service": {
            "id": service["id"],
            "title": service["title"],
            "portal": service["portal"],
        },
        "form_verification": _jsonable(form_ver),
        "cross_document": {
            "comparisons": _jsonable(cross.comparisons),
            "primary_blocker_doc": cross.primary_blocker_doc,
            "blocker_counts": cross.blocker_counts,
            "summary": {
                "matches": sum(1 for c in cross.comparisons if c.status == "MATCH"),
                "variants": len(cross.variants),
                "blockers": len(cross.critical),
                "uncertain": len(cross.uncertain),
            },
        },
        "knowledge": _jsonable(kb),
        "remediation": rem,
        "ready_for_portal": form_ver.ready_for_portal and kb.is_portal_ready,
        "engine": "sarvam_ai_python",
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "identitygraph-suvidha-desk",
        "mode": "python-fastapi",
        "sarvam_key_loaded": bool(_api_key()),
        "doc_types": DOC_TYPES,
    }


@app.get("/meta")
def meta():
    return {
        "doc_types": DOC_TYPES,
        "field_labels": FIELD_LABELS,
        "languages": LANGUAGES,
        "remediation_portals": REMEDIATION_PORTALS,
        "sarvam_key_loaded": bool(_api_key()),
    }


@app.get("/services")
def services():
    return serialize_all_services()


@app.get("/services/{service_id}")
def service_detail(service_id: str):
    try:
        return serialize_service(service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {service_id}") from exc


@app.get("/demo/{service_id}")
def demo_bundle(service_id: str):
    try:
        service = get_service(service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {service_id}") from exc
    form_path = _demo_form_path(service)
    docs_path = _demo_docs_path(service_id)
    if not form_path.exists() or not docs_path.exists():
        raise HTTPException(404, "Demo sample data missing")
    return {
        "service_id": service_id,
        "form_answers": json.loads(form_path.read_text()),
        "extractions": json.loads(docs_path.read_text()),
    }


@app.post("/verify")
def verify(body: VerifyRequest):
    return _run_verify(body)


@app.post("/extract")
async def extract_documents(
    files: list[UploadFile] = File(...),
    doc_types: str = Form(...),
    language: str = Form("en-IN"),
    handwritten: str = Form("[]"),
):
    """Live Sarvam Vision digitization + Sarvam-30B field extraction.

    `handwritten` is a JSON bool array aligned with `files` — enables Indic OCR
    retries and stricter UNCERTAIN handling for filled forms / block letters.
    """
    if not _api_key():
        raise HTTPException(400, "API_KEY missing in Sarvam_AI/.env")

    try:
        types = json.loads(doc_types)
        hw_flags = json.loads(handwritten or "[]")
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "doc_types/handwritten must be JSON arrays") from exc

    if len(types) != len(files):
        raise HTTPException(400, "doc_types length must match files length")
    if hw_flags and len(hw_flags) != len(files):
        raise HTTPException(400, "handwritten length must match files length")
    if not hw_flags:
        hw_flags = [False] * len(files)

    from identitygraph.sarvam_pipeline import get_client, process_document

    client = get_client(_api_key())
    records: list[dict] = []
    failures: list[dict] = []

    for up, dtype, is_hw in zip(files, types, hw_flags):
        suffix = Path(up.filename or "doc.bin").suffix or ".jpg"
        data = await up.read()
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            path = tmp.name
        try:
            lang = language
            if dtype == "Aadhaar Card" and language == "en-IN":
                lang = "hi-IN"
            if is_hw and language == "en-IN":
                lang = "hi-IN"
            rec = process_document(
                client, path, dtype, language=lang, handwritten=bool(is_hw)
            )
            rec["source_file"] = up.filename or Path(path).name
            records.append(rec)
        except Exception as exc:  # noqa: BLE001
            failures.append(
                {"file": up.filename, "doc_type": dtype, "error": str(exc)}
            )
        finally:
            os.unlink(path)

    return {
        "extractions": records,
        "failures": failures,
        "engine": "sarvam_vision_30b",
    }


@app.post("/voice/speak")
def voice_speak(body: SpeakRequest):
    if not _api_key():
        raise HTTPException(400, "API_KEY missing in Sarvam_AI/.env")
    from identitygraph.voice import get_client, speak

    audio = speak(get_client(_api_key()), body.text, language=body.language, speaker=body.speaker)
    return Response(content=audio, media_type="audio/wav")


@app.post("/voice/transcribe")
async def voice_transcribe(
    file: UploadFile = File(...),
    mode: str = Form("codemix"),
):
    if not _api_key():
        raise HTTPException(400, "API_KEY missing in Sarvam_AI/.env")
    from identitygraph.voice import get_client, transcribe

    data = await file.read()
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    result = transcribe(get_client(_api_key()), data, suffix=suffix, mode=mode)
    return result


@app.post("/pack/form")
def pack_form(body: VerifyRequest):
    try:
        service = get_service(body.service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {body.service_id}") from exc
    pdf = build_filled_form_pdf(service, body.form_answers, body.operator_notes)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="filled-form.pdf"'},
    )


@app.post("/pack/audit")
def pack_audit(body: VerifyRequest):
    try:
        service = get_service(body.service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {body.service_id}") from exc
    form_ver = verify_form_against_docs(
        body.form_answers, service["form_fields"], body.extractions
    )
    cross = (
        reconcile(body.extractions) if len(body.extractions) >= 2 else ReconciliationResult()
    )
    pdf = build_audit_pdf(
        body.extractions,
        cross,
        form_checks=form_ver.checks,
        service_title=service["title"],
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="identity-audit.pdf"'},
    )
