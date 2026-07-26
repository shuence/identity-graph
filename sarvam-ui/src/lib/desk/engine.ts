import { namesAreVariant, normalizeDob, normalizeName } from "@/lib/identity/normalize";
import type {
  Comparison,
  Extraction,
  FormCheck,
  Service,
  VerifyResult,
} from "@/lib/api/identitygraph";

type Status = FormCheck["status"];

const REMEDIATION: Record<string, { portal: string; url: string; how: string }> = {
  "Aadhaar Card": {
    portal: "UIDAI Self Service Update Portal (SSUP)",
    url: "https://myaadhaar.uidai.gov.in",
    how: "Online update for name/DOB/address with a supporting document, or visit any Aadhaar Seva Kendra.",
  },
  "PAN Card": {
    portal: "Protean (NSDL) PAN correction — Form 49A",
    url: "https://www.protean-tinpan.com",
    how: "File the online correction form with signed proof. Fix Aadhaar first if it is the source of truth.",
  },
  "Bank Passbook": {
    portal: "Home branch KYC update",
    url: "",
    how: "Submit a KYC modification form at the home branch with corrected Aadhaar/PAN.",
  },
  "Driving License": {
    portal: "Parivahan Sarathi portal",
    url: "https://sarathi.parivahan.gov.in",
    how: "Apply for change of name/DOB/address in DL with supporting documents.",
  },
  Other: {
    portal: "Issuing authority of the document",
    url: "",
    how: "Contact the issuing office with corrected primary documents.",
  },
};

function uncertain(v: string | null | undefined) {
  return !v || ["UNCERTAIN", "N/A", "NA", "—", "-"].includes(v.trim().toUpperCase());
}

function compareField(field: string, a: string, b: string): { status: Status; detail: string } {
  if (uncertain(a) || uncertain(b)) {
    return {
      status: "UNCERTAIN",
      detail: "Field unreadable or absent on one document — flagged for manual review",
    };
  }
  if (field === "full_name" || field === "father_name") {
    if (normalizeName(a) === normalizeName(b)) {
      return a.trim() === b.trim()
        ? { status: "MATCH", detail: "Identical" }
        : {
            status: "VARIANT",
            detail: "Same identity after honorific/transliteration normalization",
          };
    }
    if (namesAreVariant(a, b)) {
      return {
        status: "VARIANT",
        detail: "Phonetic / Indic normalization treats these as the same person",
      };
    }
    return { status: "CRITICAL", detail: `Names differ (“${a}” vs “${b}”)` };
  }
  if (field === "dob") {
    const da = normalizeDob(a);
    const db = normalizeDob(b);
    if (da.year && db.year && da.year !== db.year) {
      return {
        status: "CRITICAL",
        detail: `Critical DOB year mismatch (${da.year} vs ${db.year})`,
      };
    }
    if (da.key === db.key || da.year === db.year) {
      return a.replace(/\D/g, "") === b.replace(/\D/g, "")
        ? { status: "MATCH", detail: "Date of birth aligns" }
        : { status: "VARIANT", detail: "Same DOB with format variant" };
    }
    return { status: "CRITICAL", detail: `DOB values differ (“${a}” vs “${b}”)` };
  }
  if (field === "address") {
    const ta = new Set(
      a
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
    const tb = new Set(
      b
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
    const overlap = [...ta].filter((t) => tb.has(t)).length;
    const min = Math.min(ta.size, tb.size) || 1;
    if (overlap / min >= 0.5) {
      return { status: "VARIANT", detail: "Address is a harmless formatting variant" };
    }
    return { status: "CRITICAL", detail: "Address mismatch" };
  }
  if (field === "id_number") {
    const na = a.replace(/\s/g, "");
    const nb = b.replace(/\s/g, "");
    if (na === nb) return { status: "MATCH", detail: "Identical ID" };
    return { status: "CRITICAL", detail: "ID numbers differ" };
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase()
    ? { status: "MATCH", detail: "Identical" }
    : { status: "CRITICAL", detail: "Values differ" };
}

function formChecks(service: Service, answers: Record<string, string>, docs: Extraction[]) {
  const byType = Object.fromEntries(docs.map((d) => [d.doc_type, d]));
  const checks: FormCheck[] = [];

  for (const spec of service.form_fields) {
    if (!spec.compare_to) continue;
    const formVal = (answers[spec.key] || "").trim();
    const prefer = spec.compare_doc;
    const candidates = prefer && byType[prefer]
      ? [byType[prefer], ...docs.filter((d) => d.doc_type !== prefer)]
      : docs;

    let best: FormCheck | null = null;
    for (const doc of candidates) {
      const docVal = doc.fields[spec.compare_to] || "";
      if (uncertain(docVal) && candidates.length > 1) continue;
      const { status, detail } = compareField(spec.compare_to, formVal, docVal);
      const check: FormCheck = {
        form_key: spec.key,
        label: spec.label,
        form_value: formVal,
        doc_type: doc.doc_type,
        doc_value: docVal || null,
        status,
        detail,
        high_stakes: !!spec.high_stakes,
      };
      if (!best || rank(status) > rank(best.status)) best = check;
      if (status === "MATCH" || status === "VARIANT") break;
    }
    checks.push(
      best || {
        form_key: spec.key,
        label: spec.label,
        form_value: formVal,
        doc_type: null,
        doc_value: null,
        status: "UNCERTAIN",
        detail: "No readable document value for comparison",
        high_stakes: !!spec.high_stakes,
      }
    );
  }
  return checks;
}

function rank(s: Status) {
  return { MATCH: 4, VARIANT: 3, UNCERTAIN: 2, CRITICAL: 1 }[s];
}

function crossCompare(docs: Extraction[]) {
  const fields = ["full_name", "father_name", "dob", "address"] as const;
  const comparisons: Comparison[] = [];
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i];
      const b = docs[j];
      for (const field of fields) {
        const va = a.fields[field] || "UNCERTAIN";
        const vb = b.fields[field] || "UNCERTAIN";
        const { status, detail } = compareField(field, va, vb);
        comparisons.push({
          field,
          doc_a: a.doc_type,
          doc_b: b.doc_type,
          value_a: va,
          value_b: vb,
          status,
          detail,
        });
      }
    }
  }

  const blockerCounts: Record<string, number> = {};
  for (const c of comparisons.filter((x) => x.status === "CRITICAL")) {
    // Prefer attributing to the non-Aadhaar side when Aadhaar is involved.
    const outlier =
      c.doc_a.includes("Aadhaar") ? c.doc_b : c.doc_b.includes("Aadhaar") ? c.doc_a : c.doc_b;
    blockerCounts[outlier] = (blockerCounts[outlier] || 0) + 1;
  }
  const primary =
    Object.keys(blockerCounts).sort((a, b) => blockerCounts[b] - blockerCounts[a])[0] ||
    null;

  return { comparisons, blockerCounts, primary };
}

export function verifyDesk(input: {
  service: Service;
  form_answers: Record<string, string>;
  extractions: Extraction[];
}): VerifyResult {
  const { service, form_answers, extractions } = input;
  const checks = formChecks(service, form_answers, extractions);
  const cross = crossCompare(extractions);

  const statuses = Object.fromEntries(checks.map((c) => [c.form_key, c.status]));
  const ranks: Record<string, number> = {
    MATCH: 1,
    VARIANT: 0.85,
    UNCERTAIN: 0.4,
    CRITICAL: 0,
  };
  const matchVals = Object.values(statuses).map((s) => ranks[s] ?? 0.5);
  const matchScore = matchVals.length
    ? matchVals.reduce((a, b) => a + b, 0) / matchVals.length
    : 0.5;
  const missing = service.required_docs.filter(
    (d) => !extractions.some((e) => e.doc_type === d)
  );
  const complete =
    service.form_fields.filter((f) => (form_answers[f.key] || "").trim()).length /
    service.form_fields.length;
  const docsScore = service.required_docs.length
    ? 1 - missing.length / service.required_docs.length
    : 1;
  const score = Math.round(
    100 * (0.35 * matchScore + 0.2 * docsScore + 0.35 * matchScore + 0.1 * complete)
  );
  const hasFail = checks.some((c) => c.status === "CRITICAL") || missing.length > 0;
  const hasWarn = checks.some((c) => c.status === "UNCERTAIN");
  const grade = hasFail
    ? score < 60
      ? "BLOCKED"
      : "FIX_REQUIRED"
    : hasWarn
      ? score < 85
        ? "FIX_REQUIRED"
        : "READY"
      : score >= 80
        ? "READY"
        : "FIX_REQUIRED";

  const remDoc = cross.primary;
  const portal = remDoc
    ? REMEDIATION[remDoc] || REMEDIATION.Other
    : {
        portal: service.portal.name,
        url: service.portal.url,
        how: "No critical cross-document blockers. Proceed after operator review.",
      };

  return {
    service: {
      id: service.id,
      title: service.title,
      portal: service.portal,
    },
    form_verification: {
      checks,
      approved_fields: form_answers,
      all_checks: checks,
    },
    cross_document: {
      comparisons: cross.comparisons,
      primary_blocker_doc: remDoc,
      blocker_counts: cross.blockerCounts,
      summary: {
        matches: cross.comparisons.filter((c) => c.status === "MATCH").length,
        variants: cross.comparisons.filter((c) => c.status === "VARIANT").length,
        blockers: cross.comparisons.filter((c) => c.status === "CRITICAL").length,
        uncertain: cross.comparisons.filter((c) => c.status === "UNCERTAIN").length,
      },
    },
    knowledge: {
      service_id: service.id,
      score,
      grade,
      field_issues: checks
        .filter((c) => c.status === "CRITICAL" || c.status === "UNCERTAIN")
        .map((c) => ({
          field_key: c.form_key,
          severity: c.status === "CRITICAL" ? "FAIL" : "WARN",
          message: c.detail,
        })),
      missing_docs: missing,
      rejection_risks: [
        ...(missing.length ? [`Missing required documents: ${missing.join(", ")}`] : []),
        ...checks
          .filter((c) => c.status === "CRITICAL")
          .map((c) => `${c.label}: form conflicts with ${c.doc_type}`),
      ],
      checklist: [
        "Confirm citizen identity verbally",
        "Review UNCERTAIN fields on original scans",
        "Download filled form + audit pack",
        "Upload to portal",
      ],
      process_summary:
        "Form answers verified against supporting documents using IdentityGraph reconciliation (Sarvam_AI engine parity).",
    },
    remediation: {
      primary_doc: remDoc,
      blocker_count: remDoc ? cross.blockerCounts[remDoc] || 0 : 0,
      portal_name: portal.portal,
      portal_url: portal.url,
      how: portal.how,
    },
    ready_for_portal: grade === "READY" && !hasFail,
  };
}

/** Minimal text PDF (no native deps). */
export function textPdf(title: string, lines: string[]): Uint8Array {
  const contentLines = [title, "", ...lines]
    .slice(0, 48)
    .map((l) => l.replace(/[^\x20-\x7E]/g, "?").replace(/[\\()]/g, ""));
  const cmds = ["BT", "/F1 10 Tf", "40 770 Td", "12 TL"];
  for (const line of contentLines) {
    cmds.push(`(${line.slice(0, 95)}) Tj`, "T*");
  }
  cmds.push("ET");
  const stream = cmds.join("\n");
  const encoder = new TextEncoder();
  const parts = [
    encoder.encode("%PDF-1.4\n"),
    encoder.encode("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"),
    encoder.encode("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n"),
    encoder.encode(
      "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
    ),
    encoder.encode(
      `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`
    ),
    encoder.encode(
      "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
    ),
  ];
  const offsets: number[] = [];
  let pos = 0;
  for (const p of parts) {
    offsets.push(pos);
    pos += p.length;
  }
  let xref = `xref\n0 ${parts.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < parts.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer<< /Size ${parts.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`;
  const out = new Uint8Array(pos + encoder.encode(xref).length);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  out.set(encoder.encode(xref), o);
  return out;
}
