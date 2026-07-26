"""Sarvam AI pipeline: document digitization (Sarvam Vision) + field extraction (Sarvam-30B).

Critical: Sarvam-30B thinking mode can return empty content if max_tokens is too low.
We always call with reasoning_effort=None for structured JSON, never crash the desk on
a bad LLM reply, and fall back to regex over OCR text.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import zipfile

from sarvamai import SarvamAI


def get_client(api_key: str | None = None) -> SarvamAI:
    key = api_key or os.environ.get("API_KEY") or os.environ.get("SARVAM_API_KEY")
    if not key:
        raise RuntimeError("Sarvam API key not found. Set API_KEY in .env")
    return SarvamAI(api_subscription_key=key)


def digitize_document(client: SarvamAI, file_path: str, language: str = "en-IN",
                      timeout: int = 300) -> str:
    job = client.document_intelligence.create_job(language=language, output_format="md")
    job.upload_file(file_path)
    job.start()
    status = job.wait_until_complete(timeout=timeout)
    state = getattr(status, "job_state", "")
    if state not in ("Completed", "PartiallyCompleted"):
        raise RuntimeError(f"Digitization job ended in state {state!r}")

    with tempfile.TemporaryDirectory() as tmp:
        zip_path = os.path.join(tmp, "output.zip")
        job.download_output(zip_path)
        texts = []
        with zipfile.ZipFile(zip_path) as zf:
            for name in sorted(zf.namelist()):
                if name.endswith((".md", ".html", ".txt")):
                    texts.append(zf.read(name).decode("utf-8", errors="replace"))
                elif name.endswith(".json"):
                    try:
                        data = json.loads(zf.read(name))
                        texts.append(_json_to_text(data))
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        pass
    combined = "\n\n".join(t for t in texts if t.strip())
    if not combined.strip():
        raise RuntimeError("Digitization returned no readable text")
    return combined


def _json_to_text(data) -> str:
    parts: list[str] = []

    def walk(node):
        if isinstance(node, dict):
            for key in ("text", "content", "markdown", "value"):
                if isinstance(node.get(key), str):
                    parts.append(node[key])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(data)
    return "\n".join(parts)


EXTRACTION_SYSTEM_PROMPT = """Extract identity fields from this Indian document OCR text.
Return ONLY a JSON object. No markdown fences. No explanation.

{
  "full_name": "string or UNCERTAIN",
  "father_name": "string or UNCERTAIN",
  "dob": "DD/MM/YYYY or UNCERTAIN",
  "address": "string or UNCERTAIN",
  "id_number": "string or UNCERTAIN",
  "confidence_notes": "short note"
}

id_number: Aadhaar=12 digits, PAN=ABCDE1234F, Bank=account number, DL=licence number.
Prefer a noisy readable value over UNCERTAIN when text is present.
"""


def _blank_fields(note: str) -> dict:
    return {
        "full_name": "UNCERTAIN",
        "father_name": "UNCERTAIN",
        "dob": "UNCERTAIN",
        "address": "UNCERTAIN",
        "id_number": "UNCERTAIN",
        "confidence_notes": note,
    }


def extract_fields(client: SarvamAI, ocr_text: str, doc_type: str) -> dict:
    """Extract fields with Sarvam-30B. Never raises — returns UNCERTAIN dict on failure."""
    hints = {
        "Aadhaar Card": "Aadhaar card. Need full_name, dob, 12-digit id_number, address, father/husband name.",
        "PAN Card": "PAN card. Need full_name, father_name, dob, PAN id_number. Address usually absent.",
        "Bank Passbook": "Bank passbook/statement. Need account holder full_name, address, account id_number.",
    }
    hint = hints.get(doc_type, f"Document type: {doc_type}.")
    user_msg = f"{hint}\n\nOCR:\n{ocr_text[:10000]}"

    raw = ""
    try:
        response = client.chat.completions(
            model="sarvam-30b",
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
            max_tokens=1024,
            reasoning_effort=None,  # critical — empty content if thinking eats the budget
        )
        msg = response.choices[0].message
        raw = (msg.content or "").strip()
        if not raw:
            # Recover from thinking-mode leftovers if any
            raw = (getattr(msg, "reasoning_content", None) or "").strip()
    except Exception as exc:
        return _blank_fields(f"Chat API error: {exc}")

    if not raw:
        return _blank_fields("Sarvam-30B returned empty content (disabled reasoning; still empty)")

    try:
        return _parse_json_reply(raw)
    except Exception as exc:
        # Last resort: scrape a JSON object from whatever came back
        scraped = _loose_json_scrape(raw)
        if scraped:
            return scraped
        return _blank_fields(f"JSON parse failed: {exc}; raw starts: {raw[:120]!r}")


def _loose_json_scrape(raw: str) -> dict | None:
    brace = re.search(r"\{.*\}", raw, re.DOTALL)
    if not brace:
        return None
    try:
        data = json.loads(brace.group(0))
    except json.JSONDecodeError:
        return None
    for key in ("full_name", "father_name", "dob", "address", "id_number"):
        data.setdefault(key, "UNCERTAIN")
        if not isinstance(data[key], str) or not data[key].strip():
            data[key] = "UNCERTAIN"
    data.setdefault("confidence_notes", "Scraped JSON from noisy model output")
    return data


def _parse_json_reply(raw: str) -> dict:
    text = raw.strip()
    # Strip common wrappers
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            text = brace.group(0)
    data = json.loads(text)
    for key in ("full_name", "father_name", "dob", "address", "id_number"):
        data.setdefault(key, "UNCERTAIN")
        if not isinstance(data[key], str) or not data[key].strip():
            data[key] = "UNCERTAIN"
    return data


def regex_fallback_fields(ocr_text: str, doc_type: str, fields: dict) -> dict:
    """Fill gaps and override hallucinated IDs when OCR has a clear pattern."""
    out = dict(fields)
    text = ocr_text or ""
    upper = text.upper()
    notes_extra = []

    # --- ID numbers: prefer OCR pattern over LLM (models sometimes invent IDs) ---
    ocr_id = None
    if doc_type == "Aadhaar Card":
        # Prefer spaced Aadhaar (XXXX XXXX XXXX). Avoid eating DOB years like 2002.
        m = re.search(r"\b([2-9]\d{3})[ \-](\d{4})[ \-](\d{4})\b", text)
        if not m:
            m = re.search(r"\b([2-9]\d{11})\b", re.sub(r"\s+", "", text))
            if m:
                d = m.group(1)
                ocr_id = f"{d[:4]} {d[4:8]} {d[8:12]}"
        if m and ocr_id is None:
            ocr_id = f"{m.group(1)} {m.group(2)} {m.group(3)}"
    elif doc_type == "PAN Card":
        m = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", upper)
        if m:
            ocr_id = m.group(1)
    elif doc_type == "Bank Passbook":
        for pat in (
            r"(?:A/?C|Account)\s*(?:No|Number|#)?\s*[:\-]?\s*(\d{9,18})",
            r"\b(\d{11,16})\b",
        ):
            m = re.search(pat, text, re.I)
            if m:
                ocr_id = m.group(1)
                break

    if ocr_id:
        current = re.sub(r"\s", "", str(out.get("id_number") or ""))
        ocr_compact = re.sub(r"\s", "", ocr_id)
        if _is_uncertain(out.get("id_number")) or current != ocr_compact:
            if current and current != ocr_compact and not _is_uncertain(out.get("id_number")):
                notes_extra.append(f"Overrode LLM id_number {current!r} with OCR {ocr_id!r}")
            out["id_number"] = ocr_id

    if _is_uncertain(out.get("dob")):
        m = re.search(r"\b(\d{2}[/-]\d{2}[/-]\d{4})\b", text)
        if m:
            out["dob"] = m.group(1).replace("-", "/")

    if _is_uncertain(out.get("full_name")):
        for pat in (
            r"(?:Name|नाम|Account Holder|Customer Name|Holder Name)\s*[:\-]?\s*([A-Za-z][A-Za-z.\s]{2,60})",
            r"(?:Shri|Smt|Mr|Mrs)\s+([A-Za-z][A-Za-z.\s]{2,50})",
        ):
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                candidate = re.sub(r"\s+", " ", m.group(1)).strip(" .-")
                bad = ("government", "india", "authority", "unique", "identification")
                if len(candidate.split()) >= 2 and not any(b in candidate.lower() for b in bad):
                    out["full_name"] = candidate
                    break

    if _is_uncertain(out.get("father_name")):
        m = re.search(
            r"(?:Father|Father'?s Name|S/O|D/O|C/O|पिता)\s*[:\-/]?\s*([A-Za-z][A-Za-z.\s]{2,50})",
            text,
            re.IGNORECASE,
        )
        if m:
            out["father_name"] = re.sub(r"\s+", " ", m.group(1)).strip(" .-")

    if _is_uncertain(out.get("address")):
        m = re.search(
            r"(?:Address|पता|Residential Address)\s*[:\-]?\s*(.+?)(?:\n\n|\n[A-Z][a-z]+:|VID|$)",
            text,
            re.IGNORECASE | re.DOTALL,
        )
        if m:
            addr = re.sub(r"\s+", " ", m.group(1)).strip()[:200]
            if len(addr) > 10:
                out["address"] = addr

    if notes_extra or out != fields:
        notes = out.get("confidence_notes") or ""
        out["confidence_notes"] = f"{notes} Regex/OCR ID check. {' '.join(notes_extra)}".strip()
    return out


def _is_uncertain(value: str | None) -> bool:
    return not value or str(value).strip().upper() in ("UNCERTAIN", "N/A", "NA", "")


def process_document(client: SarvamAI, file_path: str, doc_type: str,
                     language: str = "en-IN") -> dict:
    """Digitize → extract → regex. Only raises if digitization itself fails."""
    languages_to_try = [language]
    if doc_type == "Aadhaar Card" and language != "hi-IN":
        languages_to_try.append("hi-IN")
    elif language != "en-IN":
        languages_to_try.append("en-IN")

    last_err: Exception | None = None
    ocr_text = ""
    used_lang = language
    for lang in languages_to_try:
        try:
            ocr_text = digitize_document(client, file_path, language=lang)
            used_lang = lang
            if len(ocr_text.strip()) >= 20:
                break
        except Exception as exc:
            last_err = exc
            ocr_text = ""

    if not ocr_text.strip():
        raise RuntimeError(
            f"Could not digitize {os.path.basename(file_path)} as {doc_type}. "
            f"Try a clear JPG/PNG photo. Last error: {last_err}"
        )

    # extract_fields never raises
    fields = extract_fields(client, ocr_text, doc_type)
    fields = regex_fallback_fields(ocr_text, doc_type, fields)

    return {
        "doc_type": doc_type,
        "source_file": os.path.basename(file_path),
        "language": used_lang,
        "ocr_text": ocr_text,
        "fields": fields,
    }
