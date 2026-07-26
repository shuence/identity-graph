"""Operator assist — tips, prompts, and KB pack for every form field.

Keeps the Suvidha desk usable when a CSC operator is filling block-letter /
assisted forms under time pressure. Enrichment is runtime so services.py
stays the source of field keys; we never invent values for the portal.
"""

from __future__ import annotations

from identitygraph.knowledge_base import KNOWLEDGE_BASE
from identitygraph.services import SERVICES, get_service, list_services

# Default HI/EN prompts when a field was added without voice copy.
_PROMPT_DEFAULTS: dict[str, tuple[str, str]] = {
    "full_name": (
        "अपना पूरा नाम बताइए, जैसा पहचान पत्र पर लिखा है — श्री या श्रीमती न लगाएँ।",
        "Please say your full name exactly as on the ID — no titles like Shri or Smt.",
    ),
    "father_name": (
        "अपने पिता या अभिभावक का नाम बताइए।",
        "Please say your father's or guardian's name.",
    ),
    "mother_name": (
        "माता का नाम बताइए।",
        "Please say the mother's name.",
    ),
    "dob": (
        "जन्म तिथि बताइए — दिन, महीना, और साल।",
        "Please say the date of birth — day, month, and year.",
    ),
    "aadhaar_number": (
        "बारह अंकों का आधार नंबर बताइए।",
        "Please say the twelve-digit Aadhaar number.",
    ),
    "pan_number": (
        "दस अक्षर का पैन नंबर बताइए।",
        "Please say the ten-character PAN number.",
    ),
    "mobile": (
        "दस अंकों का मोबाइल नंबर बताइए।",
        "Please say the ten-digit mobile number.",
    ),
    "email": (
        "ईमेल पता बताइए।",
        "Please say the email address.",
    ),
    "address": (
        "पूरा पता बताइए — पिनकोड ज़रूर शामिल करें।",
        "Please say the full address, including the six-digit pincode.",
    ),
    "new_address": (
        "नया या सही पता पिनकोड के साथ बताइए।",
        "Please say the new or corrected address with pincode.",
    ),
    "old_address": (
        "पुराना पता बताइए जैसा दस्तावेज़ पर है।",
        "Please say the old address as printed on the document.",
    ),
    "dl_number": (
        "ड्राइविंग लाइसेंस नंबर बताइए।",
        "Please say the driving licence number.",
    ),
    "epic_number": (
        "वोटर आईडी या ईपीआईसी नंबर बताइए।",
        "Please say the EPIC / voter ID number.",
    ),
    "ration_card_number": (
        "राशन कार्ड नंबर बताइए, या नया हो तो NEW कहिए।",
        "Please say the ration card number, or say NEW.",
    ),
    "account_number": (
        "बैंक खाता संख्या बताइए।",
        "Please say the bank account number.",
    ),
    "ifsc": (
        "आईएफएससी कोड बताइए।",
        "Please say the IFSC code.",
    ),
    "gender": (
        "लिंग बताइए — पुरुष, महिला या अन्य।",
        "Please say the gender — male, female, or other.",
    ),
    "category": (
        "श्रेणी बताइए — अनुसूचित जाति, जनजाति, ओबीसी, ईडब्ल्यूएस या सामान्य।",
        "Please say the category — SC, ST, OBC, EWS, or General.",
    ),
    "scheme_name": (
        "किस योजना के लिए आवेदन है?",
        "Which scheme are you applying for?",
    ),
    "annual_income": (
        "परिवार की सालाना आय लगभग कितनी है?",
        "What is the approximate annual family income?",
    ),
    "new_name": (
        "नया पूरा नाम बताइए।",
        "Please say the new full name.",
    ),
    "child_name": (
        "बच्चे का पूरा नाम बताइए।",
        "Please say the child's full name.",
    ),
    "place_of_birth": (
        "जन्म स्थान — गाँव या शहर, ज़िला, राज्य बताइए।",
        "Please say place of birth — town, district, and state.",
    ),
    "old_passport_number": (
        "पुराना पासपोर्ट नंबर अगर है तो बताइए।",
        "Please say the old passport number if any.",
    ),
    "name_on_card": (
        "कार्ड पर छपने वाला नाम बताइए।",
        "Please say the name to print on the card.",
    ),
    "newspaper_details": (
        "किस अखबार में नोटिस छपा और तारीख?",
        "Which newspaper published the notice, and on what date?",
    ),
}

_TIP_BY_VALIDATOR: dict[str, str] = {
    "aadhaar": "Must be exactly 12 digits; cannot start with 0 or 1. Type without spaces.",
    "pan": "Format AAAAA9999A — 5 letters, 4 digits, 1 letter. No titles in name.",
    "mobile": "10 digits starting with 6/7/8/9. Strip +91 before portal entry.",
    "dob": "Prefer DD/MM/YYYY. Must match the proof document being compared.",
    "dl_number": "Usually starts with state code (MH, KA, DL…). Copy from physical DL.",
    "epic": "Typical EPIC is 3 letters + 7 digits (e.g. ABC1234567).",
    "passport": "Usually letter + 7 digits (e.g. A1234567). Leave blank for fresh passport.",
    "ifsc": "11 characters: 4 letters + 0 + 6 alphanumeric. Copy from passbook/cheque.",
    "account_number": "9–18 digits. Copy from passbook — do not trust memory.",
    "email": "Must contain @ and a domain. Confirm OTP mailbox with citizen.",
    "address_pincode": "Address must include a 6-digit PIN — portals reject without it.",
    "nonempty": "Required — do not leave blank for portal submit.",
}

_TIP_BY_KEY: dict[str, str] = {
    "full_name": "Omit Shri/Smt/Dr. Match POI spelling character-for-character.",
    "father_name": "Match Aadhaar / school record spelling; no titles.",
    "update_fields": "Form 1: fill only fields being updated.",
    "fields_to_correct": "PAN CR: tick only the fields you are correcting.",
    "correction_fields": "Form 8: max 4 particulars. Attach proof for each.",
    "request_type": "Pick one clear request — portals reject mixed/vague choices.",
    "service_type": "Fresh vs re-issue changes required docs at PSK.",
    "new_name": "Must differ from old name; gazette path needed for major changes.",
    "name_on_card": "If abbreviated, last name must still appear.",
    "newspaper_details": "Keep the physical cutting — Department of Publication checks dates.",
    "family_members": "Each added member usually needs their own Aadhaar for e-KYC.",
    "certificate_type": "Confirm caste vs income vs domicile — wrong type wastes a trip.",
    "card_type": "AAY / PHH / state category must match eligibility.",
    "assembly_constituency": "Optional but speeds BLO routing if known.",
    "purpose": "Note education / scheme / job — decides which certificate is enough.",
}


def _tip_for_field(service_id: str, field: dict) -> str:
    parts: list[str] = []
    key = field.get("key") or ""
    if key in _TIP_BY_KEY:
        parts.append(_TIP_BY_KEY[key])
    kb = KNOWLEDGE_BASE.get(service_id, {})
    rule = (kb.get("field_rules") or {}).get(key, {})
    for vname in rule.get("validators") or []:
        tip = _TIP_BY_VALIDATOR.get(vname)
        if tip and tip not in parts:
            parts.append(tip)
    doc = field.get("compare_doc") or rule.get("must_match_doc")
    if doc:
        parts.append(f"Must match: {doc}.")
    if field.get("high_stakes"):
        parts.append("High stakes — mismatch can reject the application.")
    if not parts:
        parts.append("Confirm with citizen against original document before submit.")
    return " ".join(parts)


def _ensure_prompts(field: dict) -> dict:
    out = dict(field)
    key = out.get("key") or ""
    hi, en = _PROMPT_DEFAULTS.get(key, (
        f"{out.get('label', key)} बताइए।",
        f"Please provide: {out.get('label', key)}.",
    ))
    if not (out.get("prompt_hi") or "").strip():
        out["prompt_hi"] = hi
    if not (out.get("prompt_en") or "").strip():
        out["prompt_en"] = en
    return out


def enrich_field(service_id: str, field: dict) -> dict:
    f = _ensure_prompts(field)
    f["operator_tip"] = _tip_for_field(service_id, f)
    f["high_stakes"] = bool(f.get("high_stakes"))
    return f


def operator_pack(service_id: str) -> dict:
    """Checklist + rejection risks + process — what a Suvidha operator needs on screen."""
    kb = KNOWLEDGE_BASE.get(service_id, {})
    return {
        "process_summary": kb.get("process_summary", ""),
        "operator_checklist": list(kb.get("operator_checklist", [])),
        "rejection_reasons": list(kb.get("rejection_reasons", [])),
        "required_docs": list(kb.get("required_docs", [])),
        "recommended_docs": list(kb.get("recommended_docs", [])),
        "category": kb.get("category", ""),
    }


def serialize_service(service_id: str | None = None, service: dict | None = None) -> dict:
    s = service or get_service(service_id or "")
    sid = s["id"]
    pack = operator_pack(sid)
    return {
        "id": sid,
        "title": s["title"],
        "category": s.get("category", ""),
        "fill_mode": s.get("fill_mode", ""),
        "official_form": s.get("official_form", ""),
        "source_url": s.get("source_url", ""),
        "tagline": s["tagline"],
        "why": s["why"],
        "required_docs": s["required_docs"],
        "optional_docs": s.get("optional_docs", []),
        "portal": s["portal"],
        "form_fields": [enrich_field(sid, f) for f in s["form_fields"]],
        "operator": pack,
        "positioning": {
            "audience": "CSC / Suvidha / Seva Kendra operator + citizen",
            "stack": "Sarvam Vision OCR · Saaras STT · Bulbul TTS · Sarvam-30B structure",
            "hackathon": "Sarvam Epoch Buildathon — voice + document intelligence for Bharat desks",
        },
    }


def serialize_all_services() -> list[dict]:
    return [serialize_service(service=s) for s in list_services()]


def audit_missing_prompts() -> list[tuple[str, str]]:
    """Runnable check: every field must resolve to non-empty HI+EN prompts."""
    gaps: list[tuple[str, str]] = []
    for s in SERVICES.values():
        for f in serialize_service(service=s)["form_fields"]:
            if not f.get("prompt_hi") or not f.get("prompt_en"):
                gaps.append((s["id"], f["key"]))
            if not f.get("operator_tip"):
                gaps.append((s["id"], f"{f['key']}:tip"))
    return gaps
