"""SQLite auth + desk case store for Memory & Context (operator sessions)."""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "identitygraph.db"

SESSION_DAYS = 14

# Demo CSC operators — password is hashed on seed (not stored plain).
SEED_USERS = [
    {
        "email": "operator@csc.demo",
        "name": "Ramesh Patil",
        "password": "desk123",
        "role": "OPERATOR",
        "csc_name": "CSC Aurangabad N-4",
    },
    {
        "email": "admin@csc.demo",
        "name": "Desk Admin",
        "password": "admin123",
        "role": "ADMIN",
        "csc_name": "IdentityGraph HQ",
    },
]


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    )
    return f"{salt}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(_hash_password(password, salt), stored)


def init_db() -> None:
    conn = _connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              email TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'OPERATOR',
              csc_name TEXT,
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expires_at REAL NOT NULL,
              created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
            CREATE TABLE IF NOT EXISTS desk_cases (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              service_id TEXT,
              citizen_label TEXT,
              step INTEGER NOT NULL DEFAULT 0,
              answers TEXT NOT NULL DEFAULT '{}',
              extractions TEXT NOT NULL DEFAULT '[]',
              verify_result TEXT,
              notes TEXT NOT NULL DEFAULT '',
              form_reviewed INTEGER NOT NULL DEFAULT 0,
              ocr_reviewed INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'draft',
              created_at REAL NOT NULL,
              updated_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_cases_user_updated
              ON desk_cases(user_id, updated_at DESC);
            """
        )
        now = time.time()
        for u in SEED_USERS:
            existing = conn.execute(
                "SELECT id FROM users WHERE email = ?", (u["email"],)
            ).fetchone()
            if existing:
                continue
            conn.execute(
                """
                INSERT INTO users (id, email, name, password_hash, role, csc_name, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    secrets.token_urlsafe(12),
                    u["email"],
                    u["name"],
                    _hash_password(u["password"]),
                    u["role"],
                    u["csc_name"],
                    now,
                ),
            )
        conn.commit()
    finally:
        conn.close()


def _user_public(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "csc_name": row["csc_name"],
    }


def login(email: str, password: str) -> dict[str, Any] | None:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
        ).fetchone()
        if not row or not _verify_password(password, row["password_hash"]):
            return None
        token = secrets.token_urlsafe(32)
        now = time.time()
        expires = now + SESSION_DAYS * 86400
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (token, row["id"], expires, now),
        )
        conn.commit()
        return {"token": token, "expires_at": expires, "user": _user_public(row)}
    finally:
        conn.close()


def logout(token: str | None) -> None:
    if not token:
        return
    conn = _connect()
    try:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    finally:
        conn.close()


def user_from_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    conn = _connect()
    try:
        now = time.time()
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
        row = conn.execute(
            """
            SELECT u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at >= ?
            """,
            (token, now),
        ).fetchone()
        conn.commit()
        return _user_public(row) if row else None
    finally:
        conn.close()


def _case_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "service_id": row["service_id"],
        "citizen_label": row["citizen_label"],
        "step": row["step"],
        "answers": json.loads(row["answers"] or "{}"),
        "extractions": json.loads(row["extractions"] or "[]"),
        "verify_result": json.loads(row["verify_result"])
        if row["verify_result"]
        else None,
        "notes": row["notes"] or "",
        "form_reviewed": bool(row["form_reviewed"]),
        "ocr_reviewed": bool(row["ocr_reviewed"]),
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_cases(user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT * FROM desk_cases
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
        return [_case_row(r) for r in rows]
    finally:
        conn.close()


def get_case(user_id: str, case_id: str) -> dict[str, Any] | None:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT * FROM desk_cases WHERE id = ? AND user_id = ?",
            (case_id, user_id),
        ).fetchone()
        return _case_row(row) if row else None
    finally:
        conn.close()


def create_case(user_id: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    conn = _connect()
    try:
        now = time.time()
        case_id = secrets.token_urlsafe(12)
        conn.execute(
            """
            INSERT INTO desk_cases (
              id, user_id, service_id, citizen_label, step, answers, extractions,
              verify_result, notes, form_reviewed, ocr_reviewed, status,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                user_id,
                payload.get("service_id"),
                payload.get("citizen_label"),
                int(payload.get("step") or 0),
                json.dumps(payload.get("answers") or {}),
                json.dumps(payload.get("extractions") or []),
                json.dumps(payload["verify_result"])
                if payload.get("verify_result") is not None
                else None,
                payload.get("notes") or "",
                1 if payload.get("form_reviewed") else 0,
                1 if payload.get("ocr_reviewed") else 0,
                payload.get("status") or "draft",
                now,
                now,
            ),
        )
        conn.commit()
        return get_case(user_id, case_id)  # type: ignore[return-value]
    finally:
        conn.close()


def update_case(
    user_id: str, case_id: str, payload: dict[str, Any]
) -> dict[str, Any] | None:
    existing = get_case(user_id, case_id)
    if not existing:
        return None
    merged = {**existing, **payload, "id": case_id, "user_id": user_id}
    conn = _connect()
    try:
        now = time.time()
        conn.execute(
            """
            UPDATE desk_cases SET
              service_id = ?, citizen_label = ?, step = ?, answers = ?,
              extractions = ?, verify_result = ?, notes = ?,
              form_reviewed = ?, ocr_reviewed = ?, status = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                merged.get("service_id"),
                merged.get("citizen_label"),
                int(merged.get("step") or 0),
                json.dumps(merged.get("answers") or {}),
                json.dumps(merged.get("extractions") or []),
                json.dumps(merged["verify_result"])
                if merged.get("verify_result") is not None
                else None,
                merged.get("notes") or "",
                1 if merged.get("form_reviewed") else 0,
                1 if merged.get("ocr_reviewed") else 0,
                merged.get("status") or "draft",
                now,
                case_id,
                user_id,
            ),
        )
        conn.commit()
        return get_case(user_id, case_id)
    finally:
        conn.close()
