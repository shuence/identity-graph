export type ServiceField = {
  key: string;
  label: string;
  high_stakes?: boolean;
  prompt_hi?: string;
  prompt_en?: string;
  compare_to?: string | null;
  compare_doc?: string;
};

export type Service = {
  id: string;
  title: string;
  tagline: string;
  why: string;
  required_docs: string[];
  optional_docs: string[];
  portal: { name: string; url: string };
  form_fields: ServiceField[];
};

export type Extraction = {
  doc_type: string;
  source_file?: string;
  language?: string;
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

export function fetchServices() {
  return api<Service[]>("/services");
}

export function fetchService(id: string) {
  return api<Service>(`/services/${id}`);
}

export function fetchDemo(serviceId: string) {
  return api<{
    service_id: string;
    form_answers: Record<string, string>;
    extractions: Extraction[];
  }>(`/demo/${serviceId}`);
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

export function mapStatus(
  status: FormCheck["status"] | Comparison["status"]
): "match" | "variant" | "blocker" | "uncertain" {
  if (status === "MATCH") return "match";
  if (status === "VARIANT") return "variant";
  if (status === "CRITICAL") return "blocker";
  return "uncertain";
}
