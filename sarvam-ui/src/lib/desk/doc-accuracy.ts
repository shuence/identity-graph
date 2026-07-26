import type { Comparison, Extraction, FormCheck } from "@/lib/api/identitygraph";

/** Fields we expect OCR to fill for each doc type (address absent on PAN is OK). */
const EXPECTED_FIELDS: Record<string, string[]> = {
  "Aadhaar Card": ["full_name", "dob", "address", "id_number"],
  "PAN Card": ["full_name", "father_name", "dob", "id_number"],
  "Driving License": ["full_name", "dob", "address", "id_number"],
  "Bank Passbook": ["full_name", "address", "id_number"],
  "Voter ID": ["full_name", "father_name", "address", "id_number"],
  "Passport": ["full_name", "dob", "address", "id_number"],
  "Ration Card": ["full_name", "address", "id_number"],
  "School Certificate": ["full_name", "father_name", "dob", "id_number"],
  "Scanned Application Form": [
    "full_name",
    "father_name",
    "dob",
    "address",
    "id_number",
  ],
};

const DEFAULT_EXPECTED = ["full_name", "dob", "address", "id_number"];

function isReadable(v: string | undefined): boolean {
  return Boolean(v && v.trim() && v.trim().toUpperCase() !== "UNCERTAIN");
}

function statusWeight(status: string): number {
  if (status === "MATCH") return 1;
  if (status === "VARIANT") return 0.85;
  if (status === "UNCERTAIN") return 0.35;
  if (status === "CRITICAL") return 0;
  return 0;
}

export type DocAccuracy = {
  docType: string;
  sourceFile?: string;
  handwritten?: boolean;
  /** Readable expected fields / expected fields */
  ocrPct: number;
  ocrReadable: number;
  ocrExpected: number;
  ocrUnsure: string[];
  /** Weighted agreement across comparisons + form checks that touch this doc */
  verifyPct: number | null;
  verifyTotal: number;
  match: number;
  variant: number;
  blocker: number;
  unsure: number;
  /** Blend: OCR fill + verify when verify exists */
  overallPct: number;
};

export function expectedFieldsFor(docType: string): string[] {
  return EXPECTED_FIELDS[docType] || DEFAULT_EXPECTED;
}

export function ocrDocAccuracy(doc: Extraction): Pick<
  DocAccuracy,
  "ocrPct" | "ocrReadable" | "ocrExpected" | "ocrUnsure"
> {
  const keys = expectedFieldsFor(doc.doc_type);
  const unsure: string[] = [];
  let readable = 0;
  for (const key of keys) {
    const val = doc.fields[key];
    if (isReadable(val)) readable += 1;
    else unsure.push(key);
  }
  const ocrExpected = keys.length || 1;
  return {
    ocrPct: Math.round((readable / ocrExpected) * 100),
    ocrReadable: readable,
    ocrExpected,
    ocrUnsure: unsure,
  };
}

export function verifyDocAccuracy(
  docType: string,
  comparisons: Comparison[],
  formChecks: FormCheck[]
): Pick<
  DocAccuracy,
  | "verifyPct"
  | "verifyTotal"
  | "match"
  | "variant"
  | "blocker"
  | "unsure"
> {
  const related = comparisons.filter(
    (c) => c.doc_a === docType || c.doc_b === docType
  );
  const formRelated = formChecks.filter((c) => c.doc_type === docType);

  let match = 0;
  let variant = 0;
  let blocker = 0;
  let unsure = 0;
  let weightSum = 0;
  let n = 0;

  for (const c of related) {
    n += 1;
    weightSum += statusWeight(c.status);
    if (c.status === "MATCH") match += 1;
    else if (c.status === "VARIANT") variant += 1;
    else if (c.status === "CRITICAL") blocker += 1;
    else unsure += 1;
  }
  for (const c of formRelated) {
    n += 1;
    weightSum += statusWeight(c.status);
    if (c.status === "MATCH") match += 1;
    else if (c.status === "VARIANT") variant += 1;
    else if (c.status === "CRITICAL") blocker += 1;
    else unsure += 1;
  }

  return {
    verifyPct: n > 0 ? Math.round((weightSum / n) * 100) : null,
    verifyTotal: n,
    match,
    variant,
    blocker,
    unsure,
  };
}

export function perDocAccuracy(
  extractions: Extraction[],
  comparisons: Comparison[] = [],
  formChecks: FormCheck[] = []
): DocAccuracy[] {
  return extractions.map((doc) => {
    const ocr = ocrDocAccuracy(doc);
    const verify = verifyDocAccuracy(
      doc.doc_type,
      comparisons,
      formChecks
    );
    const overallPct =
      verify.verifyPct == null
        ? ocr.ocrPct
        : Math.round(ocr.ocrPct * 0.4 + verify.verifyPct * 0.6);

    return {
      docType: doc.doc_type,
      sourceFile: doc.source_file,
      handwritten: doc.handwritten,
      ...ocr,
      ...verify,
      overallPct,
    };
  });
}

export function overallAccuracy(docs: DocAccuracy[]): number {
  if (!docs.length) return 0;
  return Math.round(
    docs.reduce((sum, d) => sum + d.overallPct, 0) / docs.length
  );
}
