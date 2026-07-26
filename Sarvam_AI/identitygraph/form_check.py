"""Compare form answers against extracted document fields.

Prefers Aadhaar (then PAN, then other IDs) and skips blank/UNCERTAIN document
values when a better readable document exists — so a blank passbook does not
hide a good Aadhaar match.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .reconcile import CRITICAL, MATCH, UNCERTAIN, VARIANT, compare_field, is_uncertain

# Lower = preferred when choosing which document to verify a field against.
_DOC_PRIORITY = {
    "Aadhaar Card": 0,
    "PAN Card": 1,
    "Driving License": 2,
    "Voter ID": 3,
    "Passport": 4,
    "Ration Card": 5,
    "School Certificate": 6,
    "Bank Passbook": 7,
}


@dataclass
class FormDocCheck:
    form_key: str
    label: str
    form_value: str
    doc_type: str | None
    doc_value: str | None
    status: str
    detail: str
    high_stakes: bool = True


@dataclass
class FormVerification:
    checks: list[FormDocCheck] = field(default_factory=list)
    approved_fields: dict[str, str] = field(default_factory=dict)
    # Every form-field × document comparison (for the UI matrix).
    all_checks: list[FormDocCheck] = field(default_factory=list)

    @property
    def blockers(self) -> list[FormDocCheck]:
        return [c for c in self.checks if c.status == CRITICAL]

    @property
    def uncertain(self) -> list[FormDocCheck]:
        return [c for c in self.checks if c.status == UNCERTAIN]

    @property
    def ready_for_portal(self) -> bool:
        return not self.blockers and not self.uncertain


def verify_form_against_docs(
    form_answers: dict[str, str],
    form_fields: list[dict],
    extractions: list[dict],
) -> FormVerification:
    by_type = {e["doc_type"]: e for e in extractions}
    result = FormVerification()

    for spec in form_fields:
        key = spec["key"]
        form_val = (form_answers.get(key) or "").strip()
        compare_to = spec.get("compare_to")
        high_stakes = bool(spec.get("high_stakes"))

        if not compare_to:
            if form_val:
                result.approved_fields[key] = form_val
            continue

        prefer_doc = spec.get("compare_doc")
        if prefer_doc and prefer_doc in by_type:
            candidates = [by_type[prefer_doc]] + [e for e in extractions if e["doc_type"] != prefer_doc]
        else:
            # Prefer identity docs over passbook when the field is identity-like.
            candidates = sorted(
                extractions,
                key=lambda e: _DOC_PRIORITY.get(e["doc_type"], 50),
            )

        per_doc: list[FormDocCheck] = []
        for rec in candidates:
            doc_val = rec["fields"].get(compare_to, "UNCERTAIN")
            if is_uncertain(form_val):
                status, detail = UNCERTAIN, "Form field is empty — citizen must answer"
            elif is_uncertain(doc_val):
                status, detail = (
                    UNCERTAIN,
                    f"{rec['doc_type']} did not yield a readable '{compare_to}' "
                    f"(OCR/extraction returned UNCERTAIN)",
                )
            else:
                status, detail = compare_field(compare_to, form_val, doc_val)
            check = FormDocCheck(
                form_key=key,
                label=spec["label"],
                form_value=form_val or "—",
                doc_type=rec["doc_type"],
                doc_value=doc_val,
                status=status,
                detail=detail,
                high_stakes=high_stakes,
            )
            per_doc.append(check)
            result.all_checks.append(check)

        best = _pick_best(per_doc, prefer_doc)
        if best is None:
            best = FormDocCheck(
                form_key=key, label=spec["label"], form_value=form_val or "—",
                doc_type=None, doc_value=None, status=UNCERTAIN,
                detail="No supporting document available to verify this field — "
                       "Aadhaar/PAN may have failed to digitize",
                high_stakes=high_stakes,
            )

        result.checks.append(best)
        if best.status in (MATCH, VARIANT) and form_val:
            result.approved_fields[key] = form_val

    return result


def _pick_best(checks: list[FormDocCheck], prefer_doc: str | None) -> FormDocCheck | None:
    if not checks:
        return None
    # 1) Prefer MATCH/VARIANT on the preferred document.
    if prefer_doc:
        for c in checks:
            if c.doc_type == prefer_doc and c.status in (MATCH, VARIANT):
                return c
    # 2) Any MATCH/VARIANT, preferring higher-priority doc types.
    readable = [c for c in checks if c.status in (MATCH, VARIANT)]
    if readable:
        readable.sort(key=lambda c: _DOC_PRIORITY.get(c.doc_type or "", 50))
        return readable[0]
    # 3) Prefer CRITICAL on preferred doc (real mismatch beats "couldn't read passbook").
    critical = [c for c in checks if c.status == CRITICAL]
    if critical:
        critical.sort(key=lambda c: _DOC_PRIORITY.get(c.doc_type or "", 50))
        return critical[0]
    # 4) UNCERTAIN — prefer preferred doc, else highest-priority doc.
    checks_sorted = sorted(
        checks,
        key=lambda c: (
            0 if prefer_doc and c.doc_type == prefer_doc else 1,
            _DOC_PRIORITY.get(c.doc_type or "", 50),
        ),
    )
    return checks_sorted[0]
