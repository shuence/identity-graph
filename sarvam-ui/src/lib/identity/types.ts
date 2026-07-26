export type DocType =
  | "aadhaar"
  | "pan"
  | "voter"
  | "ration"
  | "bank"
  | "school";

export type FieldKey =
  | "full_name"
  | "father_name"
  | "dob"
  | "gender"
  | "address"
  | "id_number";

export type CellStatus = "match" | "variant" | "blocker" | "uncertain" | "missing";

export type BoundingBox = {
  x: number; // 0–100 %
  y: number;
  w: number;
  h: number;
};

export type ExtractedField = {
  value: string;
  statusHint?: "uncertain";
  bbox: BoundingBox;
  note?: string;
};

export type IdentityDocument = {
  id: string;
  type: DocType;
  label: string;
  issuer: string;
  scannedAt: string;
  fields: Partial<Record<FieldKey, ExtractedField>>;
};

export type MatrixCell = {
  field: FieldKey;
  docId: string;
  value: string;
  status: CellStatus;
  reason: string;
  bbox?: BoundingBox;
};

export type RemediationAction = {
  primaryDocId: string;
  primaryDocLabel: string;
  blockerCount: number;
  portalName: string;
  portalUrl: string;
  formHint: string;
  steps: string[];
};

export type IdentityCase = {
  id: string;
  subjectLabel: string;
  createdAt: string;
  documents: IdentityDocument[];
  matrix: MatrixCell[];
  remediation: RemediationAction;
  summary: {
    variants: number;
    blockers: number;
    uncertain: number;
    matches: number;
  };
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  full_name: "Full name",
  father_name: "Father's name",
  dob: "Date of birth",
  gender: "Gender",
  address: "Address",
  id_number: "ID number",
};

export const DOC_LABELS: Record<DocType, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN",
  voter: "Voter ID",
  ration: "Ration Card",
  bank: "Bank Passbook",
  school: "School Certificate",
};
