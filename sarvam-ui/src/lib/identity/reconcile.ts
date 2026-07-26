import {
  type CellStatus,
  type FieldKey,
  type IdentityCase,
  type IdentityDocument,
  type MatrixCell,
  type RemediationAction,
  FIELD_LABELS,
} from "./types";
import { namesAreVariant, normalizeDob, normalizeName } from "./normalize";

const REMEDIATION_PORTALS: Record<
  string,
  { portalName: string; portalUrl: string; formHint: string }
> = {
  pan: {
    portalName: "NSDL / Protean e-Gov",
    portalUrl: "https://www.onlineservices.nsdl.com/paam/endUserRegisterContact.html",
    formHint: "Form 49A — correction request for name / DOB on PAN",
  },
  aadhaar: {
    portalName: "UIDAI myAadhaar",
    portalUrl: "https://myaadhaar.uidai.gov.in/",
    formHint: "Update Aadhaar online or at an enrolment centre",
  },
  voter: {
    portalName: "NVSP / voter portal",
    portalUrl: "https://www.nvsp.in/",
    formHint: "Form 8 — correction of electoral roll particulars",
  },
  bank: {
    portalName: "Bank branch / net banking KYC",
    portalUrl: "#",
    formHint: "Submit a KYC update with supporting ID proof",
  },
  ration: {
    portalName: "State food / PDS portal",
    portalUrl: "#",
    formHint: "Ration card member detail correction",
  },
  school: {
    portalName: "Issuing board / school",
    portalUrl: "#",
    formHint: "Apply for corrected certificate / duplicate marksheet",
  },
};

function classifyPair(
  field: FieldKey,
  a: string,
  b: string,
  uncertainA: boolean,
  uncertainB: boolean
): { status: CellStatus; reason: string } {
  if (uncertainA || uncertainB) {
    return {
      status: "uncertain",
      reason: "Obscured or unreadable text — flagged UNCERTAIN, not guessed.",
    };
  }
  if (!a || !b) {
    return { status: "missing", reason: "Field missing on one or more documents." };
  }

  if (field === "full_name" || field === "father_name") {
    if (normalizeName(a) === normalizeName(b)) {
      return {
        status: a.trim() === b.trim() ? "match" : "variant",
        reason:
          a.trim() === b.trim()
            ? "Exact match."
            : `Harmless transliteration / abbreviation variant (“${a}” ↔ “${b}”).`,
      };
    }
    if (namesAreVariant(a, b)) {
      return {
        status: "variant",
        reason: `Phonetic / Indic normalization treats these as the same person (“${a}” ↔ “${b}”).`,
      };
    }
    return {
      status: "blocker",
      reason: `Name mismatch that may fail KYC (“${a}” vs “${b}”).`,
    };
  }

  if (field === "dob") {
    const da = normalizeDob(a);
    const db = normalizeDob(b);
    if (da.year && db.year && da.year !== db.year) {
      return {
        status: "blocker",
        reason: `Critical DOB year mismatch (${da.year} vs ${db.year}).`,
      };
    }
    if (da.key === db.key || a.replace(/\s/g, "") === b.replace(/\s/g, "")) {
      return { status: "match", reason: "Date of birth aligns." };
    }
    // Same year, different formatting (12/03/1988 vs 12 March 1988)
    if (da.year && da.year === db.year) {
      return {
        status: "variant",
        reason: `Same DOB year with format variant (“${a}” ↔ “${b}”).`,
      };
    }
    return {
      status: "blocker",
      reason: `DOB values differ (“${a}” vs “${b}”).`,
    };
  }

  if (field === "gender") {
    const ga = a.trim().toLowerCase().replace(/\./g, "");
    const gb = b.trim().toLowerCase().replace(/\./g, "");
    const male = new Set(["m", "male", "पुरुष"]);
    const female = new Set(["f", "female", "महिला"]);
    if (
      (male.has(ga) && male.has(gb)) ||
      (female.has(ga) && female.has(gb)) ||
      ga === gb
    ) {
      return {
        status: ga === gb ? "match" : "variant",
        reason: "Gender codes align (M / Male normalization).",
      };
    }
    return {
      status: "blocker",
      reason: `Gender mismatch (“${a}” vs “${b}”).`,
    };
  }

  if (field === "address") {
    const ta = new Set(
      a
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !["the", "and", "road", "rd"].includes(t))
    );
    const tb = new Set(
      b
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !["the", "and", "road", "rd"].includes(t))
    );
    const overlap = [...ta].filter((t) => tb.has(t)).length;
    const min = Math.min(ta.size, tb.size) || 1;
    if (overlap / min >= 0.5) {
      return {
        status: "variant",
        reason: `Address is a harmless formatting / locality variant (“${a}” ↔ “${b}”).`,
      };
    }
    return {
      status: "blocker",
      reason: `Address mismatch that may fail KYC (“${a}” vs “${b}”).`,
    };
  }

  if (field === "id_number") {
    // Document numbers are not expected to match across document types.
    return {
      status: "match",
      reason: "Document-specific identifier — not cross-compared as a blocker.",
    };
  }

  if (a.trim().toLowerCase() === b.trim().toLowerCase()) {
    return { status: "match", reason: "Exact match." };
  }
  return {
    status: "blocker",
    reason: `Values differ (“${a}” vs “${b}”).`,
  };
}

/** Build matrix by comparing each field against the consensus / first reliable value. */
export function buildMatrix(documents: IdentityDocument[]): MatrixCell[] {
  const fields: FieldKey[] = [
    "full_name",
    "father_name",
    "dob",
    "gender",
    "address",
    "id_number",
  ];
  const cells: MatrixCell[] = [];

  for (const field of fields) {
    const present = documents
      .map((d) => ({ doc: d, field: d.fields[field] }))
      .filter((x) => x.field);

    if (present.length === 0) continue;

    // Canonical: prefer Aadhaar, else first non-uncertain
    const canonical =
      present.find((x) => x.doc.type === "aadhaar" && x.field?.statusHint !== "uncertain") ??
      present.find((x) => x.field?.statusHint !== "uncertain") ??
      present[0];

    for (const doc of documents) {
      const extracted = doc.fields[field];
      if (!extracted) {
        cells.push({
          field,
          docId: doc.id,
          value: "—",
          status: "missing",
          reason: `${FIELD_LABELS[field]} not found on ${doc.label}.`,
        });
        continue;
      }

      if (doc.id === canonical.doc.id) {
        cells.push({
          field,
          docId: doc.id,
          value: extracted.value,
          status: extracted.statusHint === "uncertain" ? "uncertain" : "match",
          reason:
            extracted.statusHint === "uncertain"
              ? extracted.note ?? "Unreadable region — UNCERTAIN."
              : "Reference value for this field.",
          bbox: extracted.bbox,
        });
        continue;
      }

      const { status, reason } = classifyPair(
        field,
        canonical.field!.value,
        extracted.value,
        canonical.field!.statusHint === "uncertain",
        extracted.statusHint === "uncertain"
      );

      cells.push({
        field,
        docId: doc.id,
        value: extracted.value,
        status,
        reason,
        bbox: extracted.bbox,
      });
    }
  }

  return cells;
}

export function summarize(matrix: MatrixCell[]) {
  return {
    matches: matrix.filter((c) => c.status === "match").length,
    variants: matrix.filter((c) => c.status === "variant").length,
    blockers: matrix.filter((c) => c.status === "blocker").length,
    uncertain: matrix.filter((c) => c.status === "uncertain").length,
  };
}

export function pickRemediation(
  documents: IdentityDocument[],
  matrix: MatrixCell[]
): RemediationAction {
  const blockerByDoc = new Map<string, number>();
  for (const cell of matrix) {
    if (cell.status !== "blocker") continue;
    blockerByDoc.set(cell.docId, (blockerByDoc.get(cell.docId) ?? 0) + 1);
  }

  let primaryDocId = documents[0]?.id ?? "";
  let max = -1;
  for (const [docId, count] of blockerByDoc) {
    if (count > max) {
      max = count;
      primaryDocId = docId;
    }
  }

  // Prefer PAN when name/DOB blockers involve it (common passport/KYC path)
  const pan = documents.find((d) => d.type === "pan");
  if (pan && (blockerByDoc.get(pan.id) ?? 0) > 0) {
    primaryDocId = pan.id;
    max = blockerByDoc.get(pan.id) ?? max;
  }

  const doc = documents.find((d) => d.id === primaryDocId) ?? documents[0];
  const portal = REMEDIATION_PORTALS[doc.type] ?? REMEDIATION_PORTALS.aadhaar;

  return {
    primaryDocId: doc.id,
    primaryDocLabel: doc.label,
    blockerCount: max < 0 ? 0 : max,
    portalName: portal.portalName,
    portalUrl: portal.portalUrl,
    formHint: portal.formHint,
    steps: [
      `Open ${portal.portalName} and start a correction for ${doc.label}.`,
      portal.formHint,
      "Upload a clear scan of your Aadhaar (or other supporting proof) as evidence.",
      "After the update reflects, re-run IdentityGraph to clear remaining blockers.",
    ],
  };
}

export function buildCase(
  id: string,
  subjectLabel: string,
  documents: IdentityDocument[]
): IdentityCase {
  const matrix = buildMatrix(documents);
  return {
    id,
    subjectLabel,
    createdAt: new Date().toISOString(),
    documents,
    matrix,
    remediation: pickRemediation(documents, matrix),
    summary: summarize(matrix),
  };
}
