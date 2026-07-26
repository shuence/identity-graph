"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/identity/status-badge";
import {
  downloadPack,
  fetchDemo,
  fetchService,
  mapStatus,
  type Extraction,
  type Service,
  type VerifyResult,
  verifyCase,
} from "@/lib/api/identitygraph";
import { cn } from "@/lib/utils";

const STEPS = [
  "Choose service",
  "Fill form",
  "Documents",
  "Verification",
  "Portal pack",
] as const;

export function DeskWizard({ initialServiceId }: { initialServiceId?: string }) {
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState(
    initialServiceId || "link_mobile_aadhaar"
  );
  const [service, setService] = useState<Service | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setBusy(true);
    setBootError(null);
    try {
      const res = await fetch("/api/backend/services");
      if (!res.ok) throw new Error("Backend not reachable");
      const data = (await res.json()) as Service[];
      setServices(data);
      const id = initialServiceId || data[0]?.id || "link_mobile_aadhaar";
      setServiceId(id);
      const detail = await fetchService(id);
      setService(detail);
    } catch (e) {
      setBootError(
        e instanceof Error
          ? e.message
          : "Could not reach IdentityGraph API. Start Sarvam_AI on :8000."
      );
    } finally {
      setBusy(false);
    }
  }, [initialServiceId]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  async function selectService(id: string) {
    setServiceId(id);
    setAnswers({});
    setExtractions([]);
    setResult(null);
    setBusy(true);
    try {
      setService(await fetchService(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load service");
    } finally {
      setBusy(false);
    }
  }

  async function prefillDemo() {
    setBusy(true);
    try {
      const demo = await fetchDemo(serviceId);
      setAnswers(demo.form_answers);
      toast.success("Demo citizen loaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Demo load failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadDemoDocs() {
    setBusy(true);
    try {
      const demo = await fetchDemo(serviceId);
      setExtractions(demo.extractions);
      if (!Object.keys(answers).length) setAnswers(demo.form_answers);
      toast.success(`${demo.extractions.length} demo documents loaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Doc load failed");
    } finally {
      setBusy(false);
    }
  }

  async function runVerify() {
    setBusy(true);
    try {
      const v = await verifyCase({
        service_id: serviceId,
        form_answers: answers,
        extractions,
        operator_notes: notes,
      });
      setResult(v);
      setStep(3);
      toast.success(`Score ${Math.round(v.knowledge.score)} · ${v.knowledge.grade}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  const formComplete = useMemo(() => {
    if (!service) return false;
    return service.form_fields.every((f) => (answers[f.key] || "").trim());
  }, [service, answers]);

  if (bootError) {
    return (
      <>
        <PageHeader
          title="Suvidha Desk"
          description="Connect the Sarvam_AI backend to run the real IdentityGraph engine."
        />
        <Card className="border-status-blocker/30 bg-status-blocker/5 shadow-none">
          <CardContent className="flex flex-col gap-4 p-6">
            <p className="text-sm text-foreground">{bootError}</p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-xs">
              {`cd Sarvam_AI
source .venv/bin/activate   # or: python3 -m venv .venv && pip install -r requirements.txt
uvicorn api:app --reload --port 8000`}
            </pre>
            <Button onClick={() => void loadServices()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Retry connection
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="IdentityGraph Suvidha Desk"
        description={
          service
            ? `${service.title} — ${service.tagline}`
            : "Voice-fill → digitize docs → verify → portal pack"
        }
        actions={
          <Badge variant="secondary" className="rounded-full">
            Powered by Sarvam_AI
          </Badge>
        }
      />

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (i <= step || (i === 3 && result) || (i === 4 && result)) setStep(i);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              i === step
                ? "border-primary bg-primary text-primary-foreground"
                : i < step
                  ? "border-secondary bg-secondary text-secondary-foreground"
                  : "border-border text-muted-foreground"
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((s) => {
            const on = s.id === serviceId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => void selectService(s.id)}
                className={cn(
                  "rounded-xl border p-5 text-left transition-colors",
                  on
                    ? "border-primary/40 bg-secondary/50"
                    : "border-border bg-card hover:border-primary/25"
                )}
              >
                <p className="font-heading text-lg font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.tagline}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Docs: {s.required_docs.join(" · ")}
                </p>
              </button>
            );
          })}
          <div className="md:col-span-2 flex justify-end">
            <Button disabled={!service} onClick={() => setStep(1)}>
              Next — Fill form
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      {step === 1 && service && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border shadow-none">
            <CardHeader className="gap-2 border-b border-border bg-muted/30">
              <CardTitle className="text-center font-heading text-xl uppercase tracking-wide">
                {service.title}
              </CardTitle>
              <p className="text-center text-xs text-muted-foreground">
                Application form · {service.portal.name}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-6">
              {service.form_fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <Label htmlFor={field.key}>
                    {field.label}
                    {field.high_stakes ? " *" : ""}
                  </Label>
                  {field.key.includes("address") ||
                  field.key.includes("reason") ||
                  field.key.includes("complaint") ||
                  field.key.includes("outcome") ? (
                    <Textarea
                      id={field.key}
                      value={answers[field.key] || ""}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [field.key]: e.target.value }))
                      }
                      rows={3}
                    />
                  ) : (
                    <Input
                      id={field.key}
                      value={answers[field.key] || ""}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [field.key]: e.target.value }))
                      }
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="border-border bg-secondary/30 shadow-none">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Demo assist</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Prefills the Mohammed Irfan Shaikh citizen for judging — no API burn.
                </p>
                <Button variant="secondary" disabled={busy} onClick={() => void prefillDemo()}>
                  <Sparkles data-icon="inline-start" />
                  Prefill demo citizen
                </Button>
              </CardContent>
            </Card>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft data-icon="inline-start" />
                Back
              </Button>
              <Button disabled={!formComplete} onClick={() => setStep(2)}>
                Submit → Documents
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && service && (
        <div className="flex flex-col gap-4">
          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Supporting documents</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Required: {service.required_docs.join(", ")}. Demo mode loads Sarvam_AI
                sample extractions (Vision + 30B output shape).
              </p>
              <Button disabled={busy} onClick={() => void loadDemoDocs()} className="w-fit">
                {busy ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Sparkles data-icon="inline-start" />
                )}
                Load demo documents
              </Button>
              {extractions.length > 0 && (
                <div className="grid gap-3 md:grid-cols-3">
                  {extractions.map((doc) => (
                    <div
                      key={`${doc.doc_type}-${doc.source_file}`}
                      className="rounded-xl border border-border bg-card p-4"
                    >
                      <p className="font-heading font-semibold">{doc.doc_type}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {doc.source_file || "sample"}
                      </p>
                      <Separator className="my-3" />
                      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {Object.entries(doc.fields)
                          .filter(([k]) => k !== "confidence_notes")
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <li key={k}>
                              <span className="font-medium text-foreground">{k}:</span> {v}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            <Button
              disabled={busy || extractions.length < 1}
              onClick={() => void runVerify()}
            >
              {busy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              Run verification
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ["match", "Matches", result.cross_document.summary.matches],
                ["variant", "Variants", result.cross_document.summary.variants],
                ["blocker", "Blockers", result.cross_document.summary.blockers],
                ["uncertain", "Uncertain", result.cross_document.summary.uncertain],
              ] as const
            ).map(([status, label, value]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-heading text-2xl font-semibold">{value}</p>
                </div>
                <StatusBadge status={status} />
              </div>
            ))}
          </div>

          <Card className="border-border shadow-none">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="font-heading text-lg">Knowledge score</CardTitle>
              <Badge
                className={cn(
                  "rounded-full",
                  result.knowledge.grade === "READY" && "bg-status-match text-white",
                  result.knowledge.grade === "FIX_REQUIRED" &&
                    "bg-status-uncertain text-foreground",
                  result.knowledge.grade === "BLOCKED" && "bg-status-blocker text-white"
                )}
              >
                {Math.round(result.knowledge.score)} · {result.knowledge.grade}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>{result.knowledge.process_summary}</p>
              {result.knowledge.rejection_risks.slice(0, 3).map((r) => (
                <p key={r}>• {r}</p>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Form ↔ document checks</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {result.form_verification.checks.map((c) => (
                <div
                  key={c.form_key}
                  className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Form: “{c.form_value}” · {c.doc_type || "—"}: “{c.doc_value || "—"}”
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                  <StatusBadge status={mapStatus(c.status)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Cross-document findings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {result.cross_document.comparisons
                .filter((c) => c.status !== "MATCH")
                .map((c, i) => (
                  <div
                    key={`${c.field}-${c.doc_a}-${c.doc_b}-${i}`}
                    className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {c.field}: {c.doc_a} vs {c.doc_b}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        “{c.value_a}” vs “{c.value_b}” — {c.detail}
                      </p>
                    </div>
                    <StatusBadge status={mapStatus(c.status)} />
                  </div>
                ))}
              {!result.cross_document.comparisons.some((c) => c.status !== "MATCH") && (
                <p className="text-sm text-muted-foreground">
                  All compared fields match across documents.
                </p>
              )}
            </CardContent>
          </Card>

          {result.remediation && (
            <Card className="border-primary/25 bg-secondary/40 shadow-none">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Priority remediation</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {result.remediation.primary_doc ? (
                  <p>
                    Fix first:{" "}
                    <strong>{result.remediation.primary_doc}</strong> (
                    {result.remediation.blocker_count} blocker
                    {result.remediation.blocker_count === 1 ? "" : "s"})
                  </p>
                ) : (
                  <p>No critical blockers — operator can proceed after review.</p>
                )}
                <p className="text-muted-foreground">{result.remediation.how}</p>
                {result.remediation.portal_url ? (
                  <Button
                    className="w-fit"
                    render={
                      <a
                        href={result.remediation.portal_url}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    Open {result.remediation.portal_name}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            <Button onClick={() => setStep(4)}>
              Portal pack
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="flex flex-col gap-4">
          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Result pack</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Download the filled application form and Verified Identity Audit File
                generated by the Sarvam_AI report engine — ready for the portal upload.
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">Operator notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional desk notes for the pack…"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await downloadPack("form", {
                        service_id: serviceId,
                        form_answers: answers,
                        extractions,
                        operator_notes: notes,
                      });
                      toast.success("Filled form downloaded");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Download failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Download data-icon="inline-start" />
                  Filled form PDF
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await downloadPack("audit", {
                        service_id: serviceId,
                        form_answers: answers,
                        extractions,
                        operator_notes: notes,
                      });
                      toast.success("Audit file downloaded");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Download failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Download data-icon="inline-start" />
                  Identity audit PDF
                </Button>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "w-fit rounded-full",
                  result.ready_for_portal
                    ? "border-status-match/40 text-status-match"
                    : "border-status-uncertain/40 text-status-uncertain"
                )}
              >
                {result.ready_for_portal
                  ? "Portal-ready after operator sign-off"
                  : "Fix blockers / uncertain fields before portal"}
              </Badge>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft data-icon="inline-start" />
              Back to flags
            </Button>
            <Button variant="ghost" render={<Link href="/app" />} nativeButton={false}>
              Desk home
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
