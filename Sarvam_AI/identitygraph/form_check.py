"""Compare form answers against extracted document fields.

For each form field, pick ONE source of truth among uploaded docs that actually
have a readable value (Aadhaar → PAN → DL → … → Bank). A blank passbook DOB
never blocks a good Aadhaar/PAN match.
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

# Fields that commonly appear on each doc type (used for UI / fill hints).
_FIELD_LIKELY_ON = {
    "full_name": ("Aadhaar Card", "PAN Card", "Driving License", "Bank Passbook", "Voter ID"),
    "father_name": ("Aadhaar Card", "PAN Card", "Driving License"),
    "dob": ("Aadhaar Card", "PAN Card", "Driving License"),
    "address": ("Aadhaar Card", "Driving License", "Bank Passbook", "Ration Card"),
    "id_number": ("Aadhaar Card", "PAN Card", "Driving License", "Bank Passbook", "Voter ID"),
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
    # Other docs that had this field (readable) — for operator transparency.
    other_sources: list[str] = field(default_factory=list)


@dataclass
class FormVerification:
    checks: list[FormDocCheck] = field(default_factory=list)
    approved_fields: dict[str, str] = field(default_factory=dict)
    # Readable sources only (skips UNCERTAIN docs) — for the UI matrix.
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


def best_readable_value(
    extractions: list[dict],
    field_key: str,
    prefer_doc: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (doc_type, value) for the highest-priority doc with a readable field."""
    readable: list[tuple[int, str, str]] = []
    for e in extractions:
        val = (e.get("fields") or {}).get(field_key, "UNCERTAIN")
        if is_uncertain(val):
            continue
        prio = _DOC_PRIORITY.get(e.get("doc_type", ""), 50)
        if prefer_doc and e.get("doc_type") == prefer_doc:
            prio = -1
        readable.append((prio, e["doc_type"], str(val).strip()))
    if not readable:
        return None, None
    readable.sort(key=lambda t: t[0])
    _, doc_type, value = readable[0]
    return doc_type, value


def verify_form_against_docs(
    form_answers: dict[str, str],
    form_fields: list[dict],
    extractions: list[dict],
) -> FormVerification:
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

        # Only compare against documents that actually yielded this field.
        readable_checks: list[FormDocCheck] = []
        skipped_uncertain: list[str] = []

        ordered = sorted(
            extractions,
            key=lambda e: (
                0 if prefer_doc and e.get("doc_type") == prefer_doc else 1,
                _DOC_PRIORITY.get(e.get("doc_type", ""), 50),
            ),
        )

        for rec in ordered:
            doc_val = rec["fields"].get(compare_to, "UNCERTAIN")
            if is_uncertain(doc_val):
                skipped_uncertain.append(rec["doc_type"])
                continue

            if is_uncertain(form_val):
                status, detail = UNCERTAIN, "Form field is empty — citizen must answer"
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
            readable_checks.append(check)
            result.all_checks.append(check)

        best = _pick_best(readable_checks, prefer_doc)

        if best is None:
            # No uploaded doc has this field readable.
            likely = _FIELD_LIKELY_ON.get(compare_to, ())
            hint = (
                f"None of the uploaded documents have a readable '{compare_to}'. "
                f"Skipped (field absent): {', '.join(skipped_uncertain) or '—'}. "
            )
            if likely:
                hint += f"Usually found on: {', '.join(likely)}."
            best = FormDocCheck(
                form_key=key,
                label=spec["label"],
                form_value=form_val or "—",
                doc_type=None,
                doc_value=None,
                status=UNCERTAIN,
                detail=hint,
                high_stakes=high_stakes,
            )
        else:
            others = [
                f"{c.doc_type}: {c.doc_value}"
                for c in readable_checks
                if c.doc_type != best.doc_type
            ]
            best.other_sources = others
            skip_note = ""
            if skipped_uncertain:
                skip_note = (
                    f" Ignored {', '.join(skipped_uncertain)} "
                    f"(no readable {compare_to} on those docs)."
                )
            if best.status in (MATCH, VARIANT):
                best.detail = (
                    f"Checked against {best.doc_type} as source of truth. "
                    f"{best.detail}{skip_note}"
                )
            elif best.status == CRITICAL:
                best.detail = (
                    f"Mismatch vs {best.doc_type} (preferred readable source). "
                    f"{best.detail}{skip_note}"
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
    # 3) Prefer CRITICAL on preferred / highest-priority doc (real mismatch).
    critical = [c for c in checks if c.status == CRITICAL]
    if critical:
        critical.sort(key=lambda c: _DOC_PRIORITY.get(c.doc_type or "", 50))
        return critical[0]
    # 4) Remaining (UNCERTAIN form empty, etc.)
    checks_sorted = sorted(
        checks,
        key=lambda c: (
            0 if prefer_doc and c.doc_type == prefer_doc else 1,
            _DOC_PRIORITY.get(c.doc_type or "", 50),
        ),
    )
    return checks_sorted[0]
