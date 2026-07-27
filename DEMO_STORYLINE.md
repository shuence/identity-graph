# Pehchaan Setu / IdentityGraph India — 3-minute demo script

**Stage plan:** first **60 seconds on the landing page** (scroll as you talk), then **2 minutes live on the desk**.  
**Metric you are moving:** rejection found at the portal → risk named at the desk, **same visit**.  
**Fallback:** keep a screen recording of the Judge demo ready. If live drops, play it and keep talking.

---

## 0:00–1:00 · Landing page only (one continuous minute)

*Stay on the landing page the whole minute. Scroll once: hero → stats → Today timeline → What changes. Do not open the desk yet.*

### Speak this (practice to ~60 seconds)

“Citizens still fill identity forms by hand — and portals reject them **after they leave**. Name spelling. Old address on the licence, new address on Aadhaar. The desk never saw the clash — until Parivahan or the bank did.

That’s the problem in plain words. No tech.

Look at the page: **18%+** of passport objections are tied to mismatched identity records — not missing papers, *mismatched* ones. **Two or three people** already touch the same case before it reaches the portal. And when the mismatch is found after upload, that’s **one return visit** — the citizen comes back, the desk starts over.

Today the friction is late. Here’s the hour:

**Fifteen to twenty-five minutes** — citizen and operator at the counter. Aadhaar, DL, PAN, passbook. Form filled by hand or typed while someone waits.

**Ten to twenty minutes more** — the operator retypes the same fields into Sarathi, UIDAI, or tax. Nothing checks whether those IDs actually agree.

**Days later** — the portal rejects. Mohd versus Mohammed. Old CIDCO address versus new Aadhaar. Citizen returns.

Baseline: rejection discovered at the portal.  
Impact we claim: the same risk named at the desk — **same visit**. About **sixteen minutes** saved versus finding the blocker at Parivahan. Two critical address risks caught on the RTO sample. One pack — filled form plus audit — ready to upload or fix.

Suvidha Desk sits between the paper and the portal. Let me show you one real interaction.”

*(Click **Open desk** as you finish that last line.)*

### Landing-page timing (inside the minute)

| Seconds | On screen | You land |
|--------:|-----------|----------|
| 0–12 | Hero | Problem in one breath — reject *after they leave* |
| 12–28 | Stat cards | **18%+** · **2–3 people** · **1 return visit** · friction is late |
| 28–50 | Today timeline | **15–25 min** paper · **10–20 min** retype · rejection days later |
| 50–60 | What changes / Open desk | Baseline → impact · **~16 min** · bridge into demo |

---

## 1:00–3:00 · Live demo (the centerpiece — end on the working product)

*Click **Open desk**. Run the RTO case (Judge demo or live). Narrate moments, not features.*

### Beat 1 — Pick the service (~10s)

“Same job you just saw on the timeline: driving licence address update. I pick the RTO service. The desk now knows which fields matter and which documents to expect.”

### Beat 2 — Fill the form, voice if needed (~25s)

“The citizen doesn’t have to fight block letters. If she can’t type, **Sevak** — the voice agent — asks one question at a time. She speaks; the answer lands on the form. Saaras listens, Bulbul talks back. And when the conversation ends, the form is still **editable** — a human can fix anything by eye.”

### Beat 3 — Documents in (~20s)

“Now the same pile from the counter: Aadhaar, PAN, bank passbook, driving licence. We digitize them — Sarvam Document Intelligence reads the scans, Sarvam-30B pulls out name, date of birth, address, ID numbers. If it isn’t sure, it says **UNCERTAIN**. It never invents a value.”

### Beat 4 — Verify: the moment that matters (~40s)

*This is the screen the whole pitch was building to. Slow down.*

“And here is the desk seeing what the portal would have seen — while the citizen is **still in the chair**.

Overall, about **92%** across four documents. Ten fields **match**. Six are **variants** — spelling differences like Mohd and Mohammed — flagged as harmless, not panic. And **two real risks**, both on address: the licence still carries the old CIDCO address; Aadhaar has the new one.

Per document: PAN is nearly clean at **98%**. The driving licence is the weak link at **86%** — and the desk says exactly that: **Fix — Driving Licence**.

This is the rejection from the landing page — caught **before upload**, not days after.”

### Beat 5 — The pack: close on impact (~25s)

“The operator stays in charge. They approve, and the desk hands over **one pack**: the filled application plus an identity audit — ready to upload, or ready to fix first.

So: before — upload, reject, citizen returns, desk retypes.  
After — risks on screen, fix or pack, **same visit**.

One outcome: the pack is clean enough to upload. Fewer return visits, roughly sixteen minutes saved per blocked case — and nobody gets sent home by a spelling difference.

That’s IdentityGraph Suvidha Desk.”

**Stop there. End on the product, not the architecture.**

---

## Cheat sheet (don’t read on stage)

| Clock | On screen | Key numbers to say |
|------:|-----------|--------------------|
| 0:00–1:00 | **Landing only** | Hero → **18%+** · **2–3** · **1 return** → **15–25 / 10–20 min** → baseline vs **~16 min** → Open desk |
| 1:00–1:35 | Service + form + Sevak | Voice fills, form stays editable |
| 1:35–1:55 | Docs upload | DI reads, 30B extracts, UNCERTAIN never guesses |
| 1:55–2:35 | **Verify** | **92%** overall · 10 match · 6 variant · **2 risks** · DL **86%**, PAN **98%** |
| 2:35–3:00 | Pack | Filled form + audit · same visit · impact close |

**Mistakes you are avoiding:** no tech-stack open, no “anyone can use this,” baseline stated (portal-time rejection), fallback recording ready, and the close is the pack — not the architecture.
