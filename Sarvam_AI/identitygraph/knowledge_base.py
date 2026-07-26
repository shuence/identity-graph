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


def validate_epic(value: str) -> tuple[bool, str]:
    v = re.sub(r"[\s\-]", "", (value or "")).upper()
    # EPIC is typically 3 letters + 7 digits (10 chars); some older formats vary
    if re.fullmatch(r"[A-Z]{3}[0-9]{7}", v):
        return True, "Valid EPIC format (3 letters + 7 digits)"
    if 8 <= len(v) <= 12 and re.search(r"[A-Z]", v) and re.search(r"\d", v):
        return True, "EPIC format looks plausible (non-standard length — verify on card)"
    return False, "EPIC should look like ABC1234567 (3 letters + 7 digits)"


def validate_passport_number(value: str) -> tuple[bool, str]:
    v = re.sub(r"[\s\-]", "", (value or "")).upper()
    if not v:
        return True, "Optional — blank OK for fresh passport"
    if re.fullmatch(r"[A-Z][0-9]{7}", v):
        return True, "Valid Indian passport number format"
    if re.fullmatch(r"[A-Z]{1,2}[0-9]{6,8}", v):
        return True, "Passport number format looks plausible"
    return False, "Passport number usually looks like A1234567"


def validate_ifsc(value: str) -> tuple[bool, str]:
    v = re.sub(r"\s", "", (value or "")).upper()
    if not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", v):
        return False, "IFSC must be 11 chars: 4 letters + 0 + 6 alphanumeric"
    return True, "Valid IFSC format"


def validate_account_number(value: str) -> tuple[bool, str]:
    d = _digits(value)
    if len(d) < 9 or len(d) > 18:
        return False, f"Account number length looks wrong (got {len(d)} digits)"
    return True, "Account number length looks plausible"


def validate_email(value: str) -> tuple[bool, str]:
    v = (value or "").strip()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
        return False, "Email does not look valid"
    return True, "Valid email format"


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
    "epic": validate_epic,
    "passport": validate_passport_number,
    "ifsc": validate_ifsc,
    "account_number": validate_account_number,
    "email": validate_email,
    "nonempty": validate_nonempty,
    "address_pincode": validate_pincode_in_address,
}


# ---------------------------------------------------------------------------
# Per-service knowledge base
# ---------------------------------------------------------------------------

KNOWLEDGE_BASE: dict[str, dict] = {
    "link_mobile_aadhaar": {
        "category": "Aadhaar / Form 1 enrolment & update",
        "process_summary": (
            "Citizen visits Aadhaar Seva Kendra with Form 1 (block letters) + POI/POA → "
            "operator captures only fields marked for update → biometric/OTP → UIDAI processes."
        ),
        "field_rules": {
            "update_fields": {"validators": ["nonempty"]},
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "dob": {"validators": ["dob"], "must_match_doc": "Aadhaar Card"},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "address": {"validators": ["address_pincode"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["PAN Card", "Bank Passbook"],
        "rejection_reasons": [
            "Name on Form 1 does not match POI spelling (titles/honorifics included)",
            "Aadhaar number mistyped (not 12 digits)",
            "Address without pincode / post office",
            "Updated fields left blank while Purpose=Update",
            "Supporting document photo unreadable",
        ],
        "operator_checklist": [
            "Form 1: use BLOCK/CAPITAL letters only (UIDAI instructions)",
            "For update — fill only fields being changed",
            "Omit Shri/Smt/Dr titles from name",
            "Confirm mobile SIM is with the citizen",
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
            "dl_number": {
                "validators": ["dl_number"],
                "must_match_doc": "Driving License",
                "optional": True,
            },
            "pan_number": {
                "validators": ["pan"],
                "must_match_doc": "PAN Card",
                "optional": True,
            },
            "dob": {"validators": ["dob"]},
            "mobile": {"validators": ["mobile"], "optional": True},
            "old_address": {"validators": ["nonempty"], "optional": True},
            "new_address": {"validators": ["address_pincode"]},
            "change_type": {"validators": [], "optional": True},
        },
        "required_docs": ["Driving License", "Aadhaar Card"],
        "recommended_docs": ["PAN Card", "Bank Passbook", "Ration Card"],
        "rejection_reasons": [
            "DL number does not match physical licence",
            "PAN format invalid or does not match physical card",
            "New address proof missing or pincode absent",
            "Name on DL vs Aadhaar mismatch without gazette / affidavit",
            "Photo / signature strip unreadable on scan",
        ],
        "operator_checklist": [
            "Confirm change_type if known (Name / Address / both) — optional on this desk form",
            "If PAN uploaded, match PAN number AAAAA9999A to the card",
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
    "voter_form8": {
        "category": "Elections — Form 8",
        "process_summary": (
            "Citizen needs roll correction / shift / EPIC replacement → Form 8 (online or printed) → "
            "attach address/ID proof → BLO/ERO verifies → EPIC updated."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Voter ID"},
            "epic_number": {"validators": ["epic"], "must_match_doc": "Voter ID"},
            "dob": {"validators": ["dob"]},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "request_type": {"validators": ["nonempty"]},
            "correction_fields": {"validators": ["nonempty"]},
            "new_address": {"validators": ["address_pincode"]},
        },
        "required_docs": ["Aadhaar Card", "Voter ID"],
        "recommended_docs": ["Ration Card", "Electricity Bill"],
        "rejection_reasons": [
            "Name/DOB on Form 8 does not match Aadhaar or EPIC",
            "Address proof missing for shift of residence",
            "More than 4 particulars marked for correction",
            "Lost EPIC without FIR / police report when required",
            "Photo not affixed / wrong size on printed Form 8",
        ],
        "operator_checklist": [
            "Tick only the request parts that apply (correction / shift / replacement)",
            "Self-attest every supporting photocopy",
            "For address shift, proof must show the NEW address",
            "Confirm EPIC number from physical card, not memory",
        ],
        "accuracy_weights": {
            "format_ok": 0.30,
            "docs_present": 0.25,
            "form_doc_match": 0.35,
            "completeness": 0.10,
        },
    },
    "voter_form6": {
        "category": "Elections — Form 6",
        "process_summary": (
            "First-time elector → Form 6 → age proof + address proof → BLO verification → "
            "name added to draft roll → EPIC issued."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "father_name": {"validators": ["nonempty"]},
            "dob": {"validators": ["dob"]},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "gender": {"validators": ["nonempty"]},
            "address": {"validators": ["address_pincode"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["Ration Card", "Birth Certificate", "School Certificate"],
        "rejection_reasons": [
            "Applicant under 18 on qualifying date",
            "Already enrolled elsewhere (duplicate EPIC)",
            "Address proof does not match ordinary residence claimed",
            "Name spelling differs from Aadhaar / school certificate",
        ],
        "operator_checklist": [
            "Confirm age ≥ 18 on the qualifying date for the revision",
            "Ordinary residence must be the place where the citizen actually lives",
            "Photograph quality matters on paper Form 6 camps",
        ],
        "accuracy_weights": {
            "format_ok": 0.30,
            "docs_present": 0.20,
            "form_doc_match": 0.35,
            "completeness": 0.15,
        },
    },
    "passport_apply": {
        "category": "Passport Seva",
        "process_summary": (
            "CSC/operator fills Passport Seva e-form in CAPITAL LETTERS → fee + appointment → "
            "citizen visits PSK with originals → biometrics + document check → police verification."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "father_name": {"validators": ["nonempty"]},
            "dob": {"validators": ["dob"], "must_match_doc": "Aadhaar Card"},
            "place_of_birth": {"validators": ["nonempty"]},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "email": {"validators": ["email"]},
            "address": {"validators": ["address_pincode"]},
            "service_type": {"validators": ["nonempty"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["PAN Card", "Bank Passbook", "Old Passport"],
        "rejection_reasons": [
            "Given name / surname split does not match Aadhaar",
            "DOB mismatch across Aadhaar and old passport",
            "Present address proof missing or different from form",
            "Annexure not filled for name change / ECR / minor",
            "Old passport details blank on re-issue application",
        ],
        "operator_checklist": [
            "Fill names in CAPITAL LETTERS as Passport Seva instructs",
            "Split given name vs surname carefully — do not invent a surname",
            "For re-issue, copy passport number from the physical booklet",
            "List all addresses of stay in the last one year if asked",
        ],
        "accuracy_weights": {
            "format_ok": 0.30,
            "docs_present": 0.20,
            "form_doc_match": 0.40,
            "completeness": 0.10,
        },
    },
    "pan_correction": {
        "category": "Tax / PAN correction",
        "process_summary": (
            "Citizen cannot link PAN↔Aadhaar due to name/DOB mismatch → PAN Change Request "
            "(online or block-letter paper at facilitation centre) → attach proof → reprint card."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "pan_number": {"validators": ["pan"], "must_match_doc": "PAN Card"},
            "father_name": {"validators": ["nonempty"]},
            "dob": {"validators": ["dob"], "must_match_doc": "Aadhaar Card"},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "fields_to_correct": {"validators": ["nonempty"]},
        },
        "required_docs": ["PAN Card", "Aadhaar Card"],
        "recommended_docs": ["Birth Certificate", "Gazette Notification", "Marriage Certificate"],
        "rejection_reasons": [
            "Requested name not supported by proof of identity",
            "Core PAN data variance without supporting documents",
            "Titles (Shri/Smt/Dr) included in name field",
            "Aadhaar has initials but PAN form used expanded name without proof",
            "Major name change without gazette / marriage certificate",
        ],
        "operator_checklist": [
            "Tick only the fields being corrected on the CR form",
            "Do not use titles or abbreviations in the name column",
            "Prefer aligning PAN spelling to Aadhaar for future e-KYC",
            "Keep copy of acknowledgement for tracking",
        ],
        "accuracy_weights": {
            "format_ok": 0.35,
            "docs_present": 0.25,
            "form_doc_match": 0.30,
            "completeness": 0.10,
        },
    },
    "ration_card_update": {
        "category": "Food & Civil Supplies",
        "process_summary": (
            "Citizen needs new ration card / member add / correction → CSC or FPS operator "
            "fills state portal → Aadhaar e-KYC OTP/biometric → approval by food dept."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "ration_card_number": {"validators": ["nonempty"]},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "dob": {"validators": ["dob"]},
            "mobile": {"validators": ["mobile"]},
            "request_type": {"validators": ["nonempty"]},
            "card_type": {"validators": ["nonempty"]},
            "address": {"validators": ["address_pincode"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["Ration Card", "Bank Passbook", "Electricity Bill"],
        "rejection_reasons": [
            "Member already seeded on another ration card",
            "Aadhaar name/DOB does not match ration booklet",
            "OTP mobile not Aadhaar-linked",
            "Wrong card type (AAY/PHH) selected for eligibility",
            "Address proof missing for shift",
        ],
        "operator_checklist": [
            "For brand-new card, ration_card_number may be 'NEW' — note it clearly",
            "Every member being added needs their own Aadhaar for e-KYC",
            "Head-of-family spelling must match Aadhaar exactly",
        ],
        "accuracy_weights": {
            "format_ok": 0.30,
            "docs_present": 0.25,
            "form_doc_match": 0.35,
            "completeness": 0.10,
        },
    },
    "caste_income_certificate": {
        "category": "Tehsil / revenue certificates",
        "process_summary": (
            "Citizen applies at Setu/CSC/tehsil → application + self-declaration → "
            "optional affidavit → talathi/revenue verification → certificate issued."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "father_name": {"validators": ["nonempty"]},
            "dob": {"validators": ["dob"]},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "certificate_type": {"validators": ["nonempty"]},
            "category": {"validators": ["nonempty"]},
            "annual_income": {"validators": ["nonempty"]},
            "address": {"validators": ["address_pincode"]},
        },
        "required_docs": ["Aadhaar Card", "Ration Card"],
        "recommended_docs": ["School Certificate", "Property Tax Receipt"],
        "rejection_reasons": [
            "Genealogy / caste proof insufficient for claimed category",
            "Income declaration inconsistent with Form 16 / ration category",
            "Name mismatch across Aadhaar, ration card, and school TC",
            "Self-declaration Form A/B missing or unsigned",
        ],
        "operator_checklist": [
            "Confirm which certificate(s) are actually needed for the purpose",
            "For caste: ask for ancestral proof early (school TC of father/grandfather)",
            "Income figures must be numeric and realistic for the scheme/job",
        ],
        "accuracy_weights": {
            "format_ok": 0.25,
            "docs_present": 0.30,
            "form_doc_match": 0.30,
            "completeness": 0.15,
        },
    },
    "birth_certificate": {
        "category": "Civil registration (birth)",
        "process_summary": (
            "Parent/informant applies at municipal/CRS desk or CSC → form + hospital proof → "
            "registrar verifies parents' identity → birth certificate issued / delayed registration."
        ),
        "field_rules": {
            "child_name": {"validators": ["nonempty"]},
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "father_name": {"validators": ["nonempty"]},
            "mother_name": {"validators": ["nonempty"]},
            "dob": {"validators": ["dob"]},
            "place_of_birth": {"validators": ["nonempty"]},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "address": {"validators": ["address_pincode"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["Hospital Discharge", "Ration Card"],
        "rejection_reasons": [
            "Hospital discharge DOB/name differs from form",
            "Parents' names do not match Aadhaar",
            "Delayed registration without affidavit / order when required",
            "Place of birth incomplete (missing district/state)",
        ],
        "operator_checklist": [
            "Child name spelling will flow into Aadhaar/school later — get it right once",
            "For home births, confirm alternate proof the municipality accepts",
            "Informant Aadhaar must belong to a parent/guardian",
        ],
        "accuracy_weights": {
            "format_ok": 0.30,
            "docs_present": 0.20,
            "form_doc_match": 0.35,
            "completeness": 0.15,
        },
    },
    "bank_aadhaar_seed": {
        "category": "Banking / DBT",
        "process_summary": (
            "Citizen visits branch or BC → seeding / KYC slip filled from passbook + Aadhaar → "
            "biometric/OTP → NPCI mapper updated → DBT can credit."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Bank Passbook"},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "account_number": {"validators": ["account_number"], "must_match_doc": "Bank Passbook"},
            "ifsc": {"validators": ["ifsc"]},
            "mobile": {"validators": ["mobile"]},
            "dob": {"validators": ["dob"]},
            "request_type": {"validators": ["nonempty"]},
        },
        "required_docs": ["Aadhaar Card", "Bank Passbook"],
        "recommended_docs": ["PAN Card"],
        "rejection_reasons": [
            "Name on passbook does not match Aadhaar (mapper rejects)",
            "Account already seeded to a different Aadhaar",
            "Wrong IFSC / account number transcribed from passbook",
            "Mobile not registered with the bank for OTP",
        ],
        "operator_checklist": [
            "Copy account number and IFSC from the passbook/cheque — do not trust memory",
            "If names diverge, fix bank KYC or Aadhaar first, then seed",
            "Confirm whether this is first seed or re-seed after bank change",
        ],
        "accuracy_weights": {
            "format_ok": 0.40,
            "docs_present": 0.25,
            "form_doc_match": 0.25,
            "completeness": 0.10,
        },
    },
    "gazette_name_change": {
        "category": "Gazette of India — name change",
        "process_summary": (
            "Citizen publishes newspaper notice → prepares deed/undertaking + typed proforma "
            "signed in old name with two witnesses → pays Bharatkosh fee → submits personally "
            "or by post to Department of Publication → Part-IV gazette notification → use "
            "gazette to update PAN/Aadhaar/passport."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "new_name": {"validators": ["nonempty"]},
            "father_name": {"validators": ["nonempty"]},
            "dob": {"validators": ["dob"]},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "address": {"validators": ["address_pincode"]},
            "reason": {"validators": ["nonempty"]},
            "newspaper_details": {"validators": ["nonempty"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["Newspaper Cutting", "PAN Card", "Passport"],
        "rejection_reasons": [
            "Proforma signed in new name instead of old name",
            "Newspaper notice missing or dates don't match guidelines",
            "Witness details incomplete",
            "Old name does not match Aadhaar/PAN spelling",
            "Submitted via agent/advocate (guidelines disallow)",
        ],
        "operator_checklist": [
            "Confirm old name spelling matches current Aadhaar exactly",
            "Proforma must be computer-typed; signature in OLD name",
            "Keep newspaper cutting + Bharatkosh receipt with the pack",
            "After gazette, schedule PAN CR / Aadhaar Form 1 / passport re-issue",
        ],
        "accuracy_weights": {
            "format_ok": 0.25,
            "docs_present": 0.20,
            "form_doc_match": 0.35,
            "completeness": 0.20,
        },
    },
    "pan_new_49a": {
        "category": "Tax / new PAN (Form 49A)",
        "process_summary": (
            "Citizen fills Form 49A (online or assisted) → name must match POI exactly → "
            "signed acknowledgment + physical proofs posted or via CSC → PAN allotted."
        ),
        "field_rules": {
            "full_name": {"validators": ["nonempty"], "must_match_doc": "Aadhaar Card"},
            "father_name": {"validators": ["nonempty"]},
            "dob": {"validators": ["dob"], "must_match_doc": "Aadhaar Card"},
            "aadhaar_number": {"validators": ["aadhaar"], "must_match_doc": "Aadhaar Card"},
            "mobile": {"validators": ["mobile"]},
            "email": {"validators": ["email"]},
            "address": {"validators": ["address_pincode"]},
            "name_on_card": {"validators": ["nonempty"]},
        },
        "required_docs": ["Aadhaar Card"],
        "recommended_docs": ["Bank Passbook", "Voter ID"],
        "rejection_reasons": [
            "Name on Form 49A does not exactly match POI/POA/PODB",
            "Titles (Shri/Smt/Dr) included in name",
            "DOB proof missing or mismatched",
            "Physical proofs not received within prescribed days after online ack",
        ],
        "operator_checklist": [
            "Match Aadhaar spelling character-for-character before submit",
            "No titles or honorifics in name fields",
            "If online: remind citizen about signed acknowledgment + proof courier/CSC",
        ],
        "accuracy_weights": {
            "format_ok": 0.35,
            "docs_present": 0.20,
            "form_doc_match": 0.35,
            "completeness": 0.10,
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
        optional = bool(rule.get("optional"))
        if optional:
            # Optional fields: skip when empty; validate format only when filled.
            if not value:
                continue
            complete_total += 1
            complete_ok += 1
        else:
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
