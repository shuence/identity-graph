"""IdentityGraph Suvidha Desk API — FastAPI, live Sarvam Vision / 30B / Saaras / Bulbul."""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from identitygraph import auth_store
from identitygraph.config import DOC_TYPES, FIELD_LABELS, LANGUAGES, REMEDIATION_PORTALS
from identitygraph.form_check import verify_form_against_docs
from identitygraph.knowledge_base import validate_against_knowledge
from identitygraph.operator import serialize_all_services, serialize_service
from identitygraph.reconcile import ReconciliationResult, reconcile
from identitygraph.report import build_audit_pdf, build_filled_form_pdf
from identitygraph.services import get_service

ROOT = Path(__file__).parent
SAMPLE = ROOT / "sample_data"
load_dotenv(ROOT / ".env")

# Pseudo-doc types that are scanned forms, not identity cards.
_FORM_DOC_TYPES = {"Scanned Application Form", "Application Form", "Filled Form"}

app = FastAPI(title="IdentityGraph Suvidha Desk API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup_auth_db() -> None:
    auth_store.init_db()


def _bearer_token(
    authorization: str | None = Header(default=None),
    x_ig_token: str | None = Header(default=None, alias="X-IG-Token"),
) -> str | None:
    if x_ig_token:
        return x_ig_token.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def require_user(
    authorization: str | None = Header(default=None),
    x_ig_token: str | None = Header(default=None, alias="X-IG-Token"),
) -> dict:
    token = _bearer_token(authorization, x_ig_token)
    user = auth_store.user_from_token(token)
    if not user:
        raise HTTPException(401, "Sign in required")
    return user


class LoginRequest(BaseModel):
    email: str
    password: str


class CaseUpsert(BaseModel):
    service_id: str | None = None
    citizen_label: str | None = None
    step: int | None = None
    answers: dict[str, str] | None = None
    extractions: list[dict] | None = None
    verify_result: dict | None = None
    notes: str | None = None
    form_reviewed: bool | None = None
    ocr_reviewed: bool | None = None
    status: str | None = None


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
    return SAMPLE / (service.get("demo_answers") or "sample_form_answers.json")


def _demo_docs_path(service_id: str) -> Path:
    special = {
        "rto_dl_update": "sample_extractions_sanika.json",
        "scheme_apply": "sample_extractions_scheme.json",
        "grievance_complaint": "sample_extractions.json",
    }
    return SAMPLE / special.get(service_id, "sample_extractions.json")


def _id_document_extractions(extractions: list[dict]) -> list[dict]:
    """Keep only KYC/ID docs — exclude scanned application forms from cross-doc reconcile."""
    return [
        e for e in extractions
        if (e.get("doc_type") or "") not in _FORM_DOC_TYPES
    ]


def _filter_form_answers(service: dict, answers: dict) -> dict[str, str]:
    keys = {f["key"] for f in service["form_fields"]}
    return {k: str(v) for k, v in answers.items() if k in keys and v is not None}


def _guess_doc_type(filename: str, preferred: list[str]) -> str:
    name = filename.lower().replace(" ", "")
    rules = [
        (("pan",), "PAN Card"),
        (("aadhaar", "adhar", "aadhar"), "Aadhaar Card"),
        (("passbook", "bank", "statement"), "Bank Passbook"),
        (("voter", "epic"), "Voter ID"),
        (("ration",), "Ration Card"),
        (("dl", "licence", "license", "driving"), "Driving License"),
        (("passport",), "Passport"),
        (("form", "sanika", "application"), "Scanned Application Form"),
    ]
    for keys, doc in rules:
        if any(k in name for k in keys):
            if doc in preferred or doc in DOC_TYPES or doc in _FORM_DOC_TYPES:
                return doc
    return preferred[0] if preferred else "Other"


def _looks_like_sanika_demo(filename: str) -> bool:
    name = filename.lower()
    return "sanika" in name or "filled_form" in name or "ig-rto-sanika" in name


def _prefer_sanika_demo(service_id: str, filenames: list[str]) -> bool:
    """Use Sanika fixtures for RTO or when any upload name references Sanika."""
    if service_id == "rto_dl_update":
        return True
    return any(_looks_like_sanika_demo(n) for n in filenames)


def _load_demo_extractions(service_id: str, filenames: list[str] | None = None) -> list[dict]:
    filenames = filenames or []
    if _prefer_sanika_demo(service_id, filenames):
        sanika = SAMPLE / "sample_extractions_sanika.json"
        if sanika.exists():
            return _id_document_extractions(json.loads(sanika.read_text()))
    docs_path = _demo_docs_path(service_id)
    return _id_document_extractions(json.loads(docs_path.read_text()))


def _require_sarvam_key() -> str:
    key = _api_key()
    if not key:
        raise HTTPException(
            503,
            "Sarvam API key not configured. Set API_KEY in Sarvam_AI/.env for live OCR.",
        )
    return key


async def _save_upload(upload: UploadFile) -> tuple[str, str]:
    """Write upload to a temp file. Returns (path, original_filename)."""
    original = upload.filename or "upload.bin"
    # Normalize extension so Sarvam Vision accepts .JPG / .JPEG / odd casings.
    raw_suf = Path(original).suffix or ""
    suf = raw_suf.lower()
    if suf in (".jpeg", ".jpe"):
        suf = ".jpg"
    if not suf or suf == ".bin":
        # Infer from content-type when the browser omits an extension.
        ct = (upload.content_type or "").lower()
        if "jpeg" in ct or "jpg" in ct:
            suf = ".jpg"
        elif "png" in ct:
            suf = ".png"
        elif "webp" in ct:
            suf = ".webp"
        elif "pdf" in ct:
            suf = ".pdf"
        else:
            suf = ".jpg"
    data = await upload.read()
    if not data:
        raise HTTPException(400, f"Empty upload: {original}")
    tmp = tempfile.NamedTemporaryFile(suffix=suf, delete=False)
    try:
        tmp.write(data)
        tmp.flush()
        return tmp.name, original
    finally:
        tmp.close()


class VerifyRequest(BaseModel):
    service_id: str
    form_answers: dict[str, str] = Field(default_factory=dict)
    extractions: list[dict] = Field(default_factory=list)
    operator_notes: str = ""


class SpeakRequest(BaseModel):
    text: str
    language: str = "hi-IN"
    speaker: str = "priya"
    pace: float = 0.9


class AgentTurnRequest(BaseModel):
    service_id: str
    transcript: str = ""
    answers: dict[str, str] = Field(default_factory=dict)
    active_field: str | None = None
    pending_confirm: dict[str, str] | None = None
    history: list[dict[str, str]] = Field(default_factory=list)
    use_llm: bool = True


def _run_verify(body: VerifyRequest) -> dict:
    try:
        service = get_service(body.service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {body.service_id}") from exc

    id_docs = _id_document_extractions(body.extractions)
    form_ver = verify_form_against_docs(
        body.form_answers, service["form_fields"], id_docs
    )
    cross: ReconciliationResult = (
        reconcile(id_docs) if len(id_docs) >= 2 else ReconciliationResult()
    )
    statuses = {c.form_key: c.status for c in form_ver.checks}
    kb = validate_against_knowledge(
        body.service_id, body.form_answers, id_docs, statuses
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
    key_loaded = bool(_api_key())
    return {
        "ok": True,
        "service": "identitygraph-suvidha-desk",
        "mode": "python-fastapi",
        "sarvam_key_loaded": key_loaded,
        "sarvam_configured": key_loaded,
        "doc_types": DOC_TYPES,
    }


@app.get("/meta")
def meta():
    key_loaded = bool(_api_key())
    return {
        "doc_types": DOC_TYPES,
        "field_labels": FIELD_LABELS,
        "languages": LANGUAGES,
        "remediation_portals": REMEDIATION_PORTALS,
        "sarvam_key_loaded": key_loaded,
        "sarvam_configured": key_loaded,
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
def demo_bundle(service_id: str, citizen: str = ""):
    try:
        service = get_service(service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {service_id}") from exc

    want_sanika = (
        citizen.lower() in ("sanika", "sanika_chavan") or service_id == "rto_dl_update"
    )
    if want_sanika and (SAMPLE / "sample_form_sanika.json").exists():
        form_path = SAMPLE / "sample_form_sanika.json"
        raw_extractions = _load_demo_extractions(service_id, ["sanika"])
    else:
        form_path = _demo_form_path(service)
        docs_path = _demo_docs_path(service_id)
        if not form_path.exists() or not docs_path.exists():
            raise HTTPException(404, "Demo sample data missing for this service")
        raw_extractions = _id_document_extractions(json.loads(docs_path.read_text()))

    if not form_path.exists():
        raise HTTPException(404, "Demo sample data missing for this service")

    raw_answers = json.loads(form_path.read_text())
    return {
        "service_id": service_id,
        "form_answers": _filter_form_answers(service, raw_answers),
        "extractions": raw_extractions,
        "citizen": raw_answers.get("full_name", ""),
    }


@app.post("/verify")
def verify(body: VerifyRequest):
    return _run_verify(body)


@app.post("/extract")
async def extract_documents_live(
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
        "extractions": _id_document_extractions(records),
        "failures": failures,
        "engine": "sarvam_vision_30b",
    }


@app.post("/extract/form")
async def extract_form(
    service_id: str = Form(...),
    file: UploadFile = File(...),
    language: str = Form("en-IN"),
):
    """OCR a scanned application form → service form_answers for operator review."""
    try:
        service = get_service(service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {service_id}") from exc

    _require_sarvam_key()
    from identitygraph.sarvam_pipeline import get_client, process_scanned_form
    import logging

    path = None
    try:
        path, original = await _save_upload(file)
        # Guard obvious empty uploads before burning a Vision job.
        if os.path.getsize(path) < 500:
            raise HTTPException(
                400,
                f"Upload too small ({os.path.getsize(path)} bytes). "
                "Scan a filled form as JPG/PNG — blank images return no OCR text.",
            )
        client = get_client(_api_key())
        result = process_scanned_form(
            client, path, service["form_fields"], language=language
        )
        result["source_file"] = original
        result["service_id"] = service_id
        result["needs_review"] = True
        result["form_answers"] = _filter_form_answers(
            service, result.get("form_answers") or {}
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Form OCR failed for %s", service_id)
        # 422 so clients don't confuse this with Next.js proxy gateway failure.
        raise HTTPException(422, f"Form OCR failed: {exc}") from exc
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass


@app.post("/extract/documents")
async def extract_documents(
    service_id: str = Form(...),
    files: list[UploadFile] = File(...),
    doc_types: str = Form("[]"),
    languages: str = Form("[]"),
):
    """OCR multiple KYC documents. Returns extractions (+ per-file failures)."""
    try:
        service = get_service(service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {service_id}") from exc

    try:
        type_list = json.loads(doc_types) if doc_types else []
        lang_list = json.loads(languages) if languages else []
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "doc_types and languages must be JSON arrays") from exc

    if not files:
        raise HTTPException(400, "No files uploaded")

    preferred = list(service.get("required_docs") or []) + list(
        service.get("optional_docs") or []
    )

    _require_sarvam_key()
    from identitygraph.sarvam_pipeline import get_client, process_document

    client = get_client(_api_key())
    extractions: list[dict] = []
    failures: list[dict] = []

    for i, upload in enumerate(files):
        dtype = (
            type_list[i]
            if i < len(type_list) and type_list[i]
            else _guess_doc_type(upload.filename or "", preferred)
        )
        lang = lang_list[i] if i < len(lang_list) and lang_list[i] else "en-IN"
        path = None
        try:
            path, original = await _save_upload(upload)
            rec = process_document(client, path, dtype, language=lang)
            rec["source_file"] = original
            extractions.append(rec)
        except Exception as exc:
            failures.append({
                "file": upload.filename or f"file_{i}",
                "doc_type": dtype,
                "error": str(exc),
            })
        finally:
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass

    return {
        "service_id": service_id,
        "extractions": _id_document_extractions(extractions),
        "failures": failures,
    }


@app.post("/voice/speak")
def voice_speak(body: SpeakRequest):
    if not _api_key():
        raise HTTPException(400, "API_KEY missing in Sarvam_AI/.env")
    from identitygraph.voice import get_client, speak

    audio = speak(
        get_client(_api_key()),
        body.text,
        language=body.language,
        speaker=body.speaker,
        pace=body.pace,
    )
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


@app.post("/agent/turn")
def agent_turn(body: AgentTurnRequest):
    """Voice/chat desk agent: maps citizen speech → form fields + redirect advice."""
    try:
        service = get_service(body.service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {body.service_id}") from exc

    from identitygraph.desk_agent import run_agent_turn

    # Prefer live LLM when key is present; heuristic still works offline.
    use_llm = bool(body.use_llm and _api_key())
    result = run_agent_turn(
        service=service,
        transcript=body.transcript,
        answers=_filter_form_answers(service, body.answers),
        active_field=body.active_field,
        pending_confirm=body.pending_confirm,
        history=body.history or [],
        use_llm=use_llm,
    )
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
    id_docs = _id_document_extractions(body.extractions)
    form_ver = verify_form_against_docs(
        body.form_answers, service["form_fields"], id_docs
    )
    cross = (
        reconcile(id_docs) if len(id_docs) >= 2 else ReconciliationResult()
    )
    pdf = build_audit_pdf(
        id_docs,
        cross,
        form_checks=form_ver.checks,
        service_title=service["title"],
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="identity-audit.pdf"'},
    )


@app.post("/auth/login")
def auth_login(body: LoginRequest):
    result = auth_store.login(body.email, body.password)
    if not result:
        raise HTTPException(401, "Invalid email or password")
    return result


@app.post("/auth/logout")
def auth_logout(
    authorization: str | None = Header(default=None),
    x_ig_token: str | None = Header(default=None, alias="X-IG-Token"),
):
    auth_store.logout(_bearer_token(authorization, x_ig_token))
    return {"ok": True}


@app.get("/auth/me")
def auth_me(user: dict = Depends(require_user)):
    return {"user": user}


@app.get("/cases")
def cases_list(user: dict = Depends(require_user), limit: int = 20):
    return {"cases": auth_store.list_cases(user["id"], limit=min(limit, 50))}


@app.post("/cases")
def cases_create(body: CaseUpsert, user: dict = Depends(require_user)):
    return auth_store.create_case(user["id"], body.model_dump(exclude_none=True))


@app.get("/cases/{case_id}")
def cases_get(case_id: str, user: dict = Depends(require_user)):
    row = auth_store.get_case(user["id"], case_id)
    if not row:
        raise HTTPException(404, "Case not found")
    return row


@app.patch("/cases/{case_id}")
def cases_patch(case_id: str, body: CaseUpsert, user: dict = Depends(require_user)):
    row = auth_store.update_case(
        user["id"], case_id, body.model_dump(exclude_none=True)
    )
    if not row:
        raise HTTPException(404, "Case not found")
    return row
