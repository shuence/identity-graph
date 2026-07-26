"""Suvidha desk voice agent — for citizens who cannot type the form.

Flow at the counter (deliberate, with confirmation):
  1. Ask one field
  2. Citizen answers → validate → read back for YES/NO confirm
  3. Only on YES: commit the value and ask the next field
  4. When all fields confirmed → review_form (editable typed form)

Uses the same API_KEY as OCR (Saaras STT + Bulbul TTS + optional Sarvam-30B).
"""

from __future__ import annotations

import json
import re
from typing import Any

from identitygraph.voice import get_client, parse_yes_no

AGENT_SYSTEM = """You are "Sevak", a Suvidha desk voice agent. Speak ENGLISH only.

Reply with ONLY JSON:
{
  "reply_en": "short English the citizen hears",
  "field_updates": {},
  "active_field": "field being collected",
  "pending_confirm": null | {"field_key": "...", "value": "..."},
  "ask_next": "English prompt or null",
  "redirect": null | "review_form" | "upload_docs",
  "action": "ask" | "confirm" | "answer" | "redirect" | "clarify"
}

Rules:
- Never invent values. Never skip confirmation.
- If collecting a field answer: propose pending_confirm and ask "Say YES or NO".
- Do not advance until confirmed (handled by the server — keep replies short).
- Keep reply_en under 160 characters.
"""


def _normalize_spelled(text: str) -> str:
    raw = text.strip()
    letters = re.findall(r"\b([A-Za-z])\b", raw)
    words = re.findall(r"[A-Za-z]{2,}", raw)
    if len(letters) >= 3 and len(words) <= 1:
        return "".join(letters).upper()
    dashed = re.findall(r"(?i)\b([a-z](?:-[a-z]){2,})\b", raw)
    if dashed:
        return dashed[0].replace("-", "").upper()
    return raw


def _block_letters(value: str, field_key: str) -> str:
    v = value.strip()
    if not v:
        return v
    if any(k in field_key for k in ("mobile", "phone", "otp", "pincode", "pin_code")):
        digits = re.sub(r"[^\d+]", "", v)
        return digits or v
    if any(
        k in field_key
        for k in ("name", "father", "mother", "address", "reason", "village", "district", "email")
    ):
        if "email" in field_key:
            return re.sub(r"\s+", "", v).lower()
        return re.sub(r"\s+", " ", v).upper()
    if "gender" in field_key:
        low = v.lower()
        if any(x in low for x in ("female", "woman", "girl", "f")):
            return "FEMALE"
        if any(x in low for x in ("male", "man", "boy", "m")):
            return "MALE"
        if "other" in low or "trans" in low:
            return "OTHER"
        return v.upper()
    return v


def _strip_leadins(text: str) -> str:
    value = text.strip()
    value = re.sub(
        r"(?i)^(mera naam|meri naam|my name|full name|naam|name)\s*(hai|hain|is|:)?\s*",
        "",
        value,
    ).strip()
    value = re.sub(r"(?i)^(mera|meri|my|please|ji)\s+", "", value).strip()
    value = re.sub(r"(?i)\s+(hai|hain|is|please|ji)\.?$", "", value).strip()
    return value


def _first_empty(fields: list[dict], answers: dict[str, str]) -> str | None:
    """Next empty field. Prefer required (high_stakes) fields first; skip optionals
    until required ones are done, then optional empties are also skippable for done."""
    required = [f for f in fields if f.get("high_stakes")]
    optional = [f for f in fields if not f.get("high_stakes")]
    for group in (required, optional):
        for f in group:
            key = f["key"]
            if not (answers.get(key) or "").strip():
                # For completion / advance: only require high_stakes.
                if group is optional:
                    return None
                return key
    return None


def _label(fields: list[dict], key: str) -> str:
    return next((f.get("label") or key for f in fields if f["key"] == key), key)


def _field_prompt(fields: list[dict], key: str | None) -> str:
    if not key:
        return "All details are captured. Please review the form on screen and edit anything wrong."
    f = next((x for x in fields if x["key"] == key), None)
    label = (f or {}).get("label") or key.replace("_", " ")
    en = (f or {}).get("prompt_en") or f"Please tell me your {label}."
    if key and "name" in key:
        en = f"{en} Speak clearly. Spelling letter by letter is OK."
    return str(en)[:200]


def _resolve_active(
    fields: list[dict], answers: dict[str, str], preferred: str | None
) -> str | None:
    if preferred and not (answers.get(preferred) or "").strip():
        return preferred
    return _first_empty(fields, answers)


def _validate_value(field_key: str, value: str) -> str | None:
    """Return an English error message if invalid, else None."""
    v = (value or "").strip()
    if not v or len(v) < 2:
        return "I could not hear a clear answer. Please say it again, slowly."

    if any(k in field_key for k in ("mobile", "phone")):
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            return "That mobile number looks incomplete. Please say all 10 digits."
        if len(digits) > 12:
            return "That number is too long. Please say your 10-digit mobile number."
        return None

    if "email" in field_key:
        if "@" not in v or "." not in v.split("@")[-1]:
            return "That does not look like an email. Please say it again, for example name at gmail.com."
        return None

    if "dob" in field_key or field_key.endswith("_date"):
        if not re.search(r"\d", v):
            return "Please include the date with numbers, for example 15 March 2002."
        return None

    if "aadhaar" in field_key or field_key in ("id_number",) and "aadhaar" in field_key.lower():
        digits = re.sub(r"\D", "", v)
        if len(digits) not in (12,) and len(digits) < 8:
            return "Aadhaar should be 12 digits. Please say it again slowly."
        return None

    if "gender" in field_key:
        low = v.lower()
        if not any(x in low for x in ("male", "female", "other", "man", "woman", "boy", "girl", "trans")):
            return "Please say Male, Female, or Other."
        return None

    if "name" in field_key:
        letters = re.sub(r"[^A-Za-z]", "", v)
        if len(letters) < 3:
            return "That name is too short. Please say your full name clearly."
        # Reject obvious STT garbage of 1 token under 3 letters already handled
        if len(v.split()) == 1 and len(letters) < 4:
            return "Please say your full name, including surname if you have one."
        return None

    if "address" in field_key:
        if len(v) < 6:
            return "Please say a fuller address — area, city, or pin code."
        return None

    return None


def _confirm_prompt(label: str, value: str) -> str:
    return (
        f"I heard: {value}. "
        f"Is this correct for {label}? Say YES to save, or NO to say it again."
    )[:200]


def _ask_next_prompt(fields: list[dict], key: str | None) -> str:
    if not key:
        return "All details captured. Opening the form for you to review and edit."
    return f"Saved. Next question. {_field_prompt(fields, key)}"[:200]


def run_agent_turn(
    *,
    service: dict,
    transcript: str,
    answers: dict[str, str] | None = None,
    active_field: str | None = None,
    pending_confirm: dict[str, str] | None = None,
    history: list[dict[str, str]] | None = None,
    use_llm: bool = True,
) -> dict[str, Any]:
    answers = {k: str(v) for k, v in (answers or {}).items() if v is not None}
    fields = service.get("form_fields") or []
    history = history or []
    transcript = (transcript or "").strip()
    active_field = _resolve_active(fields, answers, active_field)
    pending = pending_confirm if isinstance(pending_confirm, dict) else None
    if pending:
        pk = pending.get("field_key")
        pv = pending.get("value")
        if not pk or not pv:
            pending = None

    # --- Greeting ---
    if not transcript:
        if pending:
            label = _label(fields, pending["field_key"])
            reply = _confirm_prompt(label, pending["value"])
            return {
                "reply_en": reply,
                "reply_hi": reply,
                "field_updates": {},
                "active_field": pending["field_key"],
                "pending_confirm": pending,
                "ask_next": reply,
                "redirect": None,
                "action": "confirm",
                "engine": "greeting",
            }
        prompt = _field_prompt(fields, active_field)
        reply = f"Hello. I will ask one question at a time. {prompt}"
        return {
            "reply_en": reply,
            "reply_hi": reply,
            "field_updates": {},
            "active_field": active_field,
            "pending_confirm": None,
            "ask_next": prompt,
            "redirect": None,
            "action": "ask",
            "engine": "greeting",
        }

    lower = transcript.lower()

    # --- Situational Q&A (does not clear pending) ---
    if any(w in lower for w in ("document", "docs", "what do i need", "proof", "paper")):
        msg = (
            "Bring Aadhaar and the proof for the field you want to change — "
            "PAN, driving licence, or passport."
        )
        return {
            "reply_en": msg,
            "reply_hi": msg,
            "field_updates": {},
            "active_field": active_field,
            "pending_confirm": pending,
            "ask_next": None,
            "redirect": None,
            "action": "answer",
            "engine": "heuristic",
        }

    # --- Pending confirmation branch ---
    if pending:
        yn = parse_yes_no(transcript)
        field_key = pending["field_key"]
        value = pending["value"]
        label = _label(fields, field_key)

        if yn == "yes":
            merged = {**answers, field_key: value}
            nxt = _first_empty(fields, merged)
            if nxt:
                reply = _ask_next_prompt(fields, nxt)
                return {
                    "reply_en": reply,
                    "reply_hi": reply,
                    "field_updates": {field_key: value},
                    "active_field": nxt,
                    "pending_confirm": None,
                    "ask_next": _field_prompt(fields, nxt),
                    "redirect": None,
                    "action": "ask",
                    "engine": "confirm_yes",
                }
            reply = _ask_next_prompt(fields, None)
            return {
                "reply_en": reply,
                "reply_hi": reply,
                "field_updates": {field_key: value},
                "active_field": None,
                "pending_confirm": None,
                "ask_next": None,
                "redirect": "review_form",
                "action": "redirect",
                "engine": "confirm_yes",
            }

        if yn == "no":
            reply = f"Okay, let's try again. {_field_prompt(fields, field_key)}"
            return {
                "reply_en": reply,
                "reply_hi": reply,
                "field_updates": {},
                "active_field": field_key,
                "pending_confirm": None,
                "ask_next": _field_prompt(fields, field_key),
                "redirect": None,
                "action": "ask",
                "engine": "confirm_no",
            }

        # Unclear yes/no — stay on confirm, do not overwrite
        reply = (
            f"Please say YES if {value} is correct for {label}, "
            f"or NO to say it again."
        )
        return {
            "reply_en": reply,
            "reply_hi": reply,
            "field_updates": {},
            "active_field": field_key,
            "pending_confirm": pending,
            "ask_next": reply,
            "redirect": None,
            "action": "confirm",
            "engine": "confirm_unclear",
        }

    # --- Done intent ---
    if any(w in lower for w in ("done", "finished", "complete", "review", "that's all", "thats all")):
        empty = _first_empty(fields, answers)
        if empty:
            reply = f"We still need: {_label(fields, empty)}. {_field_prompt(fields, empty)}"
            return {
                "reply_en": reply,
                "reply_hi": reply,
                "field_updates": {},
                "active_field": empty,
                "pending_confirm": None,
                "ask_next": _field_prompt(fields, empty),
                "redirect": None,
                "action": "ask",
                "engine": "heuristic",
            }
        reply = _ask_next_prompt(fields, None)
        return {
            "reply_en": reply,
            "reply_hi": reply,
            "field_updates": {},
            "active_field": None,
            "pending_confirm": None,
            "ask_next": None,
            "redirect": "review_form",
            "action": "redirect",
            "engine": "heuristic",
        }

    # --- Collect answer for active field ---
    target = active_field or _first_empty(fields, answers)
    if not target:
        reply = _ask_next_prompt(fields, None)
        return {
            "reply_en": reply,
            "reply_hi": reply,
            "field_updates": {},
            "active_field": None,
            "pending_confirm": None,
            "ask_next": None,
            "redirect": "review_form",
            "action": "redirect",
            "engine": "heuristic",
        }

    # Optional LLM assist only for messy answers (not for confirm path)
    value = None
    engine = "heuristic"
    if use_llm and len(transcript.split()) >= 6:
        llm = _llm_extract_value(service, transcript, target, answers)
        if llm:
            value = llm
            engine = "sarvam-30b"

    if value is None:
        value = _block_letters(_normalize_spelled(_strip_leadins(transcript)), target)

    err = _validate_value(target, value)
    if err:
        reply = f"{err} {_field_prompt(fields, target)}"
        return {
            "reply_en": reply[:220],
            "reply_hi": reply[:220],
            "field_updates": {},
            "active_field": target,
            "pending_confirm": None,
            "ask_next": _field_prompt(fields, target),
            "redirect": None,
            "action": "clarify",
            "engine": engine,
        }

    # Valid → pending confirm (do NOT commit yet)
    label = _label(fields, target)
    pending = {"field_key": target, "value": value}
    reply = _confirm_prompt(label, value)
    return {
        "reply_en": reply,
        "reply_hi": reply,
        "field_updates": {},  # wait for YES
        "active_field": target,
        "pending_confirm": pending,
        "ask_next": reply,
        "redirect": None,
        "action": "confirm",
        "engine": engine,
    }


def _llm_extract_value(
    service: dict,
    transcript: str,
    field_key: str,
    answers: dict[str, str],
) -> str | None:
    fields = service.get("form_fields") or []
    label = _label(fields, field_key)
    try:
        client = get_client()
        response = client.chat.completions(
            model="sarvam-30b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract one form field value from the citizen transcript. "
                        "Return ONLY JSON: {\"value\": \"...\"}. "
                        "Use UPPER CASE for names/addresses. Empty string if unclear."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "field_key": field_key,
                            "label": label,
                            "transcript": transcript,
                            "current_answers": answers,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            temperature=0.0,
            max_tokens=200,
            reasoning_effort=None,
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        brace = re.search(r"\{.*\}", raw, re.DOTALL)
        if not brace:
            return None
        data = json.loads(brace.group(0))
        val = data.get("value")
        if isinstance(val, str) and val.strip():
            return _block_letters(_normalize_spelled(val), field_key)
    except Exception:
        return None
    return None
