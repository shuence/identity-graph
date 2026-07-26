"""Reconciliation engine: cross-document field comparison and mismatch classification.

This is the product's own logic — no API calls. Every pair of documents is compared
field by field and each comparison is classified as one of:

  MATCH      identical after normalization
  VARIANT    harmless transliteration/spelling/format variant (won't block an application)
  CRITICAL   a real mismatch that will get an application rejected
  UNCERTAIN  one side was unreadable/absent — needs human review, never silently counted
"""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field

from dateutil import parser as dateparser

from .config import FIELDS

try:
    import jellyfish as _jellyfish

    def jaro_winkler_similarity(a: str, b: str) -> float:
        return _jellyfish.jaro_winkler_similarity(a, b)
except Exception:  # native wheel blocked / missing — pure-Python fallback
    def jaro_winkler_similarity(a: str, b: str) -> float:
        """Compact Jaro-Winkler (good enough for Indic name tokens)."""
        if a == b:
            return 1.0
        if not a or not b:
            return 0.0
        la, lb = len(a), len(b)
        match_dist = max(la, lb) // 2 - 1
        if match_dist < 0:
            match_dist = 0
        a_flags = [False] * la
        b_flags = [False] * lb
        matches = 0
        transpositions = 0
        for i in range(la):
            start = max(0, i - match_dist)
            end = min(i + match_dist + 1, lb)
            for j in range(start, end):
                if b_flags[j] or a[i] != b[j]:
                    continue
                a_flags[i] = b_flags[j] = True
                matches += 1
                break
        if matches == 0:
            return 0.0
        k = 0
        for i in range(la):
            if not a_flags[i]:
                continue
            while not b_flags[k]:
                k += 1
            if a[i] != b[k]:
                transpositions += 1
            k += 1
        jaro = (
            matches / la
            + matches / lb
            + (matches - transpositions / 2) / matches
        ) / 3
        prefix = 0
        for i in range(min(4, la, lb)):
            if a[i] == b[i]:
                prefix += 1
            else:
                break
        return jaro + prefix * 0.1 * (1 - jaro)

MATCH = "MATCH"
VARIANT = "VARIANT"
CRITICAL = "CRITICAL"
UNCERTAIN = "UNCERTAIN"

# Honorifics and relation prefixes that carry no identity information.
HONORIFICS = {
    "shri", "sri", "smt", "shrimati", "kumari", "km", "dr", "mr", "mrs", "ms",
    "s/o", "d/o", "w/o", "son", "daughter", "wife", "of", "late", "lt",
}

# Common Indian transliteration equivalence groups. Each maps to a canonical form.
VARIANT_GROUPS = [
    {"mohd", "md", "mohammed", "mohammad", "muhammad", "muhammed", "mohamad", "mohamed"},
    {"ahmed", "ahmad", "ahemad", "ahamed"},
    {"rahim", "raheem", "rahym"},
    {"karim", "kareem"},
    {"sk", "shaikh", "sheikh", "shaik", "shekh"},
    {"kr", "kumar", "kumaar"},
    {"vijay", "vijai"},
    {"devi", "debi"},
    {"laxmi", "lakshmi", "laksmi"},
    {"ganesh", "ganesha"},
    {"krishna", "krishnan", "krsna"},
    {"sunita", "suneeta"},
    {"geeta", "gita"},
    {"seema", "sima"},
    {"deepak", "dipak", "dipack"},
    {"rajesh", "rajes"},
    {"vishwanath", "vishvanath", "biswanath", "vishwanathan"},
    {"srinivas", "shrinivas", "srinivasa"},
    {"chaudhary", "chowdhury", "choudhary", "chaudhry", "chaudhuri"},
    {"agarwal", "aggarwal", "agrawal"},
    {"bandyopadhyay", "banerjee", "bannerjee"},
    {"mukhopadhyay", "mukherjee", "mukherji"},
    {"chattopadhyay", "chatterjee", "chatterji"},
]

_VARIANT_CANON = {}
for group in VARIANT_GROUPS:
    # Deterministic canonical form: longest word, alphabetical tiebreak.
    canon = sorted(group, key=lambda w: (-len(w), w))[0]
    for word in group:
        _VARIANT_CANON[word] = canon

# Jaro-Winkler thresholds for per-token phonetic matching.
_TOKEN_VARIANT_THRESHOLD = 0.88


def _clean(value: str) -> str:
    return re.sub(r"[^\w\s]", " ", value.lower()).strip()


def _tokens(name: str) -> list[str]:
    words = _clean(name).split()
    out = []
    for w in words:
        if w in HONORIFICS:
            continue
        out.append(_VARIANT_CANON.get(w, w))
    return out


def is_uncertain(value: str | None) -> bool:
    return not value or value.strip().upper() in ("UNCERTAIN", "N/A", "NA", "")


@dataclass
class Comparison:
    field: str
    doc_a: str
    doc_b: str
    value_a: str
    value_b: str
    status: str
    detail: str = ""


def compare_names(a: str, b: str) -> tuple[str, str]:
    """Classify a pair of names. Returns (status, detail)."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return UNCERTAIN, "One name is empty after normalization"

    if ta == tb:
        if _clean(a).split() == _clean(b).split():
            return MATCH, "Identical"
        return VARIANT, "Same identity after honorific/transliteration normalization"

    # Allow initials: "R Kumar" vs "Rajesh Kumar" — an initial matches a token starting with it.
    if _initials_compatible(ta, tb):
        return VARIANT, "Initials expand to the same name"

    # Token-set comparison handles reordered names ("Kumar Rajesh" vs "Rajesh Kumar").
    if sorted(ta) == sorted(tb):
        return VARIANT, "Same tokens in different order"

    # Per-token phonetic matching for equal-length names.
    if len(ta) == len(tb):
        sims = [jaro_winkler_similarity(x, y) for x, y in zip(ta, tb)]
        if all(s >= _TOKEN_VARIANT_THRESHOLD for s in sims):
            return VARIANT, "Phonetically equivalent spelling variants"
        weak = [f"'{x}' vs '{y}'" for x, y, s in zip(ta, tb, sims) if s < _TOKEN_VARIANT_THRESHOLD]
        return CRITICAL, f"Name tokens differ: {', '.join(weak)}"

    # Different token counts: subset (missing middle name) is a variant; otherwise critical.
    small, big = (ta, tb) if len(ta) < len(tb) else (tb, ta)
    if _is_token_subset(small, big):
        return VARIANT, "One document omits a middle/last name component"
    return CRITICAL, f"Names do not resolve to the same identity: '{a}' vs '{b}'"


def _initials_compatible(ta: list[str], tb: list[str]) -> bool:
    if len(ta) != len(tb):
        return False
    for x, y in zip(ta, tb):
        if x == y:
            continue
        if len(x) == 1 and y.startswith(x):
            continue
        if len(y) == 1 and x.startswith(y):
            continue
        return False
    return True


def _is_token_subset(small: list[str], big: list[str]) -> bool:
    remaining = list(big)
    for tok in small:
        best, best_sim = None, 0.0
        for r in remaining:
            sim = jaro_winkler_similarity(tok, r)
            if sim > best_sim:
                best, best_sim = r, sim
        if best_sim < _TOKEN_VARIANT_THRESHOLD:
            return False
        remaining.remove(best)
    return True


def compare_dob(a: str, b: str) -> tuple[str, str]:
    try:
        da = dateparser.parse(a, dayfirst=True, fuzzy=True)
        db = dateparser.parse(b, dayfirst=True, fuzzy=True)
    except (ValueError, OverflowError):
        return UNCERTAIN, "Could not parse one of the dates"
    if da.date() == db.date():
        if a.strip() != b.strip():
            return VARIANT, "Same date, different format"
        return MATCH, "Identical"
    return CRITICAL, f"Dates of birth differ: {da.date().strftime('%d/%m/%Y')} vs {db.date().strftime('%d/%m/%Y')}"


_ADDRESS_STOPWORDS = {"near", "opp", "opposite", "at", "post", "po", "ps", "dist", "district",
                      "tal", "taluka", "teh", "tehsil", "village", "vill", "house", "no", "h"}


def compare_address(a: str, b: str) -> tuple[str, str]:
    sa = {w for w in _tokens(a) if w not in _ADDRESS_STOPWORDS and not w.isdigit()}
    sb = {w for w in _tokens(b) if w not in _ADDRESS_STOPWORDS and not w.isdigit()}
    if not sa or not sb:
        return UNCERTAIN, "One address is empty after normalization"
    overlap = len(sa & sb) / min(len(sa), len(sb))
    if overlap >= 0.8:
        return (MATCH, "Identical") if _clean(a) == _clean(b) else (VARIANT, "Same locality, formatting differs")
    if overlap >= 0.4:
        return VARIANT, "Partial overlap — likely same place described differently; verify manually"
    return CRITICAL, "Addresses appear to be different places"


def compare_id_number(a: str, b: str) -> tuple[str, str]:
    # Different documents legitimately have different ID numbers; only compare formatting-insensitively
    # when both docs are the same type (handled by caller). Cross-type comparisons are skipped upstream.
    na, nb = re.sub(r"\s", "", a).upper(), re.sub(r"\s", "", b).upper()
    if na == nb:
        return MATCH, "Identical"
    return CRITICAL, "ID numbers differ"


def compare_field(field_key: str, a: str, b: str) -> tuple[str, str]:
    if is_uncertain(a) or is_uncertain(b):
        return UNCERTAIN, "Field unreadable or absent on one document — flagged for manual review"
    if field_key in ("full_name", "father_name"):
        return compare_names(a, b)
    if field_key == "dob":
        return compare_dob(a, b)
    if field_key == "address":
        return compare_address(a, b)
    if field_key == "id_number":
        return compare_id_number(a, b)
    return (MATCH, "Identical") if _clean(a) == _clean(b) else (CRITICAL, "Values differ")


@dataclass
class ReconciliationResult:
    comparisons: list[Comparison] = field(default_factory=list)
    primary_blocker_doc: str | None = None
    blocker_counts: dict[str, int] = field(default_factory=dict)

    def by_field(self, field_key: str) -> list[Comparison]:
        return [c for c in self.comparisons if c.field == field_key]

    @property
    def critical(self) -> list[Comparison]:
        return [c for c in self.comparisons if c.status == CRITICAL]

    @property
    def uncertain(self) -> list[Comparison]:
        return [c for c in self.comparisons if c.status == UNCERTAIN]

    @property
    def variants(self) -> list[Comparison]:
        return [c for c in self.comparisons if c.status == VARIANT]


def reconcile(extractions: list[dict]) -> ReconciliationResult:
    """Compare every field across every pair of documents that both have a readable value.

    Missing fields (e.g. DOB absent on Bank Passbook) are skipped — they are not
    blockers. Only real disagreements between readable values are reported.
    """
    result = ReconciliationResult()
    for rec_a, rec_b in itertools.combinations(extractions, 2):
        for field_key, _label in FIELDS:
            # ID numbers only comparable between documents of the same type.
            if field_key == "id_number" and rec_a["doc_type"] != rec_b["doc_type"]:
                continue
            va = rec_a["fields"].get(field_key, "UNCERTAIN")
            vb = rec_b["fields"].get(field_key, "UNCERTAIN")
            # Skip absent/unreadable sides — Bank without DOB must not spam UNCERTAIN.
            if is_uncertain(va) or is_uncertain(vb):
                continue
            status, detail = compare_field(field_key, va, vb)
            result.comparisons.append(Comparison(
                field=field_key, doc_a=rec_a["doc_type"], doc_b=rec_b["doc_type"],
                value_a=va, value_b=vb, status=status, detail=detail,
            ))

    result.blocker_counts = _blocker_counts(result.critical, extractions)
    if result.blocker_counts:
        result.primary_blocker_doc = max(result.blocker_counts, key=result.blocker_counts.get)
    return result


def _blocker_counts(criticals: list[Comparison], extractions: list[dict]) -> dict[str, int]:
    """Attribute each critical mismatch to the document that deviates from the majority value."""
    counts: dict[str, int] = {}
    for comp in criticals:
        outlier = _find_outlier(comp, extractions)
        for doc in outlier:
            counts[doc] = counts.get(doc, 0) + 1
    return counts


def _find_outlier(comp: Comparison, extractions: list[dict]) -> list[str]:
    """For a critical mismatch, decide which side disagrees with the majority of documents."""
    votes_a = votes_b = 0
    for rec in extractions:
        val = rec["fields"].get(comp.field)
        if is_uncertain(val):
            continue
        status_a, _ = compare_field(comp.field, val, comp.value_a)
        status_b, _ = compare_field(comp.field, val, comp.value_b)
        if status_a in (MATCH, VARIANT):
            votes_a += 1
        if status_b in (MATCH, VARIANT):
            votes_b += 1
    if votes_a > votes_b:
        return [comp.doc_b]   # doc_b holds the minority value
    if votes_b > votes_a:
        return [comp.doc_a]
    return [comp.doc_a, comp.doc_b]  # tie — both need review
