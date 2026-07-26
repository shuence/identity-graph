# IdentityGraph Suvidha Desk

**Setu Suvidha Kendra, automated.** Voice-fill the form → digitize supporting docs → verify mismatches → operator approves → portal pack downloads.

Selected Sarvam parameter for judging: **Document Intelligence** (2.5×).  
Voice (Saaras + Bulbul) is used because citizens who can't fill block-letter forms need it — it strengthens JTBD / Delight / Creativity, but is not a second scored Sarvam slot.

## The real job (from a Suvidha Kendra visit)

1. Citizen needs to link mobile ↔ Aadhaar  
2. Operator hands a paper form → citizen struggles with block letters  
3. Operator asks for Aadhaar + old PAN + bank passbook  
4. Operator manually compares name / DOB / address across all three  
5. Operator scans form + docs and uploads to the portal  

Today that judgment call is slow, error-prone, and invisible. Suvidha Desk makes it the product.

## Pipeline (Sarvam models actually used)

| Step | Model / API | What it does |
|---|---|---|
| Voice prompts | **Bulbul v3** `text_to_speech.convert` | Desk reads each form field in Hindi/Indic |
| Citizen answers | **Saaras v3** `speech_to_text.transcribe` (`mode=codemix`) | Handles Hindi–English mixed speech |
| Doc digitization | **Sarvam Vision** Document Intelligence job API | create → upload → start → wait → download ZIP |
| Field extraction | **Sarvam-30B** chat completions | Strict JSON; outputs `UNCERTAIN` instead of guessing |
| Reconciliation | Local engine (`jellyfish` + Indic variant tables) | Variant vs critical vs uncertain |
| Portal pack | Local PDF | Filled form + identity audit |

## Run

```bash
cd /Users/sanikachavan/Desktop/Sarvam_AI
source .venv/bin/activate
streamlit run app.py
```

Demo mode (default): click through with one button loads — no API risk during judging.  
Live mode: flip the sidebar toggle; needs `API_KEY` in `.env`.

## Demo script for judges (90 seconds)

1. **Service** — "Link mobile to Aadhaar" (the kendra job everyone recognizes).  
2. **Voice form** — Load demo answers (or live: speak a tricky name, show confirm-back).  
3. **Documents** — Load Aadhaar + PAN + Passbook sample.  
4. **Verify** — Show `Mohd`/`Mohammed` as harmless variant; any real blocker in red; UNCERTAIN never guessed.  
5. **Operator** — Human still decides.  
6. **Portal pack** — Download filled form PDF + audit PDF. That is the usable JTBD outcome.

## Rubric aim

| Parameter | Target | Why this product hits it |
|---|---|---|
| JTBD (2.5×) | L4–L5 | Final artifact = portal-ready filled form + audit, not a chat summary |
| Memory (1×) | L3–L4 | Form answers, doc fields, overrides, notes survive every step of the desk |
| Creativity (1.5×) | L4 | Reframes OCR as *operator desk automation*, not "upload & extract" |
| Impact (1.5×) | L4 | Millions of CSC/Suvidha updates; name-mismatch rejections are the bottleneck |
| Delight (1×) | L3–L4 | Confirm-back honesty; UNCERTAIN instead of false reassurance; clear next portal step |
| Document Intelligence (2.5×) | L4 | Mixed real docs + uncertainty + provenance-style audit vs source values |
