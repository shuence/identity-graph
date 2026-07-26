export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  csc_name?: string | null;
};

export type DeskCase = {
  id: string;
  service_id?: string | null;
  citizen_label?: string | null;
  step: number;
  answers: Record<string, string>;
  extractions: unknown[];
  verify_result?: unknown;
  notes: string;
  form_reviewed: boolean;
  ocr_reviewed: boolean;
  status: string;
  updated_at: number;
};

async function parseError(res: Response) {
  const data = await res.json().catch(() => ({}));
  const detail = data.detail || data.error;
  return typeof detail === "string" ? detail : `Request failed (${res.status})`;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user || null;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function listCases(): Promise<DeskCase[]> {
  const res = await fetch("/api/backend/cases", { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.cases || [];
}

export async function createCase(
  payload: Partial<DeskCase> = {}
): Promise<DeskCase> {
  const res = await fetch("/api/backend/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: payload.service_id,
      citizen_label: payload.citizen_label,
      step: payload.step ?? 0,
      answers: payload.answers ?? {},
      extractions: payload.extractions ?? [],
      notes: payload.notes ?? "",
      form_reviewed: payload.form_reviewed ?? false,
      ocr_reviewed: payload.ocr_reviewed ?? false,
      status: payload.status ?? "draft",
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getCase(id: string): Promise<DeskCase> {
  const res = await fetch(`/api/backend/cases/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchCase(
  id: string,
  payload: Partial<DeskCase>
): Promise<DeskCase> {
  const res = await fetch(`/api/backend/cases/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
