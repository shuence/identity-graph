"""HTTP API for IdentityGraph Suvidha Desk — consumed by sarvam-ui."""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from identitygraph.config import DOC_TYPES, FIELD_LABELS, LANGUAGES, REMEDIATION_PORTALS
from identitygraph.form_check import verify_form_against_docs
from identitygraph.knowledge_base import validate_against_knowledge
from identitygraph.reconcile import ReconciliationResult, reconcile
from identitygraph.report import build_audit_pdf, build_filled_form_pdf
from identitygraph.services import get_service, list_services

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

app = FastAPI(title="IdentityGraph Suvidha Desk API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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


class PackRequest(VerifyRequest):
    pass


@app.get("/health")
def health():
    return {"ok": True, "service": "identitygraph-suvidha-desk"}


@app.get("/meta")
def meta():
    return {
        "doc_types": DOC_TYPES,
        "field_labels": FIELD_LABELS,
        "languages": LANGUAGES,
        "remediation_portals": REMEDIATION_PORTALS,
    }


@app.get("/services")
def services():
    return [
        {
            "id": s["id"],
            "title": s["title"],
            "tagline": s["tagline"],
            "why": s["why"],
            "required_docs": s["required_docs"],
            "optional_docs": s.get("optional_docs", []),
            "portal": s["portal"],
            "form_fields": [
                {
                    "key": f["key"],
                    "label": f["label"],
                    "high_stakes": bool(f.get("high_stakes")),
                    "prompt_hi": f.get("prompt_hi", ""),
                    "prompt_en": f.get("prompt_en", ""),
                }
                for f in s["form_fields"]
            ],
        }
        for s in list_services()
    ]


@app.get("/services/{service_id}")
def service_detail(service_id: str):
    try:
        s = get_service(service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {service_id}") from exc
    return {
        "id": s["id"],
        "title": s["title"],
        "tagline": s["tagline"],
        "why": s["why"],
        "required_docs": s["required_docs"],
        "optional_docs": s.get("optional_docs", []),
        "portal": s["portal"],
        "form_fields": s["form_fields"],
    }


@app.get("/demo/{service_id}")
def demo_bundle(service_id: str):
    try:
        service = get_service(service_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown service: {service_id}") from exc

    form_path = _demo_form_path(service)
    docs_path = _demo_docs_path(service_id)
    if not form_path.exists() or not docs_path.exists():
        raise HTTPException(404, "Demo sample data missing for this service")

    return {
        "service_id": service_id,
        "form_answers": json.loads(form_path.read_text()),
        "extractions": json.loads(docs_path.read_text()),
    }


def _run_verify(body: VerifyRequest):
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

    rem = None
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
    elif service.get("portal"):
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
    }


@app.post("/verify")
def verify(body: VerifyRequest):
    return _run_verify(body)


@app.post("/pack/form")
def pack_form(body: PackRequest):
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
def pack_audit(body: PackRequest):
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
