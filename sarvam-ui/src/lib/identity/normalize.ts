/** Indic-aware name normalization for variant vs blocker classification. */

const HONORIFICS = /\b(mr|mrs|ms|shri|smt|dr|prof)\b\.?/gi;

const NAME_ALIASES: Record<string, string> = {
  mohd: "mohammed",
  moh: "mohammed",
  md: "mohammed",
  muhammad: "mohammed",
  mohammad: "mohammed",
  kumar: "kumar",
  kmr: "kumar",
  ram: "ram",
  rama: "ram",
  rehman: "rahman",
  rahmaan: "rahman",
  shaikh: "shaikh",
  sheikh: "shaikh",
  shaik: "shaikh",
  shekh: "shaikh",
};

/** Collapse whitespace, strip honorifics, lowercase Latin. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(HONORIFICS, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((token) => NAME_ALIASES[token] ?? token)
    .join(" ");
}

/** Digits-only DOB key — year mismatch is always a blocker signal. */
export function normalizeDob(raw: string): { key: string; year: string | null } {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    // DDMMYYYY or YYYYMMDD heuristic
    const asYmd = digits.slice(0, 4);
    const year =
      Number(asYmd) > 1900 && Number(asYmd) < 2100
        ? asYmd
        : digits.slice(4, 8);
    return { key: digits, year };
  }
  const yearMatch = raw.match(/(19|20)\d{2}/);
  return { key: digits || raw.toLowerCase().trim(), year: yearMatch?.[0] ?? null };
}

export function namesAreVariant(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // One is a proper prefix/subset of tokens (Mohd Aslam vs Mohammed Aslam Khan)
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const overlap = [...ta].filter((t) => tb.has(t)).length;
  const min = Math.min(ta.size, tb.size);
  return min > 0 && overlap / min >= 0.66;
}
