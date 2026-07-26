"""Portal-ready pack: filled update form + identity audit PDF."""

from __future__ import annotations

from datetime import datetime

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from .config import FIELD_LABELS, REMEDIATION_PORTALS
from .reconcile import CRITICAL, UNCERTAIN, VARIANT, ReconciliationResult

_NEXT = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}

_STATUS_COLORS = {
    "MATCH": (46, 125, 50),
    "VARIANT": (46, 125, 50),
    "CRITICAL": (198, 40, 40),
    "UNCERTAIN": (245, 124, 0),
}


def _safe(text: str) -> str:
    return text.encode("latin-1", errors="replace").decode("latin-1")


def build_filled_form_pdf(service: dict, answers: dict[str, str],
                          operator_notes: str = "") -> bytes:
    """Block-letter style filled form the Suvidha desk would otherwise write by hand."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _safe(service["title"]), **_NEXT)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(90, 90, 90)
    pdf.multi_cell(0, 5, _safe(
        f"Generated for portal: {service['portal']['name']}\n"
        f"Date: {datetime.now().strftime('%d %b %Y, %H:%M')} | "
        f"Filled by voice-assisted Suvidha Desk (IdentityGraph)"), **_NEXT)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Application Particulars (BLOCK LETTERS)", **_NEXT)
    pdf.set_draw_color(180, 180, 180)

    for spec in service["form_fields"]:
        key, label = spec["key"], spec["label"]
        value = (answers.get(key) or "________________").upper()
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 5, _safe(label), **_NEXT)
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_fill_color(245, 245, 245)
        pdf.multi_cell(0, 8, _safe(value), fill=True, border=1, **_NEXT)
        pdf.ln(2)

    if operator_notes:
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "Operator notes", **_NEXT)
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, _safe(operator_notes), **_NEXT)

    pdf.ln(8)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, "Citizen signature: ____________________    Operator: ____________________", **_NEXT)
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(120, 120, 120)
    pdf.multi_cell(0, 4, _safe(
        "This form was voice-filled by the citizen and verified against supporting documents "
        "by IdentityGraph Suvidha Desk. Attach the Identity Audit File and document scans "
        "before uploading to the portal."), **_NEXT)

    return bytes(pdf.output())


def build_audit_pdf(extractions: list[dict], result: ReconciliationResult,
                    form_checks: list | None = None,
                    service_title: str = "") -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, "IdentityGraph India - Verified Identity Audit File", **_NEXT)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    title_bit = f" | Service: {service_title}" if service_title else ""
    pdf.cell(0, 6, _safe(
        f"Generated {datetime.now().strftime('%d %b %Y, %H:%M')} | "
        f"{len(extractions)} documents reconciled{title_bit}"), **_NEXT)
    pdf.ln(4)

    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Summary", **_NEXT)
    pdf.set_font("Helvetica", "", 10)
    n_crit = len(result.critical)
    n_unc = len(result.uncertain)
    n_var = len(result.variants)
    pdf.multi_cell(0, 5, _safe(
        f"Critical blockers: {n_crit}   |   Uncertain (manual review): {n_unc}   |   "
        f"Harmless variants: {n_var}"), **_NEXT)
    pdf.ln(2)

    if result.primary_blocker_doc:
        rem = REMEDIATION_PORTALS.get(result.primary_blocker_doc, REMEDIATION_PORTALS["Other"])
        pdf.set_fill_color(255, 235, 238)
        pdf.set_font("Helvetica", "B", 11)
        pdf.multi_cell(0, 6, _safe(
            f"FIX FIRST: {result.primary_blocker_doc} "
            f"(implicated in {result.blocker_counts[result.primary_blocker_doc]} critical mismatch(es))"),
            fill=True, **_NEXT)
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, _safe(f"Where: {rem['portal']}  {rem['url']}\nHow: {rem['how']}"), **_NEXT)
        pdf.ln(2)

    if form_checks:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Form vs Document Verification", **_NEXT)
        for check in form_checks:
            color = _STATUS_COLORS.get(check.status, (0, 0, 0))
            pdf.set_text_color(*color)
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 5, _safe(f"[{check.status}] {check.label}"), **_NEXT)
            pdf.set_text_color(60, 60, 60)
            pdf.set_font("Helvetica", "", 9)
            pdf.multi_cell(0, 5, _safe(
                f"    Form: '{check.form_value}'  |  "
                f"{check.doc_type or '—'}: '{check.doc_value or '—'}' - {check.detail}"), **_NEXT)

    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 8, "Extracted Values (as written on each document)", **_NEXT)
    for rec in extractions:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, _safe(f"{rec['doc_type']}  ({rec.get('source_file', 'sample')})"), **_NEXT)
        pdf.set_font("Helvetica", "", 9)
        for key, label in FIELD_LABELS.items():
            value = rec["fields"].get(key, "UNCERTAIN")
            pdf.multi_cell(0, 5, _safe(f"    {label}: {value}"), **_NEXT)
        pdf.ln(1)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Cross-document Findings", **_NEXT)
    ordered = ([c for c in result.comparisons if c.status == CRITICAL]
               + [c for c in result.comparisons if c.status == UNCERTAIN]
               + [c for c in result.comparisons if c.status == VARIANT])
    if not ordered:
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 6, "All compared fields match across all documents.", **_NEXT)
    for comp in ordered:
        color = _STATUS_COLORS[comp.status]
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 5, _safe(f"[{comp.status}] {FIELD_LABELS[comp.field]}: "
                             f"{comp.doc_a} vs {comp.doc_b}"), **_NEXT)
        pdf.set_text_color(60, 60, 60)
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, _safe(
            f"    '{comp.value_a}'  vs  '{comp.value_b}' - {comp.detail}"), **_NEXT)

    pdf.set_text_color(120, 120, 120)
    pdf.set_font("Helvetica", "I", 8)
    pdf.ln(4)
    pdf.multi_cell(0, 4, _safe(
        "Extraction: Sarvam Vision + Sarvam-30B. Voice form: Saaras v3 + Bulbul v3. "
        "Reconciliation: IdentityGraph engine. UNCERTAIN fields were never guessed. "
        "This report is an aid for the applicant/operator and is not an official verification."), **_NEXT)

    return bytes(pdf.output())
