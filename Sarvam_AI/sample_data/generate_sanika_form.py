#!/usr/bin/env python3
"""Generate Sanika Chavan Suvidha/RTO paper form PNGs/JPGs from sample_form_sanika.json."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent


def _load_citizen() -> dict:
    raw = json.loads((OUT / "sample_form_sanika.json").read_text())
    addr = (raw.get("new_address") or raw.get("address") or "").upper()
    if ", " in addr and "\n" not in addr:
        parts = addr.split(", ")
        mid = max(1, len(parts) // 2)
        addr = ", ".join(parts[:mid]) + ",\n" + ", ".join(parts[mid:])
    aadhaar = raw.get("aadhaar_number") or ""
    digits = "".join(c for c in aadhaar if c.isdigit())
    masked = f"XXXX XXXX {digits[-4:]}" if len(digits) >= 4 else aadhaar
    return {
        "full_name": (raw.get("full_name") or "").upper(),
        "father_name": (raw.get("father_name") or "").upper(),
        "dob": raw.get("dob") or "",
        "gender": raw.get("gender") or "",
        "aadhaar": masked,
        "mobile": raw.get("mobile") or "",
        "email": raw.get("email") or "",
        "address": addr,
        "pincode": raw.get("pincode") or "",
        "blood_group": raw.get("blood_group") or "",
        "emergency_contact": (raw.get("emergency_contact") or "").upper(),
        "change_type": (raw.get("change_type") or "Address").upper(),
        "dl_number": raw.get("dl_number") or "",
        "old_address": (raw.get("old_address") or "").upper(),
        "category": raw.get("category") or "",
        "reason": (raw.get("reason") or "").upper(),
    }


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _checkbox(draw: ImageDraw.ImageDraw, x: int, y: int, checked: bool, label: str, font) -> None:
    box = 18
    draw.rectangle([x, y, x + box, y + box], outline=(40, 40, 40), width=2)
    if checked:
        draw.line([(x + 3, y + 9), (x + 7, y + 14), (x + 15, y + 3)], fill=(20, 90, 40), width=3)
    draw.text((x + box + 8, y - 1), label, fill=(30, 30, 30), font=font)


def _field_row(
    draw: ImageDraw.ImageDraw,
    y: int,
    label: str,
    value: str,
    *,
    width: int,
    margin: int,
    label_font,
    value_font,
    form_only: bool = False,
    blank: bool = False,
) -> int:
    draw.text((margin, y), label, fill=(70, 70, 70), font=label_font)
    if form_only:
        badge = "FORM-ONLY (not in eKYC)"
        bw = draw.textlength(badge, font=label_font)
        draw.rounded_rectangle(
            [width - margin - bw - 16, y - 2, width - margin, y + 16],
            radius=4,
            fill=(255, 236, 210),
            outline=(200, 140, 60),
        )
        draw.text((width - margin - bw - 8, y), badge, fill=(140, 80, 20), font=label_font)

    y += 22
    box_h = 36 if "\n" not in value else 58
    draw.rectangle(
        [margin, y, width - margin, y + box_h],
        outline=(160, 160, 160),
        width=1,
        fill=(252, 252, 248),
    )
    text = "" if blank else value
    draw.multiline_text(
        (margin + 10, y + 8), text, fill=(15, 55, 120), font=value_font, spacing=4
    )
    return y + box_h + 14


def build_form(*, filled: bool, citizen: dict) -> Image.Image:
    width, height = 900, 1680
    img = Image.new("RGB", (width, height), (248, 246, 240))
    draw = ImageDraw.Draw(img)
    margin = 48

    title_f = _font(22, bold=True)
    sub_f = _font(12)
    label_f = _font(11)
    value_f = _font(15, bold=True)
    small_f = _font(10)
    section_f = _font(13, bold=True)

    draw.rectangle([0, 0, width, 110], fill=(18, 62, 110))
    draw.text((margin, 22), "IdentityGraph  |  Suvidha Desk", fill=(220, 230, 245), font=sub_f)
    draw.text(
        (margin, 44),
        "APPLICATION FORM — RTO / AADHAAR DESK",
        fill=(255, 255, 255),
        font=title_f,
    )
    draw.text(
        (margin, 78),
        "Citizen fills in BLOCK LETTERS  ·  Operator scans form  ·  OCR verifies vs KYC docs",
        fill=(180, 200, 230),
        font=small_f,
    )

    y = 130
    draw.text((margin, y), "Service requested (tick one)", fill=(30, 30, 30), font=section_f)
    y += 28
    services = [
        ("Link / Update Mobile on Aadhaar", False),
        ("RTO — DL Address / Name Update", True),
        ("PAN ↔ Aadhaar Link", False),
        ("Scheme Application", False),
    ]
    x = margin
    for label, checked in services:
        _checkbox(draw, x, y, checked and filled, label, small_f)
        x += 210
        if x > width - 220:
            x = margin
            y += 28
    y += 40

    draw.rounded_rectangle(
        [margin, y, width - margin, y + 48],
        radius=6,
        fill=(232, 242, 255),
        outline=(100, 140, 190),
    )
    draw.multiline_text(
        (margin + 12, y + 8),
        "eKYC can provide name / DOB / Aadhaar / photo. Fields tagged FORM-ONLY "
        "(mobile, reason, change type, emergency contact, blood group, etc.)\n"
        "must be written on this form — then scanned and checked against uploaded documents.",
        fill=(40, 70, 110),
        font=small_f,
    )
    y += 64

    draw.text(
        (margin, y),
        "1. Particulars available from KYC / documents",
        fill=(30, 30, 30),
        font=section_f,
    )
    y += 26

    rows_kyc = [
        ("Full Name (as on Aadhaar / DL)", citizen["full_name"], False),
        ("Father's / Guardian's Name", citizen["father_name"], False),
        ("Date of Birth (DD/MM/YYYY)", citizen["dob"], False),
        ("Gender", citizen["gender"], False),
        ("Aadhaar Number (masked)", citizen["aadhaar"], False),
        ("Driving Licence Number", citizen["dl_number"], False),
        ("Current Address (as on Aadhaar)", citizen["address"], False),
        ("PIN Code", citizen["pincode"], False),
    ]
    for label, value, form_only in rows_kyc:
        y = _field_row(
            draw,
            y,
            label,
            value,
            width=width,
            margin=margin,
            label_font=label_f,
            value_font=value_f,
            form_only=form_only,
            blank=not filled,
        )

    draw.text(
        (margin, y),
        "2. Particulars NOT in eKYC — write on form",
        fill=(30, 30, 30),
        font=section_f,
    )
    y += 26

    rows_form_only = [
        ("Mobile Number", citizen["mobile"], True),
        ("Email ID", citizen["email"], True),
        ("Blood Group", citizen["blood_group"], True),
        ("Emergency Contact (name / mobile)", citizen["emergency_contact"], True),
        ("What to Change (Name / Address / Both)", citizen["change_type"], True),
        ("Address currently on DL (old)", citizen["old_address"], True),
        ("Category (SC / ST / OBC / EWS / General)", citizen["category"], True),
        ("Reason for Update", citizen["reason"], True),
    ]
    for label, value, form_only in rows_form_only:
        y = _field_row(
            draw,
            y,
            label,
            value,
            width=width,
            margin=margin,
            label_font=label_f,
            value_font=value_f,
            form_only=form_only,
            blank=not filled,
        )

    y += 4
    draw.text((margin, y), "3. Declaration", fill=(30, 30, 30), font=section_f)
    y += 22
    draw.multiline_text(
        (margin, y),
        "I hereby declare that the particulars given above are true to the best of my knowledge.\n"
        "I understand the operator will scan this form and verify written fields against my documents.",
        fill=(50, 50, 50),
        font=small_f,
    )
    y += 44
    _checkbox(draw, margin, y, filled, "I agree to the above declaration", small_f)
    y += 36

    draw.line([(margin, y + 30), (margin + 280, y + 30)], fill=(80, 80, 80), width=1)
    draw.line(
        [(width - margin - 280, y + 30), (width - margin, y + 30)],
        fill=(80, 80, 80),
        width=1,
    )
    draw.text((margin, y + 36), "Citizen signature / thumb", fill=(100, 100, 100), font=small_f)
    draw.text(
        (width - margin - 280, y + 36),
        "Operator / Suvidha Desk",
        fill=(100, 100, 100),
        font=small_f,
    )
    if filled:
        draw.text(
            (margin + 20, y + 4),
            citizen["full_name"].title(),
            fill=(15, 55, 120),
            font=value_f,
        )
        draw.text(
            (width - margin - 260, y + 4),
            "Verified — Desk",
            fill=(15, 55, 120),
            font=value_f,
        )

    draw.rectangle([0, height - 42, width, height], fill=(18, 62, 110))
    status = (
        "FILLED COPY — scan for OCR verification"
        if filled
        else "BLANK TEMPLATE — citizen fills by hand"
    )
    draw.text(
        (margin, height - 28),
        f"Form ID: IG-RTO-SANIKA-001  ·  {status}",
        fill=(200, 215, 235),
        font=small_f,
    )

    return img


def main() -> None:
    citizen = _load_citizen()
    filled = build_form(filled=True, citizen=citizen)
    blank = build_form(filled=False, citizen=citizen)
    filled_png = OUT / "sanika_chavan_filled_form.png"
    blank_png = OUT / "sanika_chavan_blank_form.png"
    filled.save(filled_png, "PNG", optimize=True)
    blank.save(blank_png, "PNG", optimize=True)
    filled.convert("RGB").save(OUT / "sanika_chavan_filled_form.jpg", "JPEG", quality=92)
    blank.convert("RGB").save(OUT / "sanika_chavan_blank_form.jpg", "JPEG", quality=92)
    print(f"Wrote {filled_png.name}, {blank_png.name} (+ .jpg) from sample_form_sanika.json")


if __name__ == "__main__":
    main()
