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


def digitize_document_resilient(
    client: SarvamAI,
    file_path: str,
    language: str = "en-IN",
    timeout: int = 300,
) -> tuple[str, str]:
    """Try primary language, then hi-IN / en-IN fallback for Indian forms.

    Returns (ocr_text, language_used).
    """
    tried: list[str] = []
    last: Exception | None = None
    for lang in (language, "hi-IN", "en-IN"):
        if lang in tried:
            continue
        tried.append(lang)
        try:
            text = digitize_document(client, file_path, language=lang, timeout=timeout)
            if text.strip():
                return text, lang
        except RuntimeError as exc:
            last = exc
            continue
    raise RuntimeError(
        f"Sarvam Vision could not read this scan (tried {', '.join(tried)}). "
        "Use a clear JPG/PNG of the filled form — blank or blurry pages return no text. "
        f"Last error: {last}"
    ) from last

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
  "confidence_notes": "short note",
  "handwriting_quality": "clear | messy | mixed | n/a"
}

id_number: Aadhaar=12 digits, PAN=ABCDE1234F, Bank=account number, DL=licence number.
Prefer a noisy readable value over UNCERTAIN when text is present.
Bank passbook / statement: dob is almost never printed. Account opening date,
A/C open date, CIF date, statement date, or transaction date are NOT date of birth —
leave dob as UNCERTAIN unless the OCR literally says Date of Birth / DOB.
Aadhaar: Issue Date is NOT dob. Prefer जन्म तिथि/DOB. If S/O or D/O is absent but
full_name is Given + Father + Surname (3+ tokens), set father_name to the middle
token(s) — e.g. "Shubham Vishnu Pitekar" → father_name "Vishnu". Address is often
only on the reverse; UNCERTAIN is correct for front-only scans.
If the scan is handwritten / filled-in form / block letters:
- Read carefully; do NOT invent neat spellings that are not supported by the OCR.
- If a character is ambiguous, keep UNCERTAIN for that field.
- Note messy handwriting in confidence_notes.
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


def extract_fields(
    client: SarvamAI,
    ocr_text: str,
    doc_type: str,
    *,
    handwritten: bool = False,
) -> dict:
    """Extract fields with Sarvam-30B. Never raises — returns UNCERTAIN dict on failure."""
    hints = {
        "Aadhaar Card": (
            "Aadhaar card (UIDAI). Need full_name, dob (जन्म तिथि/DOB — NOT Issue Date), "
            "12-digit id_number (not VID), address if present. "
            "Father/husband: use S/O or D/O if printed; else for Indian Given+Father+Surname "
            "names take the middle name as father_name "
            '(e.g. "Shubham Vishnu Pitekar" → father_name "Vishnu").'
        ),
        "PAN Card": "PAN card. Need full_name, father_name, dob, PAN id_number. Address usually absent.",
        "Bank Passbook": (
            "Bank passbook/statement first page. Need account holder full_name, "
            "address, and account id_number (A/C No). "
            "dob MUST be UNCERTAIN — do NOT use Account Opening Date / A/C Open / "
            "Date of Issue / As on date / statement date as dob."
        ),
        "Driving License": "Driving licence. Need full_name, dob, DL id_number, address.",
        "Voter ID": "Voter ID / EPIC. Need full_name, father/husband name, dob or age, address, EPIC id_number.",
        "Ration Card": "Ration card. Need household head / member full_name, address, ration card id_number.",
        "School Certificate": "School / board certificate. Need full_name, father_name, dob, certificate id_number.",
    }
    hint = hints.get(doc_type, f"Document type: {doc_type}.")
    hw = (
        "\nSOURCE: HANDWRITTEN / filled form / block letters. "
        "OCR may be noisy — extract only what is supported; use UNCERTAIN when unsure.\n"
        if handwritten
        else "\nSOURCE: Printed document scan.\n"
    )
    user_msg = f"{hint}{hw}\nOCR:\n{ocr_text[:10000]}"

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


def _dob_from_labeled_ocr(text: str) -> str | None:
    """Only accept dates next to an explicit DOB label."""
    m = re.search(
        r"(?:Date\s*of\s*Birth|D\.?\s*O\.?\s*B\.?|जन्म\s*तिथि|जन्मतिथि)"
        r"\s*[:\-–]?\s*(\d{2}[/-]\d{2}[/-]\d{4})",
        text or "",
        re.IGNORECASE,
    )
    if m:
        return m.group(1).replace("-", "/")
    return None


def _scrub_bank_passbook_dob(ocr_text: str, fields: dict) -> dict:
    """Passbooks print opening/statement dates — those are not DOB."""
    out = dict(fields)
    labeled = _dob_from_labeled_ocr(ocr_text)
    if labeled:
        out["dob"] = labeled
        return out
    if not _is_uncertain(out.get("dob")):
        note = (out.get("confidence_notes") or "").strip()
        cleared = "cleared dob — passbook opening/statement date ≠ birth date"
        out["confidence_notes"] = f"{note}; {cleared}".strip("; ") if note else cleared
    out["dob"] = "UNCERTAIN"
    return out


def _clean_ocr_noise(ocr_text: str) -> str:
    """Strip Vision photo captions / embedded images that drown real Aadhaar text."""
    text = ocr_text or ""
    text = re.sub(r"!\[[^\]]*\]\(data:image/[^)]+\)", "\n", text)
    text = re.sub(
        r"data:image/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+",
        "\n",
        text,
    )
    text = re.sub(
        r"The image provided is a portrait photograph[\s\S]*?"
        r"(?:plain background\.)",
        "\n",
        text,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _father_from_indian_full_name(full_name: str) -> str | None:
    """Given + Father + Surname → middle token(s) are father (common on Aadhaar)."""
    if _is_uncertain(full_name):
        return None
    parts = [p for p in re.split(r"\s+", str(full_name).strip()) if p]
    # Need at least Given Father Surname
    if len(parts) < 3:
        return None
    # Skip if any token looks like a title-only name
    bad = {"mr", "mrs", "ms", "shri", "smt", "kumari"}
    if parts[0].lower().rstrip(".") in bad:
        parts = parts[1:]
        if len(parts) < 3:
            return None
    middle = " ".join(parts[1:-1]).strip(" .-")
    if not middle or len(middle) < 2:
        return None
    return middle


def regex_fallback_fields(ocr_text: str, doc_type: str, fields: dict) -> dict:
    """Fill gaps and override hallucinated IDs when OCR has a clear pattern."""
    out = dict(fields)
    text = ocr_text or ""
    upper = text.upper()
    notes_extra = []

    # --- ID numbers: prefer OCR pattern over LLM (models sometimes invent IDs) ---
    ocr_id = None
    if doc_type == "Aadhaar Card":
        # Prefer spaced Aadhaar (XXXX XXXX XXXX). Avoid VID (16 digits) and DOB years.
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
    elif doc_type == "Driving License":
        m = re.search(
            r"\b([A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4}[\s\-]?\d{7})\b",
            upper,
        )
        if m:
            ocr_id = re.sub(r"[\s\-]+", " ", m.group(1)).strip()

    if ocr_id:
        current = re.sub(r"\s", "", str(out.get("id_number") or ""))
        ocr_compact = re.sub(r"\s", "", ocr_id)
        if _is_uncertain(out.get("id_number")) or current != ocr_compact:
            if current and current != ocr_compact and not _is_uncertain(out.get("id_number")):
                notes_extra.append(f"Overrode LLM id_number {current!r} with OCR {ocr_id!r}")
        # Always prefer OCR formatting (spaced Aadhaar) when digits match.
        out["id_number"] = ocr_id
    elif doc_type == "Aadhaar Card" and not _is_uncertain(out.get("id_number")):
        digits = re.sub(r"\D", "", str(out["id_number"]))
        if len(digits) == 12 and digits[0] in "23456789":
            out["id_number"] = f"{digits[:4]} {digits[4:8]} {digits[8:]}"

    # DOB: never grab a naked date on passbooks (opening date looks identical).
    if doc_type == "Bank Passbook":
        out = _scrub_bank_passbook_dob(text, out)
    else:
        labeled = _dob_from_labeled_ocr(text)
        if labeled:
            # Always prefer explicit DOB / जन्म तिथि over Issue Date hallucinations.
            out["dob"] = labeled
        elif _is_uncertain(out.get("dob")) and doc_type in (
            "Aadhaar Card",
            "PAN Card",
            "Driving License",
            "Voter ID",
            "School Certificate",
            "Passport",
        ):
            # Avoid Issue Date: only use unlabeled date if no "Issue" nearby.
            m = re.search(r"\b(\d{2}[/-]\d{2}[/-]\d{4})\b", text)
            if m:
                start = max(0, m.start() - 24)
                ctx = text[start : m.end() + 8].lower()
                if "issue" not in ctx and "जारी" not in ctx:
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
            r"(?:Father|Father'?s Name|S/O|D/O|C/O|W/O|पिता|पति)\s*[:\-/]?\s*([A-Za-z][A-Za-z.\s]{2,50})",
            text,
            re.IGNORECASE,
        )
        if m:
            out["father_name"] = re.sub(r"\s+", " ", m.group(1)).strip(" .-")
        elif doc_type in ("Aadhaar Card", "PAN Card"):
            inferred = _father_from_indian_full_name(str(out.get("full_name") or ""))
            if inferred:
                out["father_name"] = inferred
                notes_extra.append(
                    f"father_name inferred from middle of full_name ({inferred!r})"
                )

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


def process_document(
    client: SarvamAI,
    file_path: str,
    doc_type: str,
    language: str = "en-IN",
    *,
    handwritten: bool = False,
) -> dict:
    """Digitize → extract → regex. Only raises if digitization itself fails."""
    languages_to_try = [language]
    # Handwritten Indic forms often need Hindi OCR first.
    if handwritten and "hi-IN" not in languages_to_try:
        languages_to_try.insert(0, "hi-IN")
    if doc_type == "Aadhaar Card" and "hi-IN" not in languages_to_try:
        languages_to_try.append("hi-IN")
    elif language != "en-IN" and "en-IN" not in languages_to_try:
        languages_to_try.append("en-IN")
    if "en-IN" not in languages_to_try:
        languages_to_try.append("en-IN")

    last_err: Exception | None = None
    ocr_text = ""
    used_lang = language
    for lang in languages_to_try:
        try:
            ocr_text = digitize_document(client, file_path, language=lang)
            used_lang = lang
            # Handwritten scans can be shorter; accept thinner OCR.
            min_len = 12 if handwritten else 20
            if len(ocr_text.strip()) >= min_len:
                break
        except Exception as exc:
            last_err = exc
            ocr_text = ""

    if not ocr_text.strip():
        raise RuntimeError(
            f"Could not digitize {os.path.basename(file_path)} as {doc_type}. "
            f"Try a clear JPG/PNG photo (handwritten: flat light, no blur). Last error: {last_err}"
        )

    ocr_text = _clean_ocr_noise(ocr_text)
    fields = extract_fields(client, ocr_text, doc_type, handwritten=handwritten)
    fields = regex_fallback_fields(ocr_text, doc_type, fields)
    if handwritten and "handwrit" not in str(fields.get("confidence_notes", "")).lower():
        note = fields.get("confidence_notes") or ""
        fields["confidence_notes"] = f"{note} Handwritten/form source.".strip()

    return {
        "doc_type": doc_type,
        "source_file": os.path.basename(file_path),
        "language": used_lang,
        "handwritten": handwritten,
        "ocr_text": ocr_text,
        "fields": fields,
    }


FORM_EXTRACTION_SYSTEM = """Extract Indian government application-form field values from OCR text.
Return ONLY a JSON object. No markdown fences. No explanation.
Use the exact keys provided. Missing or unreadable values must be "".
Prefer noisy readable values over empty strings when text is present.
Normalize dates to DD/MM/YYYY when possible.
"""


def extract_form_answers(
    client: SarvamAI,
    ocr_text: str,
    form_fields: list[dict],
) -> dict[str, str]:
    """Extract service form answers from scanned-form OCR. Never raises."""
    keys = [f["key"] for f in form_fields if f.get("key")]
    if not keys:
        return {}

    schema = {k: "" for k in keys}
    labels = {f["key"]: f.get("label", f["key"]) for f in form_fields if f.get("key")}
    user_msg = (
        "Fill this JSON schema from the OCR of a filled paper form.\n"
        f"Field labels: {json.dumps(labels, ensure_ascii=False)}\n"
        f"Schema: {json.dumps(schema)}\n\n"
        f"OCR:\n{ocr_text[:12000]}"
    )

    raw = ""
    try:
        response = client.chat.completions(
            model="sarvam-30b",
            messages=[
                {"role": "system", "content": FORM_EXTRACTION_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
            max_tokens=1200,
            reasoning_effort=None,
        )
        msg = response.choices[0].message
        raw = (msg.content or "").strip()
        if not raw:
            raw = (getattr(msg, "reasoning_content", None) or "").strip()
    except Exception:
        return _regex_form_answers(ocr_text, form_fields)

    data: dict = {}
    if raw:
        try:
            data = _parse_json_reply(raw)
        except Exception:
            scraped = _loose_json_scrape(raw)
            data = scraped or {}

    out = _regex_form_answers(ocr_text, form_fields)
    for key in keys:
        val = data.get(key)
        if isinstance(val, str) and val.strip() and val.strip().upper() not in (
            "UNCERTAIN", "N/A", "NA",
        ):
            out[key] = val.strip()
        elif key not in out:
            out[key] = ""
    return {k: out.get(k, "") for k in keys}


def _regex_form_answers(ocr_text: str, form_fields: list[dict]) -> dict[str, str]:
    """Best-effort label-based scrape when LLM is unavailable or empty."""
    text = ocr_text or ""
    out: dict[str, str] = {}
    for spec in form_fields:
        key = spec.get("key")
        if not key:
            continue
        label = str(spec.get("label") or key)
        # Match "Label: value" or "Label\nvalue"
        pat = re.compile(
            rf"{re.escape(label)}\s*[:\-–]?\s*(.+?)(?:\n|$)",
            re.IGNORECASE,
        )
        m = pat.search(text)
        if m:
            val = re.sub(r"\s+", " ", m.group(1)).strip(" .-_|")
            if val and "FORM-ONLY" not in val.upper():
                out[key] = val[:200]
                continue

        # Common aliases for form-only / RTO fields
        aliases = {
            "mobile": r"(?:Mobile(?:\s*Number)?|Phone)\s*[:\-–]?\s*([6-9]\d{9})",
            "dl_number": r"(?:Driving\s*Licence(?:\s*Number)?|DL\s*(?:No|Number)?)\s*[:\-–]?\s*([A-Z]{2}\s?\d{2}\s?\d{4}\s?\d{7})",
            "full_name": r"(?:Full\s*Name|Applicant(?:\s*Full)?\s*Name)\s*[:\-–]?\s*([A-Za-z][A-Za-z.\s]{2,60})",
            "father_name": r"(?:Father'?s?(?:\s*/\s*Guardian'?s?)?\s*Name)\s*[:\-–]?\s*([A-Za-z][A-Za-z.\s]{2,60})",
            "dob": r"(?:Date\s*of\s*Birth|DOB)\s*[:\-–]?\s*(\d{2}[/-]\d{2}[/-]\d{4})",
            "change_type": r"(?:What\s*to\s*Change|Change\s*Type)\s*[:\-–]?\s*([A-Za-z /]{3,40})",
            "old_address": r"(?:Address\s*currently\s*on\s*DL|Old\s*Address|Address\s*on\s*Current\s*DL)\s*[:\-–]?\s*(.+?)(?:\n|$)",
            "new_address": r"(?:New\s*Address|Current\s*Address(?:\s*\(as\s*on\s*Aadhaar\))?)\s*[:\-–]?\s*(.+?)(?:\n|$)",
            "aadhaar_number": r"(?:Aadhaar(?:\s*Number)?)\s*[:\-–]?\s*([X\d]{4}\s*[X\d]{4}\s*\d{4}|\d{4}\s*\d{4}\s*\d{4})",
            "pan_number": r"(?:PAN(?:\s*(?:No|Number|Card))?)\s*[:\-–]?\s*([A-Z]{5}[0-9]{4}[A-Z])",
            "reason": r"(?:Reason(?:\s*for\s*Update)?)\s*[:\-–]?\s*(.+?)(?:\n|$)",
        }
        if key in aliases:
            m2 = re.search(aliases[key], text, re.IGNORECASE)
            if m2:
                out[key] = re.sub(r"\s+", " ", m2.group(1)).strip()[:200]
    return out


def process_scanned_form(
    client: SarvamAI,
    file_path: str,
    form_fields: list[dict],
    language: str = "en-IN",
) -> dict:
    """Digitize a scanned application form → service form_answers."""
    ocr_text, lang_used = digitize_document_resilient(
        client, file_path, language=language
    )
    answers = extract_form_answers(client, ocr_text, form_fields)
    return {
        "source_file": os.path.basename(file_path),
        "language": lang_used,
        "ocr_text": ocr_text,
        "form_answers": answers,
    }
