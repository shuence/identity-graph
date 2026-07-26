export type ServiceField = {
  key: string;
  label: string;
  high_stakes?: boolean;
  prompt_hi?: string;
  prompt_en?: string;
  compare_to?: string | null;
  compare_doc?: string;
  operator_tip?: string;
};

export type OperatorPack = {
  process_summary: string;
  operator_checklist: string[];
  rejection_reasons: string[];
  required_docs: string[];
  recommended_docs: string[];
  category: string;
};

export type Service = {
  id: string;
  title: string;
  category?: string;
  fill_mode?: string;
  official_form?: string;
  source_url?: string;
  tagline: string;
  why: string;
  required_docs: string[];
  optional_docs: string[];
  portal: { name: string; url: string };
  form_fields: ServiceField[];
  operator?: OperatorPack;
  positioning?: {
    audience?: string;
    stack?: string;
    hackathon?: string;
  };
};

export type Extraction = {
  doc_type: string;
  source_file?: string;
  language?: string;
  handwritten?: boolean;
  ocr_text?: string;
  fields: Record<string, string>;
};

export type FormCheck = {
  form_key: string;
  label: string;
  form_value: string;
  doc_type: string | null;
  doc_value: string | null;
  status: "MATCH" | "VARIANT" | "CRITICAL" | "UNCERTAIN";
  detail: string;
  high_stakes: boolean;
  other_sources?: string[];
};

export type Comparison = {
  field: string;
  doc_a: string;
  doc_b: string;
  value_a: string;
  value_b: string;
  status: "MATCH" | "VARIANT" | "CRITICAL" | "UNCERTAIN";
  detail: string;
};

export type VerifyResult = {
  service: { id: string; title: string; portal: { name: string; url: string } };
  form_verification: {
    checks: FormCheck[];
    approved_fields: Record<string, string>;
    all_checks: FormCheck[];
    ready_for_portal?: boolean;
  };
  cross_document: {
    comparisons: Comparison[];
    primary_blocker_doc: string | null;
    blocker_counts: Record<string, number>;
    summary: {
      matches: number;
      variants: number;
      blockers: number;
      uncertain: number;
    };
  };
  knowledge: {
    service_id: string;
    score: number;
    grade: string;
    field_issues: { field_key: string; severity: string; message: string }[];
    missing_docs: string[];
    rejection_risks: string[];
    checklist: string[];
    process_summary: string;
  };
  remediation: {
    primary_doc: string | null;
    blocker_count: number;
    portal_name: string;
    portal_url: string;
    how: string;
  } | null;
  ready_for_portal: boolean;
};

export type Meta = {
  doc_types: string[];
  field_labels: Record<string, string>;
  languages: Record<string, string>;
  sarvam_configured?: boolean;
  sarvam_key_loaded?: boolean;
};

export type FormExtractResult = {
  service_id: string;
  source_file: string;
  language: string;
  ocr_text?: string;
  form_answers: Record<string, string>;
  needs_review?: boolean;
  error?: string;
};

export type DocumentExtractResult = {
  service_id: string;
  extractions: Extraction[];
  failures: { file: string; doc_type: string; error: string }[];
  message?: string;
};

export type UploadSlot = {
  id: string;
  file: File;
  docType: string;
  language: string;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
};

const BASE = process.env.NEXT_PUBLIC_API_BASE || "/api/backend";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function multipart<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; error?: string };
      if (typeof parsed.detail === "string") message = parsed.detail;
      else if (parsed.error) message = parsed.error;
    } catch {
      /* keep raw text */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function fetchServices() {
  return api<Service[]>("/services");
}

export function fetchService(id: string) {
  return api<Service>(`/services/${id}`);
}

export function fetchMeta() {
  return api<Meta>("/meta");
}

export function fetchDemo(serviceId: string, citizen?: string) {
  const q = citizen ? `?citizen=${encodeURIComponent(citizen)}` : "";
  return api<{
    service_id: string;
    form_answers: Record<string, string>;
    extractions: Extraction[];
    citizen?: string;
  }>(`/demo/${serviceId}${q}`);
}

export function verifyCase(body: {
  service_id: string;
  form_answers: Record<string, string>;
  extractions: Extraction[];
  operator_notes?: string;
}) {
  return api<VerifyResult>("/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchHealth() {
  return api<{
    ok: boolean;
    mode?: string;
    sarvam_key_loaded?: boolean;
    sarvam_configured?: boolean;
    engine?: string;
  }>("/health");
}

/** Live Sarvam Vision + 30B OCR via POST /extract (handwritten-aware). */
export async function extractDocuments(input: {
  files: File[];
  docTypes: string[];
  handwritten?: boolean[];
  language?: string;
}) {
  const form = new FormData();
  input.files.forEach((f) => form.append("files", f));
  form.append("doc_types", JSON.stringify(input.docTypes));
  form.append(
    "handwritten",
    JSON.stringify(input.handwritten ?? input.files.map(() => false))
  );
  form.append("language", input.language || "en-IN");
  const res = await fetch(`${BASE}/extract`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Extract failed (${res.status})`);
  }
  return res.json() as Promise<{
    extractions: Extraction[];
    failures: { file?: string; doc_type?: string; error: string }[];
    engine?: string;
  }>;
}

/** Scanned application form OCR via POST /extract/form. */
export function extractForm(opts: {
  serviceId: string;
  file: File;
  language?: string;
}) {
  const form = new FormData();
  form.append("service_id", opts.serviceId);
  form.append("file", opts.file);
  form.append("language", opts.language || "en-IN");
  return multipart<FormExtractResult>("/extract/form", form);
}

export async function speakPrompt(text: string, language = "hi-IN") {
  const res = await fetch(`${BASE}/voice/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw new Error(`TTS failed (${res.status})`);
  return res.blob();
}

export async function transcribeAudio(file: Blob, mode = "codemix") {
  const form = new FormData();
  form.append("file", file, "answer.webm");
  form.append("mode", mode);
  const res = await fetch(`${BASE}/voice/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`STT failed (${res.status})`);
  return res.json() as Promise<{ transcript: string; language_code?: string }>;
}

export async function downloadPack(
  kind: "form" | "audit",
  body: {
    service_id: string;
    form_answers: Record<string, string>;
    extractions: Extraction[];
    operator_notes?: string;
  }
) {
  const res = await fetch(`${BASE}/pack/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Pack download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = kind === "form" ? "filled-form.pdf" : "identity-audit.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

export function guessDocType(filename: string, preferred: string[]): string {
  const name = filename.toLowerCase().replace(/\s+/g, "");
  const rules: [string[], string][] = [
    [["pan"], "PAN Card"],
    [["aadhaar", "adhar", "aadhar"], "Aadhaar Card"],
    [["passbook", "bank", "statement"], "Bank Passbook"],
    [["voter", "epic"], "Voter ID"],
    [["ration"], "Ration Card"],
    [["dl", "licence", "license", "driving"], "Driving License"],
    [["passport"], "Passport"],
  ];
  for (const [keys, doc] of rules) {
    if (keys.some((k) => name.includes(k))) return doc;
  }
  return preferred[0] || "Other";
}

export function mapStatus(
  status: FormCheck["status"] | Comparison["status"]
): "match" | "variant" | "blocker" | "uncertain" {
  if (status === "MATCH") return "match";
  if (status === "VARIANT") return "variant";
  if (status === "CRITICAL") return "blocker";
  return "uncertain";
}
