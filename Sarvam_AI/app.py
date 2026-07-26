"""IdentityGraph Suvidha Desk — demo-first citizen flow.

Demo path judges should click:
  1. Choose service (Link mobile to Aadhaar)
  2. Fill the application form (or one-click demo citizen)
  3. Upload / load supporting documents
  4. See verification flags + accuracy score
  5. Download filled form + audit pack
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from identitygraph.config import DOC_TYPES, FIELD_LABELS, FIELDS, LANGUAGES, REMEDIATION_PORTALS
from identitygraph.form_check import verify_form_against_docs
from identitygraph.knowledge_base import get_kb, validate_against_knowledge
from identitygraph.reconcile import CRITICAL, MATCH, UNCERTAIN, VARIANT, ReconciliationResult, reconcile
from identitygraph.report import build_audit_pdf, build_filled_form_pdf
from identitygraph.services import SERVICES, get_service

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

st.set_page_config(
    page_title="IdentityGraph Suvidha Desk",
    page_icon="🪪",
    layout="wide",
    initial_sidebar_state="expanded",
)

STEPS = [
    "1 · Choose service",
    "2 · Fill form",
    "3 · Upload documents",
    "4 · Verification & flags",
    "5 · Result pack",
]

_STATUS = {
    MATCH: ("✅", "Match"),
    VARIANT: ("🟢", "Harmless variant"),
    CRITICAL: ("🔴", "Critical blocker"),
    UNCERTAIN: ("🟡", "Needs review"),
}


def _demo_form_path(service: dict) -> Path:
    return ROOT / "sample_data" / (service.get("demo_answers") or "sample_form_answers.json")


def _demo_docs_path(service_id: str) -> Path:
    special = {
        "rto_dl_update": "sample_extractions_sanika.json",
        "scheme_apply": "sample_extractions_scheme.json",
        "grievance_complaint": "sample_extractions.json",
    }
    return ROOT / "sample_data" / special.get(service_id, "sample_extractions.json")


def _init_state():
    defaults = {
        "step": 0,
        "service_id": "link_mobile_aadhaar",
        "form_answers": {},
        "extractions": None,
        "operator_notes": "",
        "demo_mode": True,
        "voice_lang": "Hindi",
        "final_answers": {},
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def _api_key() -> str:
    return os.environ.get("API_KEY") or os.environ.get("SARVAM_API_KEY") or ""


def _guess_doc_type(filename: str, preferred: list[str]) -> str:
    """Pick a sensible default from the file name so PAN/Bank aren't left as Aadhaar."""
    name = filename.lower().replace(" ", "")
    rules = [
        (("pan",), "PAN Card"),
        (("aadhaar", "adhar", "aadhar"), "Aadhaar Card"),
        (("passbook", "bank", "statement"), "Bank Passbook"),
        (("voter", "epic"), "Voter ID"),
        (("ration",), "Ration Card"),
        (("dl", "licence", "license", "driving"), "Driving License"),
        (("passport",), "Passport"),
    ]
    for keys, doc in rules:
        if any(k in name for k in keys) and doc in preferred + list(DOC_TYPES):
            return doc
    return preferred[0] if preferred else "Other"


def _extract_uploads(configs: list) -> list[dict]:
    """Run Sarvam Vision + 30B on each uploaded file. Returns extraction records."""
    from identitygraph.sarvam_pipeline import get_client, process_document

    client = get_client(_api_key())
    records = []
    failures = []
    bar = st.progress(0.0)
    for i, (up, dtype, lang) in enumerate(configs):
        with st.status(f"{up.name} → {dtype}", expanded=True) as s:
            suffix = Path(up.name).suffix
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(up.getvalue())
                path = tmp.name
            try:
                # Aadhaar digitizes better with Hindi language hint
                if dtype == "Aadhaar Card" and lang == "en-IN":
                    lang = "hi-IN"
                rec = process_document(client, path, dtype, language=lang)
                rec["source_file"] = up.name
                records.append(rec)
                readable = sum(
                    1 for k in ("full_name", "dob", "id_number", "address", "father_name")
                    if str(rec["fields"].get(k, "")).upper() not in ("", "UNCERTAIN")
                )
                s.update(
                    label=f"{up.name}: OK as {dtype} ({readable}/5 fields readable)",
                    state="complete",
                )
            except Exception as exc:
                failures.append({"file": up.name, "doc_type": dtype, "error": str(exc)})
                s.update(label=f"{up.name}: FAILED — {exc}", state="error")
                st.error(f"{up.name} ({dtype}): {exc}")
            finally:
                os.unlink(path)
        bar.progress((i + 1) / len(configs))
    st.session_state["extraction_failures"] = failures
    return records


def _run_verification():
    """Compute form↔doc, cross-doc, and KB accuracy; store on session."""
    service = get_service(st.session_state.service_id)
    answers = st.session_state.form_answers or {}
    extractions = st.session_state.extractions or []
    form_ver = verify_form_against_docs(answers, service["form_fields"], extractions)
    cross = reconcile(extractions) if len(extractions) >= 2 else ReconciliationResult()
    statuses = {c.form_key: c.status for c in form_ver.checks}
    kb = validate_against_knowledge(st.session_state.service_id, answers, extractions, statuses)
    st.session_state["form_ver"] = form_ver
    st.session_state["cross"] = cross
    st.session_state["kb_result"] = kb
    st.session_state["final_answers"] = dict(answers)
    return form_ver, cross, kb


_init_state()

# --------------- Sidebar ---------------
with st.sidebar:
    st.markdown("## 🪪 Suvidha Desk")
    st.caption("Demo: fill form → upload docs → verification flags → portal pack")
    st.session_state.demo_mode = st.toggle(
        "Demo mode (no API calls)",
        value=st.session_state.demo_mode,
        help="Uses sample citizen + document set. Turn off to use live Sarvam APIs.",
    )
    st.session_state.voice_lang = st.selectbox("Voice language (optional)", list(LANGUAGES), index=1)
    if not st.session_state.demo_mode:
        if _api_key():
            st.success("Sarvam API key loaded")
        else:
            st.warning("Add API_KEY to .env for live uploads")
    st.divider()
    st.markdown("**Demo in 5 clicks**")
    st.markdown(
        "1. Keep **Link mobile on Aadhaar**\n"
        "2. **Prefill demo citizen** → Submit form\n"
        "3. **Load demo documents**\n"
        "4. Read flags + score\n"
        "5. Download PDFs"
    )
    st.divider()
    for i, label in enumerate(STEPS):
        marker = "→" if i == st.session_state.step else ("✓" if i < st.session_state.step else "·")
        st.markdown(f"{marker} {label}")

service = get_service(st.session_state.service_id)

st.title("IdentityGraph Suvidha Desk")
st.markdown(
    f"**Job:** {service['title']}  \n"
    f"<span style='color:#666'>{service['tagline']}</span>",
    unsafe_allow_html=True,
)
st.progress((st.session_state.step + 1) / len(STEPS), text=STEPS[st.session_state.step])


# =====================================================================
# STEP 0 — Choose service
# =====================================================================
if st.session_state.step == 0:
    st.subheader("Step 1 — What does the citizen need?")
    st.info(
        "**For the hackathon demo, pick “Link / Update Mobile on Aadhaar”** — "
        "the Setu Suvidha Kendra form you described (change/link mobile, then verify with documents)."
    )

    cols = st.columns(2)
    for i, (sid, svc) in enumerate(SERVICES.items()):
        with cols[i % 2]:
            selected = sid == st.session_state.service_id
            if st.button(
                f"{'✅ ' if selected else ''}{svc['title']}",
                key=f"svc_{sid}",
                use_container_width=True,
                type="primary" if selected else "secondary",
            ):
                st.session_state.service_id = sid
                st.session_state.form_answers = {}
                st.session_state.extractions = None
                st.rerun()

    kb = get_kb(st.session_state.service_id)
    st.markdown(f"**This form will ask for:** {', '.join(f['label'] for f in service['form_fields'])}")
    st.markdown(f"**Documents to bring:** {', '.join(service['required_docs'])}")
    st.caption(f"Portal: {service['portal']['name']}")

    if st.button("Next → Fill the application form", type="primary"):
        st.session_state.step = 1
        st.rerun()


# =====================================================================
# STEP 1 — Fill application form (looks like the paper form)
# =====================================================================
elif st.session_state.step == 1:
    st.subheader("Step 2 — Fill the application form")
    st.markdown(
        "This is the form the Seva Kendra used to make you write in **block letters**. "
        "Fill it as the citizen — or prefill the demo citizen in one click."
    )

    c1, c2, c3 = st.columns(3)
    with c1:
        if st.button("← Back"):
            st.session_state.step = 0
            st.rerun()
    with c2:
        if st.button("⚡ Prefill demo citizen", use_container_width=True):
            st.session_state.form_answers = json.loads(_demo_form_path(service).read_text())
            st.rerun()
    with c3:
        if st.button("Clear form", use_container_width=True):
            st.session_state.form_answers = {}
            st.rerun()

    answers = dict(st.session_state.form_answers or {})

    # Visual "government form" card
    st.markdown(
        f"""
<div style="border:2px solid #1a1a1a;padding:1.25rem 1.5rem;background:#faf9f6;
border-radius:2px;margin:0.5rem 0 1rem 0;">
  <div style="text-align:center;font-weight:700;font-size:1.15rem;letter-spacing:0.04em;">
    {service['title'].upper()}
  </div>
  <div style="text-align:center;font-size:0.85rem;color:#555;margin-top:0.25rem;">
    Application form · {service['portal']['name']}
  </div>
  <hr style="border:none;border-top:1px solid #ccc;margin:0.75rem 0;"/>
  <div style="font-size:0.8rem;color:#666;">
    Fill in BLOCK LETTERS · Keep name spelling exactly as on Aadhaar · Attach supporting documents
  </div>
</div>
""",
        unsafe_allow_html=True,
    )

    with st.form("application_form", clear_on_submit=False):
        filled = {}
        for spec in service["form_fields"]:
            key = spec["key"]
            label = spec["label"]
            if spec.get("high_stakes"):
                label = f"{label} *"
            default = answers.get(key, "")
            if key in ("address", "reason", "complaint_summary", "desired_outcome", "old_address", "new_address"):
                filled[key] = st.text_area(label, value=default, key=f"form_{key}", height=70)
            else:
                filled[key] = st.text_input(label, value=default, key=f"form_{key}")
        st.caption("* High-stakes fields — knowledge base will validate format and document match.")
        submitted = st.form_submit_button("Submit form → Upload documents", type="primary", use_container_width=True)

    if submitted:
        cleaned = {k: (v or "").strip() for k, v in filled.items()}
        empty = [s["label"] for s in service["form_fields"] if not cleaned.get(s["key"])]
        if empty:
            st.error("Please fill all fields before continuing: " + ", ".join(empty))
        else:
            st.session_state.form_answers = cleaned
            st.session_state.step = 2
            st.rerun()

    # Optional voice assist (collapsed for demo clarity)
    with st.expander("Optional: fill one field by voice (Saaras + Bulbul)"):
        st.caption("Demo mode simulates speech; live mode uses the mic + Sarvam APIs.")
        field = st.selectbox(
            "Field",
            service["form_fields"],
            format_func=lambda f: f["label"],
            key="voice_field_pick",
        )
        lang_code = LANGUAGES[st.session_state.voice_lang]
        prompt = field["prompt_hi"] if lang_code.startswith("hi") else field["prompt_en"]
        st.info(f"Desk would ask: *{prompt}*")
        if st.session_state.demo_mode:
            spoken = st.text_input("What the citizen said", placeholder="mera mobile number 9876543210 hai")
            if st.button("Lock this field from speech"):
                if spoken.strip():
                    answers[field["key"]] = spoken.strip()
                    st.session_state.form_answers = answers
                    st.success(f"Saved {field['label']}: {spoken.strip()}")
                    st.rerun()
        else:
            if _api_key() and st.button("▶ Play prompt"):
                try:
                    from identitygraph.voice import get_client, speak
                    st.audio(speak(get_client(_api_key()), prompt, language=lang_code), format="audio/wav")
                except Exception as exc:
                    st.error(str(exc))
            audio_file = st.audio_input("Record answer")
            if audio_file and st.button("Transcribe (Saaras v3)"):
                try:
                    from identitygraph.voice import get_client, transcribe
                    result = transcribe(get_client(_api_key()), audio_file.read(), mode="codemix")
                    answers[field["key"]] = result["transcript"]
                    st.session_state.form_answers = answers
                    st.success(result["transcript"])
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))


# =====================================================================
# STEP 2 — Upload documents
# =====================================================================
elif st.session_state.step == 2:
    st.subheader("Step 3 — Upload supporting documents")
    st.markdown(
        f"At the kendra the operator asked for: **{', '.join(service['required_docs'])}**. "
        "Upload scans here (or load the demo set). We extract identity fields and keep UNCERTAIN when unreadable."
    )

    # Show submitted form summary
    with st.expander("Submitted form (what you filled)", expanded=True):
        for spec in service["form_fields"]:
            st.markdown(f"**{spec['label']}:** `{st.session_state.form_answers.get(spec['key'], '—')}`")

    b1, b2 = st.columns(2)
    with b1:
        if st.button("← Edit form"):
            st.session_state.step = 1
            st.rerun()
    with b2:
        if st.session_state.demo_mode and st.button(
            "⚡ Load demo documents → Run verification",
            type="primary",
            use_container_width=True,
        ):
            st.session_state.extractions = json.loads(
                _demo_docs_path(st.session_state.service_id).read_text()
            )
            _run_verification()
            st.session_state.step = 3
            st.rerun()

    st.markdown("#### Or upload your own scans")
    if st.session_state.demo_mode:
        st.info(
            "You already uploaded files — click the red button below. "
            "It will **automatically leave Demo mode** and call Sarvam on your documents."
        )
    uploads = st.file_uploader(
        "PDF / JPG / PNG (max 10 pages each)",
        type=["pdf", "jpg", "jpeg", "png"],
        accept_multiple_files=True,
    )

    if uploads:
        configs = []
        for i, up in enumerate(uploads):
            preferred = service["required_docs"] + [
                d for d in DOC_TYPES if d not in service["required_docs"]
            ]
            guessed = _guess_doc_type(up.name, preferred)
            # Put guessed type first so the selectbox defaults correctly
            ordered = [guessed] + [d for d in preferred if d != guessed]
            c1, c2, c3 = st.columns([2, 2, 2])
            with c1:
                st.text(up.name)
            with c2:
                dtype = st.selectbox("Document type", ordered, key=f"dtype_{i}")
            with c3:
                lang = st.selectbox("Language", list(LANGUAGES), key=f"dlang_{i}")
            configs.append((up, dtype, LANGUAGES[lang]))

        btn_label = (
            "Verify my uploaded documents (uses Sarvam APIs)"
            if st.session_state.demo_mode
            else "Extract with Sarvam Vision + run verification"
        )
        if st.button(btn_label, type="primary", use_container_width=True):
            if not _api_key():
                st.error("API_KEY missing in .env — add your Sarvam key and refresh.")
                st.stop()
            # Leave demo mode automatically so live uploads aren't blocked
            st.session_state.demo_mode = False
            with st.spinner("Digitizing with Sarvam Vision, then verifying… (may take 1–2 min)"):
                records = _extract_uploads(configs)
            if records:
                st.session_state.extractions = records
                _run_verification()
                st.session_state.step = 3
                st.rerun()
            else:
                st.error("No documents processed successfully. Check errors above and try again.")


# =====================================================================
# STEP 3 — Verification & flags
# =====================================================================
elif st.session_state.step == 3:
    st.subheader("Step 4 — Verification & flags")
    st.markdown(
        "Three checks: **(1)** is the form filled correctly per knowledge base, "
        "**(2)** do answers match the documents, **(3)** do documents match each other."
    )

    if st.button("← Back to documents"):
        st.session_state.step = 2
        st.rerun()

    form_ver, cross, kb = _run_verification()
    extractions = st.session_state.extractions or []

    grade_color = {"READY": "green", "FIX_REQUIRED": "orange", "BLOCKED": "red"}[kb.grade]
    st.markdown(f"### Accuracy: **:{grade_color}[{kb.score}/100 — {kb.grade}]**")
    st.caption(kb.process_summary)

    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Accuracy", kb.score)
    m2.metric("Format OK", kb.details.get("format_score", 0))
    m3.metric("Docs present", kb.details.get("docs_score", 0))
    m4.metric("Form↔Doc", kb.details.get("match_score", 0))
    m5.metric("Complete", kb.details.get("completeness", 0))

    if kb.grade == "READY":
        st.success("Form looks correct for this service. Safe to generate the portal pack.")
    elif kb.grade == "FIX_REQUIRED":
        st.warning("Flags found — fix before portal upload or override as operator.")
    else:
        st.error("Blocked — critical problems. Do not upload without fixing.")

    # --- Show what Sarvam actually extracted (this is why mapping fails) ---
    st.markdown("### What was extracted from each document")
    st.caption(
        "If Aadhaar is missing here, verification cannot map your form to Aadhaar — "
        "re-upload with type **Aadhaar Card** (JPG/PNG photo often works better than PDF)."
    )
    failures = st.session_state.get("extraction_failures") or []
    if failures:
        for f in failures:
            st.error(f"Failed: **{f['file']}** as {f['doc_type']} — {f['error']}")

    if not extractions:
        st.error("No documents were successfully digitized. Re-upload and run verification again.")
    else:
        present = {e["doc_type"] for e in extractions}
        for need in service["required_docs"]:
            if need not in present:
                st.error(f"Required document missing from results: **{need}**")
        for rec in extractions:
            fields = rec.get("fields") or {}
            readable = [
                k for k in ("full_name", "father_name", "dob", "address", "id_number")
                if str(fields.get(k, "")).upper() not in ("", "UNCERTAIN")
            ]
            with st.expander(
                f"{rec['doc_type']} · {rec.get('source_file', '')} · "
                f"{len(readable)}/5 fields readable",
                expanded=("Aadhaar" in rec["doc_type"]),
            ):
                st.json({k: fields.get(k) for k in
                         ("full_name", "father_name", "dob", "address", "id_number", "confidence_notes")})
                ocr = (rec.get("ocr_text") or "")[:800]
                if ocr:
                    st.markdown("**OCR / digitized text (preview)**")
                    st.code(ocr, language=None)

    # Flag board
    st.markdown("### Flag board")
    flags = []
    for issue in kb.field_issues:
        if issue.severity in ("FAIL", "WARN"):
            flags.append((issue.severity, issue.field_key, issue.message))
    for check in form_ver.checks:
        if check.status in (CRITICAL, UNCERTAIN):
            flags.append((check.status, check.label, check.detail))
    for comp in cross.critical:
        flags.append((CRITICAL, FIELD_LABELS[comp.field], f"{comp.doc_a} vs {comp.doc_b}: {comp.detail}"))

    if not flags and kb.grade == "READY":
        st.success("No critical or review flags. Name variants (e.g. Mohd / Mohammed) treated as harmless.")
    else:
        for severity, title, detail in flags:
            if severity in ("FAIL", CRITICAL):
                st.error(f"**FLAG · {title}** — {detail}")
            else:
                st.warning(f"**REVIEW · {title}** — {detail}")

    if kb.rejection_risks:
        st.markdown("#### Portal rejection risks (from knowledge base)")
        for r in kb.rejection_risks:
            st.markdown(f"- {r}")

    st.markdown("### Form value vs document value")
    if not form_ver.checks:
        st.info("No document fields to compare for this service.")
    for check in form_ver.checks:
        icon, label = _STATUS[check.status]
        with st.container(border=True):
            st.markdown(f"{icon} **{label} — {check.label}**")
            a, b = st.columns(2)
            a.markdown(f"*On form:* `{check.form_value}`")
            b.markdown(f"*{check.doc_type or '—'}:* `{check.doc_value or '—'}`")
            st.caption(check.detail)

    if len(extractions) >= 2:
        st.markdown("### Documents side by side")
        header = "| Field | " + " | ".join(r["doc_type"] for r in extractions) + " |"
        sep = "|" + "---|" * (len(extractions) + 1)
        rows = [header, sep]
        for key, label in FIELDS:
            cells = [
                (f"*{v}*" if str(v := rec['fields'].get(key, 'UNCERTAIN')).upper() == "UNCERTAIN" else v)
                for rec in extractions
            ]
            rows.append(f"| **{label}** | " + " | ".join(cells) + " |")
        st.markdown("\n".join(rows))

        if cross.primary_blocker_doc:
            rem = REMEDIATION_PORTALS.get(cross.primary_blocker_doc, REMEDIATION_PORTALS["Other"])
            st.error(
                f"**Fix this document first:** {cross.primary_blocker_doc} "
                f"({cross.blocker_counts.get(cross.primary_blocker_doc, 0)} critical). "
                f"{rem['portal']}"
            )

    st.session_state.operator_notes = st.text_area(
        "Operator notes (optional — printed on form)",
        value=st.session_state.operator_notes,
        placeholder="e.g. Confirmed mobile with citizen; PAN name is Mohd variant of Aadhaar Mohammed.",
    )

    if st.button("Approve & generate result pack →", type="primary", use_container_width=True):
        st.session_state.step = 4
        st.rerun()


# =====================================================================
# STEP 4 — Result pack
# =====================================================================
elif st.session_state.step == 4:
    st.subheader("Step 5 — Result pack")
    st.markdown(
        "This is what the kendra used to assemble by hand: a **filled update form** "
        "plus an **identity audit** with every flag explained."
    )

    final_answers = st.session_state.get("final_answers") or st.session_state.form_answers
    extractions = st.session_state.extractions or []
    form_ver = st.session_state.get("form_ver")
    cross = st.session_state.get("cross") or ReconciliationResult()
    kb = st.session_state.get("kb_result")

    if kb:
        st.metric("Final accuracy score", f"{kb.score}/100 · {kb.grade}")

    st.markdown("### What you submitted → what goes to the portal")
    rows = ["| Field | Value |", "|---|---|"]
    for spec in service["form_fields"]:
        rows.append(f"| {spec['label']} | `{final_answers.get(spec['key'], '—')}` |")
    st.markdown("\n".join(rows))

    form_pdf = build_filled_form_pdf(service, final_answers, st.session_state.operator_notes)
    audit_pdf = build_audit_pdf(
        extractions,
        cross,
        form_checks=form_ver.checks if form_ver else None,
        service_title=service["title"],
    )
    pack = {
        "service": service["id"],
        "portal": service["portal"],
        "accuracy": {"score": kb.score, "grade": kb.grade} if kb else None,
        "answers": final_answers,
        "operator_notes": st.session_state.operator_notes,
        "flags": [
            {"field": i.field_key, "severity": i.severity, "message": i.message}
            for i in (kb.field_issues if kb else [])
            if i.severity in ("FAIL", "WARN")
        ],
        "documents": [
            {"doc_type": e["doc_type"], "source_file": e.get("source_file"), "fields": e["fields"]}
            for e in extractions
        ],
    }

    d1, d2, d3 = st.columns(3)
    with d1:
        st.download_button(
            "⬇️ Filled form (PDF)",
            data=form_pdf,
            file_name="suvidha_filled_form.pdf",
            mime="application/pdf",
            type="primary",
            use_container_width=True,
        )
    with d2:
        st.download_button(
            "⬇️ Verification audit (PDF)",
            data=audit_pdf,
            file_name="identitygraph_audit.pdf",
            mime="application/pdf",
            use_container_width=True,
        )
    with d3:
        st.download_button(
            "⬇️ Flags + data (JSON)",
            data=json.dumps(pack, indent=2, ensure_ascii=False),
            file_name="suvidha_result_pack.json",
            mime="application/json",
            use_container_width=True,
        )

    st.success(
        f"Ready for **{service['portal']['name']}**. "
        "Attach these files with the document scans — no re-typing."
    )
    st.link_button("Open portal", service["portal"]["url"])

    if st.button("↺ Start new demo / another citizen"):
        keep = {"demo_mode", "voice_lang"}
        for k in list(st.session_state.keys()):
            if k not in keep:
                del st.session_state[k]
        st.rerun()
