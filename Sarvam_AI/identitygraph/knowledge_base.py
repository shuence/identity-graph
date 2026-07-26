"""Service knowledge base — the rules a Suvidha / RTO / CSC operator carries in their head.

This is what makes the desk reliable across Aadhaar, RTO, schemes, and complaints:
not just "did we extract text", but "is this form correctly filled for THIS service?"

Each service KB entry encodes:
  - field format rules (Aadhaar 12 digits, PAN pattern, mobile 10 digits, DL number, etc.)
  - required vs optional fields
  - required supporting documents
  - common rejection reasons portals actually use
  - eligibility / process notes the operator should check before upload
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from dateutil import parser as dateparser

# ---------------------------------------------------------------------------
# Field-level validators (shared across services)
# ---------------------------------------------------------------------------

def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def validate_aadhaar(value: str) -> tuple[bool, str]:
    d = _digits(value)
    if len(d) != 12:
        return False, f"Aadhaar must be exactly 12 digits (got {len(d)})"
    if d[0] in "01":
        return False, "Aadhaar cannot start with 0 or 1"
    return True, "Valid 12-digit Aadhaar format"


def validate_pan(value: str) -> tuple[bool, str]:
    v = re.sub(r"\s", "", (value or "")).upper()
    if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", v):
        return False, "PAN must match format AAAAA9999A (5 letters + 4 digits + 1 letter)"
    return True, "Valid PAN format"


def validate_mobile(value: str) -> tuple[bool, str]:
    d = _digits(value)
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    if len(d) != 10:
        return False, f"Mobile must be 10 digits (got {len(d)})"
    if d[0] not in "6789":
        return False, "Indian mobile numbers start with 6, 7, 8, or 9"
    return True, "Valid mobile format"


def validate_dob(value: str) -> tuple[bool, str]:
    if not (value or "").strip():
        return False, "Date of birth is required"
    try:
        dt = dateparser.parse(value, dayfirst=True, fuzzy=True)
    except (ValueError, OverflowError):
        return False, "Could not parse date of birth"
    if dt.year < 1900 or dt.date() > datetime.now().date():
        return False, "Date of birth is out of realistic range"
    age = (datetime.now().date() - dt.date()).days // 365
    return True, f"Parsed as {dt.date().strftime('%d/%m/%Y')} (approx age {age})"


def validate_dl_number(value: str) -> tuple[bool, str]:
    v = re.sub(r"[\s\-]", "", (value or "")).upper()
    # Rough Indian DL pattern: 2-letter state + 2-digit RTO + year + serial (varies by state)
    if len(v) < 10 or len(v) > 20:
        return False, "DL number length looks wrong (expected ~10–16 characters)"
    if not re.match(r"^[A-Z]{2}", v):
        return False, "DL number should start with state code (e.g. MH, KA, DL)"
    return True, "DL number format looks plausible"


def validate_nonempty(value: str, label: str = "Field") -> tuple[bool, str]:
    if not (value or "").strip():
        return False, f"{label} is empty — form is incomplete"
    if len((value or "").strip()) < 2:
        return False, f"{label} is too short to be valid"
    return True, "Present"


def validate_pincode_in_address(value: str) -> tuple[bool, str]:
    if not (value or "").strip():
        return False, "Address is empty"
    if not re.search(r"\b\d{6}\b", value):
        return False, "Address should include a 6-digit pincode (portals often reject without it)"
    return True, "Address includes a pincode"


VALIDATORS = {
    "aadhaar": validate_aadhaar,
    "pan": validate_pan,
    "mobile": validate_mobile,
    "dob": validate_dob,
    "dl_number": validate_dl_number,
    "nonempty": validate_nonempty,
    "address_pincode": validate_pincode_in_address,
}


# ---------------------------------------------------------------------------
# Per-service knowledge base
# ---------------------------------------------------------------------------

KNOWLEDGE_BASE: dict[str, dict] = {
    "link_mobile_aadhaar": {
        "category": "Aadhaar / identity update",
        "process_summary": (
            "Citizen visits Seva Kendra → fills update form → produces Aadhaar + supporting ID → "
            "operator verifies name/DOB match → biometric/OTP → portal upload."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "father_name": {"validators": ["nonempty"]},
            "dob": {"validators": ["dob"], "must_match_doc": "Aadhaar Card"},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "address": {"validators": ["address_pincode"]},
            "reason": {"validators": ["nonempty"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["PAN Card", "Bank Passbook"],
        "rejection_reasons": [
            "Name on form does not match Aadhaar spelling",
            "Aadhaar number mistyped (not 12 digits)",
            "Mobile already linked to another Aadhaar",
            "Supporting document photo unreadable / stamp covering DOB",
            "Address without pincode",
        ],
        "operator_checklist": [
            "Confirm mobile is in the citizen's possession (SIM with them)",
            "Name spelling must match Aadhaar exactly for portal accept",
            "If DOB conflicts across docs — fix the outlier document first, do not upload",
        ],
        "accuracy_weights": {
            "format_ok": 0.35,
            "docs_present": 0.20,
            "form_doc_match": 0.35,
            "completeness": 0.10,
        },
    },
    "pan_aadhaar_link": {
        "category": "Income tax / KYC",
        "process_summary": "Link PAN↔Aadhaar on e-filing portal; name and DOB must match both cards.",
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "PAN Card"},
            "pan_number": {"validators": ["pan"], "must_match_doc": "PAN Card"},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "dob": {"validators": ["dob"]},
            "mobile": {"validators": ["mobile"]},
        },
        "required_docs": ["Aadhaar Card", "PAN Card"],
        "recommended_docs": [],
        "rejection_reasons": [
            "PAN name vs Aadhaar name mismatch (Mohd vs Mohammed often fails automated link)",
            "Invalid PAN format",
            "DOB mismatch between PAN and Aadhaar",
        ],
        "operator_checklist": [
            "If name variants differ, prefer correcting PAN via Form 49A before linking",
            "Ensure mobile is registered on the income-tax account",
        ],
        "accuracy_weights": {
            "format_ok": 0.40,
            "docs_present": 0.25,
            "form_doc_match": 0.25,
            "completeness": 0.10,
        },
    },
    "rto_dl_update": {
        "category": "RTO / Parivahan",
        "process_summary": (
            "Citizen needs DL name/address change → Sarathi form → DL + Aadhaar + address proof → "
            "RTO clerk verifies → fee → biometric / photo → approval."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "dl_number": {"validators": ["dl_number"], "must_match_doc": "Driving License"},
            "dob": {"validators": ["dob"]},
            "mobile": {"validators": ["mobile"]},
            "old_address": {"validators": ["nonempty"]},
            "new_address": {"validators": ["address_pincode"]},
            "change_type": {"validators": ["nonempty"]},
        },
        "required_docs": ["Driving License", "Aadhaar Card"],
        "recommended_docs": ["Bank Passbook", "Ration Card"],
        "rejection_reasons": [
            "DL number does not match physical licence",
            "New address proof missing or pincode absent",
            "Name on DL vs Aadhaar mismatch without gazette / affidavit",
            "Photo / signature strip unreadable on scan",
        ],
        "operator_checklist": [
            "Confirm change_type is Name / Address / both",
            "For name change, check if state RTO requires affidavit or gazette",
            "Scan both sides of DL",
        ],
        "accuracy_weights": {
            "format_ok": 0.30,
            "docs_present": 0.25,
            "form_doc_match": 0.35,
            "completeness": 0.10,
        },
    },
    "scheme_apply": {
        "category": "Government scheme darkhast (application)",
        "process_summary": (
            "Citizen asks 'which scheme am I eligible for?' or comes with a named scheme → "
            "desk captures identity + income/category → checks eligibility rules in KB → "
            "fills application → attaches docs → portal / CSC upload."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "dob": {"validators": ["dob"]},
            "mobile": {"validators": ["mobile"]},
            "address": {"validators": ["address_pincode"]},
            "scheme_name": {"validators": ["nonempty"]},
            "category": {"validators": ["nonempty"]},
            "annual_income": {"validators": ["nonempty"]},
        },
        "required_docs": ["Aadhaar Card", "Ration Card"],
        "recommended_docs": ["Bank Passbook", "School Certificate"],
        "rejection_reasons": [
            "Income above scheme ceiling",
            "Category (SC/ST/OBC/EWS/General) not supported by chosen scheme",
            "Duplicate application already pending",
            "Bank account not in applicant's name",
            "Aadhaar not linked to mobile (OTP fails)",
        ],
        "operator_checklist": [
            "Confirm scheme_name against the known catalogue in KB",
            "Income proof / ration card category must support eligibility claim",
            "Bank passbook name must match applicant (DBT)",
        ],
        "scheme_catalogue": [
            {
                "name": "PM-KISAN",
                "eligibility": "Landholding farmer family; Aadhaar mandatory; exclude income-tax payers",
                "docs": ["Aadhaar Card", "Land record / 7/12", "Bank Passbook"],
            },
            {
                "name": "Ayushman Bharat (PM-JAY)",
                "eligibility": "SECC / state-listed poor & vulnerable families",
                "docs": ["Aadhaar Card", "Ration Card"],
            },
            {
                "name": "e-Shram registration",
                "eligibility": "Unorganised worker 16–59 years",
                "docs": ["Aadhaar Card", "Bank Passbook"],
            },
            {
                "name": "State scholarship / fee reimbursement",
                "eligibility": "Student; caste/income certificate; institute enrolment",
                "docs": ["Aadhaar Card", "School Certificate", "Ration Card", "Bank Passbook"],
            },
        ],
        "accuracy_weights": {
            "format_ok": 0.25,
            "docs_present": 0.25,
            "form_doc_match": 0.25,
            "completeness": 0.15,
            "eligibility_hint": 0.10,
        },
    },
    "grievance_complaint": {
        "category": "Public grievance / complaint",
        "process_summary": (
            "Citizen has a service failure (Aadhaar update stuck, RTO delay, scheme rejection) → "
            "desk captures identity + factual complaint → attaches evidence → files on CPGRAMS / "
            "state portal / department desk."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"]},
            "mobile": {"validators": ["mobile"]},
            "aadhaar_number": {"validators": ["aadhaar"]},
            "department": {"validators": ["nonempty"]},
            "complaint_summary": {"validators": ["nonempty"]},
            "desired_outcome": {"validators": ["nonempty"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["Acknowledgement receipt", "Rejection letter"],
        "rejection_reasons": [
            "Complaint too vague — no date, reference number, or office named",
            "Wrong department selected",
            "Duplicate grievance already open",
            "No supporting evidence attached",
        ],
        "operator_checklist": [
            "Capture reference / acknowledgement number if any prior filing exists",
            "Keep complaint factual — dates, office, what was promised vs what happened",
            "Ask for desired outcome (refund / correction / status)",
        ],
        "accuracy_weights": {
            "format_ok": 0.30,
            "docs_present": 0.20,
            "form_doc_match": 0.20,
            "completeness": 0.30,
        },
    },
}


@dataclass
class FieldIssue:
    field_key: str
    severity: str  # FAIL | WARN | OK
    message: str


@dataclass
class KnowledgeValidation:
    service_id: str
    score: float  # 0–100
    grade: str  # READY | FIX_REQUIRED | BLOCKED
    field_issues: list[FieldIssue] = field(default_factory=list)
    missing_docs: list[str] = field(default_factory=list)
    rejection_risks: list[str] = field(default_factory=list)
    checklist: list[str] = field(default_factory=list)
    process_summary: str = ""
    details: dict = field(default_factory=dict)

    @property
    def is_portal_ready(self) -> bool:
        return self.grade == "READY"


def get_kb(service_id: str) -> dict:
    if service_id not in KNOWLEDGE_BASE:
        raise KeyError(f"No knowledge base for service {service_id!r}")
    return KNOWLEDGE_BASE[service_id]


def validate_against_knowledge(
    service_id: str,
    answers: dict[str, str],
    extractions: list[dict] | None = None,
    form_doc_statuses: dict[str, str] | None = None,
) -> KnowledgeValidation:
    """Score whether the filled form is accurate enough to send to the portal.

    Combines:
      1. Format / completeness rules from the service KB
      2. Required-document presence
      3. Form↔document match statuses (from form_check), if provided
      4. Scheme eligibility hints (scheme_apply only)
    """
    kb = get_kb(service_id)
    extractions = extractions or []
    form_doc_statuses = form_doc_statuses or {}
    present_docs = {e["doc_type"] for e in extractions}

    issues: list[FieldIssue] = []
    format_ok = format_total = 0
    complete_ok = complete_total = 0

    for key, rule in kb["field_rules"].items():
        value = (answers.get(key) or "").strip()
        complete_total += 1
        if value:
            complete_ok += 1
        else:
            issues.append(FieldIssue(key, "FAIL", "Required field is empty"))
            continue

        for vname in rule.get("validators", []):
            fn = VALIDATORS[vname]
            format_total += 1
            if vname == "nonempty":
                ok, msg = fn(value, key)
            else:
                ok, msg = fn(value)
            if ok:
                format_ok += 1
                issues.append(FieldIssue(key, "OK", msg))
            else:
                issues.append(FieldIssue(key, "FAIL", msg))

    missing_docs = [d for d in kb["required_docs"] if d not in present_docs]
    docs_score = 1.0 if not kb["required_docs"] else max(
        0.0, 1.0 - (len(missing_docs) / len(kb["required_docs"]))
    )

    # Form-doc match component
    if form_doc_statuses:
        ranks = {"MATCH": 1.0, "VARIANT": 0.85, "UNCERTAIN": 0.4, "CRITICAL": 0.0}
        vals = [ranks.get(s, 0.5) for s in form_doc_statuses.values()]
        match_score = sum(vals) / len(vals) if vals else 0.5
        for key, status in form_doc_statuses.items():
            if status == "CRITICAL":
                issues.append(FieldIssue(key, "FAIL", "Form value conflicts with supporting document"))
            elif status == "UNCERTAIN":
                issues.append(FieldIssue(key, "WARN", "Could not verify against documents — operator must check"))
    else:
        match_score = 0.5 if extractions else 0.0

    format_score = (format_ok / format_total) if format_total else 0.0
    completeness = (complete_ok / complete_total) if complete_total else 0.0

    weights = kb.get("accuracy_weights", {})
    w_format = weights.get("format_ok", 0.35)
    w_docs = weights.get("docs_present", 0.20)
    w_match = weights.get("form_doc_match", 0.35)
    w_comp = weights.get("completeness", 0.10)
    w_elig = weights.get("eligibility_hint", 0.0)

    elig_score = 1.0
    rejection_risks: list[str] = []
    if service_id == "scheme_apply" and w_elig:
        elig_score, rejection_risks = _scheme_eligibility_hint(answers, kb)

    # If required docs missing, surface portal rejection risk
    if missing_docs:
        rejection_risks.append(f"Missing required documents: {', '.join(missing_docs)}")

    # Pull relevant canned rejection reasons when format fails
    fails = [i for i in issues if i.severity == "FAIL"]
    if fails:
        rejection_risks.extend(kb["rejection_reasons"][:2])

    score = 100.0 * (
        w_format * format_score
        + w_docs * docs_score
        + w_match * match_score
        + w_comp * completeness
        + w_elig * elig_score
    )

    if any(i.severity == "FAIL" for i in issues) or missing_docs:
        grade = "BLOCKED" if score < 60 else "FIX_REQUIRED"
    elif any(i.severity == "WARN" for i in issues):
        grade = "FIX_REQUIRED" if score < 85 else "READY"
    else:
        grade = "READY" if score >= 80 else "FIX_REQUIRED"

    return KnowledgeValidation(
        service_id=service_id,
        score=round(score, 1),
        grade=grade,
        field_issues=issues,
        missing_docs=missing_docs,
        rejection_risks=list(dict.fromkeys(rejection_risks)),
        checklist=list(kb.get("operator_checklist", [])),
        process_summary=kb.get("process_summary", ""),
        details={
            "format_score": round(format_score * 100, 1),
            "docs_score": round(docs_score * 100, 1),
            "match_score": round(match_score * 100, 1),
            "completeness": round(completeness * 100, 1),
            "eligibility_score": round(elig_score * 100, 1),
            "category": kb.get("category", ""),
        },
    )


def _scheme_eligibility_hint(answers: dict[str, str], kb: dict) -> tuple[float, list[str]]:
    """Soft check: does the named scheme exist in catalogue? Income/category present?"""
    risks: list[str] = []
    name = (answers.get("scheme_name") or "").strip().lower()
    catalogue = kb.get("scheme_catalogue", [])
    if not name:
        return 0.0, ["No scheme selected"]
    matched = next((s for s in catalogue if s["name"].lower() in name or name in s["name"].lower()), None)
    if not matched:
        risks.append(
            f"Scheme '{answers.get('scheme_name')}' not in local catalogue — "
            "operator must confirm the correct portal and eligibility manually"
        )
        return 0.55, risks
    if not (answers.get("category") or "").strip():
        risks.append("Category (SC/ST/OBC/EWS/General) missing — many schemes reject without it")
        return 0.6, risks
    income = answers.get("annual_income") or ""
    if not re.search(r"\d", income):
        risks.append("Annual income should include a number for eligibility screening")
        return 0.65, risks
    return 0.95, [f"Matched catalogue scheme: {matched['name']} — {matched['eligibility']}"]
