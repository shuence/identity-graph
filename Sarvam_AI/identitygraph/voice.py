"""Voice helpers — Saaras v3 STT + Bulbul v3 TTS.

Used for the citizen-facing form step: the desk reads each question aloud,
the citizen answers in their own language (often code-mixed), and the
transcript is written into the form field after a confirm-back.
"""

from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path

from sarvamai import SarvamAI


def get_client(api_key: str | None = None) -> SarvamAI:
    key = api_key or os.environ.get("API_KEY") or os.environ.get("SARVAM_API_KEY")
    if not key:
        raise RuntimeError("Sarvam API key not found. Set API_KEY in .env")
    return SarvamAI(api_subscription_key=key)


def speak(client: SarvamAI, text: str, language: str = "hi-IN",
          speaker: str = "priya", pace: float = 0.95) -> bytes:
    """Synthesize speech with Bulbul v3. Returns WAV/audio bytes."""
    response = client.text_to_speech.convert(
        text=text[:2400],
        target_language_code=language,
        model="bulbul:v3",
        speaker=speaker,
        pace=pace,
        speech_sample_rate=24000,
    )
    # SDK returns an object with .audios (list of base64 strings).
    audios = getattr(response, "audios", None)
    if audios:
        return b"".join(base64.b64decode(chunk) for chunk in audios)
    # Fallback if the SDK already decoded.
    if hasattr(response, "audio"):
        audio = response.audio
        return audio if isinstance(audio, (bytes, bytearray)) else base64.b64decode(audio)
    raise RuntimeError("Unexpected TTS response shape — no audios field")


def transcribe(client: SarvamAI, audio_bytes: bytes, suffix: str = ".wav",
               mode: str = "codemix") -> dict:
    """Transcribe citizen speech with Saaras v3.

    mode='codemix' is the right default for Suvidha desks — citizens mix
    Hindi and English freely ("mera naam Mohammed Irfan hai, mobile number...").
    """
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        path = tmp.name
    try:
        with open(path, "rb") as f:
            response = client.speech_to_text.transcribe(
                file=f,
                model="saaras:v3",
                mode=mode,
            )
    finally:
        Path(path).unlink(missing_ok=True)

    return {
        "transcript": getattr(response, "transcript", "") or "",
        "language_code": getattr(response, "language_code", None),
        "language_probability": getattr(response, "language_probability", None),
    }


# Spoken confirmations — keep these short; Saaras will hear "haan"/"nahi"/"yes"/"no".
YES_WORDS = {
    "haan", "ha", "han", "hanji", "haaji", "ji", "yes", "yeah", "yup", "ok", "okay",
    "sahi", "theek", "thik", "correct", "bilkul", "right", "confirmed",
}
NO_WORDS = {
    "nahi", "nahin", "na", "no", "nope", "galat", "wrong", "change", "incorrect",
    "dobara", "again", "repeat",
}


def parse_yes_no(transcript: str) -> str | None:
    """Return 'yes', 'no', or None if unclear."""
    tokens = set(transcript.lower().replace(",", " ").replace(".", " ").split())
    if tokens & YES_WORDS and not (tokens & NO_WORDS):
        return "yes"
    if tokens & NO_WORDS:
        return "no"
    return None
