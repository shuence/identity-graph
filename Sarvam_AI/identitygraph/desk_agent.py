"""Suvidha desk voice agent — for citizens who cannot type the form.

Fast counter flow (no yes/no round-trip):
  1. Ask one field
  2. Citizen answers → validate → save immediately → ask next
  3. When required fields are filled → review_form (editable typed form)

Uses the same API_KEY as OCR (Saaras STT + Bulbul TTS).
LLM extraction is off by default so turns stay snappy.
"""

from __future__ import annotations

import json
import re
from typing import Any

from identitygraph.voice import get_client


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
    """Next empty required field. Optionals are skippable for completion."""
    required = [f for f in fields if f.get("high_stakes")]
    optional = [f for f in fields if not f.get("high_stakes")]
    for group in (required, optional):
        for f in group:
            key = f["key"]
            if not (answers.get(key) or "").strip():
                if group is optional:
                    return None
                return key
    return None


def _label(fields: list[dict], key: str) -> str:
    return next((f.get("label") or key for f in fields if f["key"] == key), key)


def _field_prompt(fields: list[dict], key: str | None) -> str:
    if not key:
        return "All set. Opening the form so you can review and edit."
    f = next((x for x in fields if x["key"] == key), None)
    label = (f or {}).get("label") or key.replace("_", " ")
    en = (f or {}).get("prompt_en") or f"Please tell me your {label}."
    return str(en)[:140]


def _resolve_active(
    fields: list[dict], answers: dict[str, str], preferred: str | None
) -> str | None:
    if preferred and not (answers.get(preferred) or "").strip():
        return preferred
    return _first_empty(fields, answers)


def _validate_value(field_key: str, value: str) -> str | None:
    """Return a short English error if invalid, else None."""
    v = (value or "").strip()
    if not v or len(v) < 2:
        return "I did not catch that. Please say it again."

    if any(k in field_key for k in ("mobile", "phone")):
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            return "Mobile looks incomplete. Say all 10 digits."
        if len(digits) > 12:
            return "That number is too long. Say your 10-digit mobile."
        return None

    if "email" in field_key:
        if "@" not in v or "." not in v.split("@")[-1]:
            return "That does not look like an email. Try again."
        return None

    if "dob" in field_key or field_key.endswith("_date"):
        if not re.search(r"\d", v):
            return "Include the date with numbers, like 15 March 2002."
        return None

    if "aadhaar" in field_key:
        digits = re.sub(r"\D", "", v)
        if len(digits) not in (12,) and len(digits) < 8:
            return "Aadhaar should be 12 digits. Say it again slowly."
        return None

    if "gender" in field_key:
        low = v.lower()
        if not any(x in low for x in ("male", "female", "other", "man", "woman", "boy", "girl", "trans")):
            return "Please say Male, Female, or Other."
        return None

    if "name" in field_key:
        letters = re.sub(r"[^A-Za-z]", "", v)
        if len(letters) < 3:
            return "Name is too short. Say your full name."
        if len(v.split()) == 1 and len(letters) < 4:
            return "Please say your full name, including surname."
        return None

    if "address" in field_key:
        if len(v) < 6:
            return "Please say a fuller address — area, city, or pin."
        return None

    return None


def _saved_next(fields: list[dict], key: str | None, value: str) -> str:
    if not key:
        return f"Got it: {value}. Opening the form to review."
    return f"Got it. {_field_prompt(fields, key)}"[:180]


def run_agent_turn(
    *,
    service: dict,
    transcript: str,
    answers: dict[str, str] | None = None,
    active_field: str | None = None,
    pending_confirm: dict[str, str] | None = None,  # kept for API compat; ignored
    history: list[dict[str, str]] | None = None,
    use_llm: bool = False,
) -> dict[str, Any]:
    del pending_confirm  # no yes/no confirm step — save immediately
    answers = {k: str(v) for k, v in (answers or {}).items() if v is not None}
    fields = service.get("form_fields") or []
    history = history or []
    transcript = (transcript or "").strip()
    active_field = _resolve_active(fields, answers, active_field)

    # --- Greeting ---
    if not transcript:
        prompt = _field_prompt(fields, active_field)
        reply = f"Hello. {prompt}"
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

    # --- Situational Q&A ---
    if any(w in lower for w in ("document", "docs", "what do i need", "proof", "paper")):
        msg = "Bring Aadhaar plus proof for the change — PAN, DL, or passport."
        return {
            "reply_en": msg,
            "reply_hi": msg,
            "field_updates": {},
            "active_field": active_field,
            "pending_confirm": None,
            "ask_next": None,
            "redirect": None,
            "action": "answer",
            "engine": "heuristic",
        }

    # --- Redo last / skip (quick corrections without yes/no) ---
    if any(w in lower for w in ("wrong", "again", "repeat", "redo", "change that", "go back")):
        target = active_field or _first_empty(fields, answers)
        if target and (answers.get(target) or "").strip():
            # clear current if already filled and re-ask
            pass
        # If previous field exists in answers and they want redo, clear last filled
        filled_keys = [f["key"] for f in fields if (answers.get(f["key"]) or "").strip()]
        if filled_keys and any(w in lower for w in ("wrong", "again", "redo", "go back", "change that")):
            last = filled_keys[-1]
            reply = f"Okay. {_field_prompt(fields, last)}"
            return {
                "reply_en": reply,
                "reply_hi": reply,
                "field_updates": {last: ""},
                "active_field": last,
                "pending_confirm": None,
                "ask_next": _field_prompt(fields, last),
                "redirect": None,
                "action": "ask",
                "engine": "heuristic",
            }
        reply = _field_prompt(fields, target)
        return {
            "reply_en": reply,
            "reply_hi": reply,
            "field_updates": {},
            "active_field": target,
            "pending_confirm": None,
            "ask_next": reply,
            "redirect": None,
            "action": "ask",
            "engine": "heuristic",
        }

    # --- Done intent ---
    if any(w in lower for w in ("done", "finished", "complete", "review", "that's all", "thats all")):
        empty = _first_empty(fields, answers)
        if empty:
            reply = f"Still need {_label(fields, empty)}. {_field_prompt(fields, empty)}"
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
        reply = _field_prompt(fields, None)
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
        reply = _field_prompt(fields, None)
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

    value = None
    engine = "heuristic"
    # LLM only when explicitly requested AND transcript is very long/messy
    if use_llm and len(transcript.split()) >= 10:
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
            "reply_en": reply[:200],
            "reply_hi": reply[:200],
            "field_updates": {},
            "active_field": target,
            "pending_confirm": None,
            "ask_next": _field_prompt(fields, target),
            "redirect": None,
            "action": "clarify",
            "engine": engine,
        }

    # Valid → commit immediately and ask next (no YES/NO)
    merged = {**answers, target: value}
    nxt = _first_empty(fields, merged)
    reply = _saved_next(fields, nxt, value)
    if nxt:
        return {
            "reply_en": reply,
            "reply_hi": reply,
            "field_updates": {target: value},
            "active_field": nxt,
            "pending_confirm": None,
            "ask_next": _field_prompt(fields, nxt),
            "redirect": None,
            "action": "ask",
            "engine": engine,
        }
    return {
        "reply_en": reply,
        "reply_hi": reply,
        "field_updates": {target: value},
        "active_field": None,
        "pending_confirm": None,
        "ask_next": None,
        "redirect": "review_form",
        "action": "redirect",
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
