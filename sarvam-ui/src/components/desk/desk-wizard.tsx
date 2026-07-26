"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  ScanSearch,
  Volume2,
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
  extractDocuments,
  fetchHealth,
  fetchService,
  fetchServices,
  mapStatus,
  speakPrompt,
  type Extraction,
  type Service,
  type VerifyResult,
  verifyCase,
} from "@/lib/api/identitygraph";
import { cn } from "@/lib/utils";

const STEPS = [
  "Service",
  "Form",
  "OCR upload",
  "Review fields",
  "Verification",
  "Portal pack",
] as const;

const FIELD_KEYS = [
  "full_name",
  "father_name",
  "dob",
  "address",
  "id_number",
] as const;

type UploadRow = {
  file: File;
  docType: string;
  handwritten: boolean;
};

function isUncertain(v: string | undefined) {
  return !v || v.trim().toUpperCase() === "UNCERTAIN";
}

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
  const [apiLive, setApiLive] = useState(false);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewed, setReviewed] = useState(false);

  const loadServices = useCallback(async () => {
    setBusy(true);
    setBootError(null);
    try {
      const health = await fetchHealth();
      if (!health.sarvam_key_loaded) {
        throw new Error(
          "Sarvam API key not loaded. Add API_KEY to Sarvam_AI/.env and restart ./run_api.sh"
        );
      }
      setApiLive(true);
      const data = await fetchServices();
      setServices(data);
      const id = initialServiceId || data[0]?.id || "link_mobile_aadhaar";
      setServiceId(id);
      setService(await fetchService(id));
    } catch (e) {
      setApiLive(false);
      setBootError(
        e instanceof Error ? e.message : "Could not reach Sarvam_AI API on :8001."
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
    setUploads([]);
    setReviewed(false);
    setBusy(true);
    try {
      setService(await fetchService(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load service");
    } finally {
      setBusy(false);
    }
  }

  async function runOcr() {
    if (!apiLive) {
      toast.error("Sarvam API key required for OCR");
      return;
    }
    if (uploads.length === 0) {
      toast.error("Upload at least one document scan");
      return;
    }
    setBusy(true);
    try {
      const out = await extractDocuments({
        files: uploads.map((u) => u.file),
        docTypes: uploads.map((u) => u.docType),
        handwritten: uploads.map((u) => u.handwritten),
      });
      setExtractions(out.extractions);
      setReviewIdx(0);
      setReviewed(false);
      setResult(null);
      if (out.failures?.length) {
        toast.error(`${out.failures.length} file(s) failed OCR`);
      }
      if (out.extractions.length) {
        toast.success(
          `OCR complete — ${out.extractions.length} document(s). Review fields next.`
        );
        setStep(3);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setBusy(false);
    }
  }

  function updateField(docIndex: number, key: string, value: string) {
    setExtractions((prev) =>
      prev.map((doc, i) =>
        i === docIndex
          ? { ...doc, fields: { ...doc.fields, [key]: value } }
          : doc
      )
    );
    setReviewed(false);
  }

  function fillFormFromDocs() {
    if (!service) return;
    const aadhaar =
      extractions.find((d) => d.doc_type === "Aadhaar Card") || extractions[0];
    if (!aadhaar) return;
    const next = { ...answers };
    for (const spec of service.form_fields) {
      const compare = spec.compare_to;
      if (!compare) continue;
      const val = aadhaar.fields[compare];
      if (val && !isUncertain(val)) {
        if (spec.key === "aadhaar_number" || compare === "id_number") {
          next[spec.key] = val;
        } else if (spec.key === compare || spec.compare_doc === aadhaar.doc_type) {
          next[spec.key] = val;
        } else if (["full_name", "father_name", "dob", "address"].includes(spec.key)) {
          next[spec.key] = aadhaar.fields[spec.key] || next[spec.key] || "";
        }
      }
    }
    // Map common keys
    if (!next.full_name && aadhaar.fields.full_name) next.full_name = aadhaar.fields.full_name;
    if (!next.father_name && aadhaar.fields.father_name)
      next.father_name = aadhaar.fields.father_name;
    if (!next.dob && aadhaar.fields.dob) next.dob = aadhaar.fields.dob;
    if (!next.address && aadhaar.fields.address) next.address = aadhaar.fields.address;
    if (!next.aadhaar_number && aadhaar.fields.id_number)
      next.aadhaar_number = aadhaar.fields.id_number;
    setAnswers(next);
    toast.success("Form filled from reviewed OCR — check high-stakes fields");
    setStep(1);
  }

  async function runVerify() {
    if (!reviewed) {
      toast.error("Mark OCR fields as reviewed before verification");
      return;
    }
    setBusy(true);
    try {
      const v = await verifyCase({
        service_id: serviceId,
        form_answers: answers,
        extractions,
        operator_notes: notes,
      });
      setResult(v);
      setStep(4);
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

  const uncertainCount = useMemo(
    () =>
      extractions.reduce(
        (n, doc) =>
          n +
          FIELD_KEYS.filter((k) => isUncertain(doc.fields[k])).length,
        0
      ),
    [extractions]
  );

  const activeDoc = extractions[reviewIdx];

  if (bootError) {
    return (
      <>
        <PageHeader
          title="Suvidha Desk"
          description="Live Sarvam Vision + 30B OCR required — no dummy data."
        />
        <Card className="border-status-blocker/30 bg-status-blocker/5 shadow-none">
          <CardContent className="flex flex-col gap-4 p-6">
            <p className="text-sm text-foreground">{bootError}</p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-xs">
              {`cd Sarvam_AI
./run_api.sh
# API_KEY in Sarvam_AI/.env
# sarvam-ui .env.local → IDENTITYGRAPH_API_URL=http://127.0.0.1:8001`}
            </pre>
            <Button onClick={() => void loadServices()} disabled={busy}>
              {busy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
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
            ? `${service.title} — live OCR, handwritten support, operator review`
            : "Upload → OCR → review → verify → portal pack"
        }
        actions={
          <Badge
            variant="secondary"
            className="rounded-full border-status-match/40 bg-status-match/10 text-status-match"
          >
            Sarvam API live
          </Badge>
        }
      />

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (i === 0 || i === 1) setStep(i);
              if (i === 2) setStep(2);
              if (i === 3 && extractions.length) setStep(3);
              if (i === 4 && result) setStep(4);
              if (i === 5 && result) setStep(5);
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
          <div className="flex justify-end md:col-span-2">
            <Button disabled={!service} onClick={() => setStep(1)}>
              Next — Application form
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
                <CardTitle className="font-heading text-lg">Operator assist</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  Fill from the citizen, or OCR documents first then{" "}
                  <strong>Fill form from OCR</strong> on the review step.
                </p>
                {service.form_fields[0]?.prompt_hi ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const prompt =
                          service.form_fields[0].prompt_hi ||
                          service.form_fields[0].prompt_en ||
                          "";
                        const blob = await speakPrompt(prompt, "hi-IN");
                        const url = URL.createObjectURL(blob);
                        await new Audio(url).play();
                        toast.success("Bulbul v3 prompt played");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "TTS failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Volume2 data-icon="inline-start" />
                    Play first-field prompt
                  </Button>
                ) : null}
              </CardContent>
            </Card>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft data-icon="inline-start" />
                Back
              </Button>
              <Button onClick={() => setStep(2)}>
                {formComplete ? "Next — OCR upload" : "Skip to OCR (fill later)"}
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
              <CardTitle className="font-heading text-lg">
                Upload documents for OCR
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Required: {service.required_docs.join(", ")}. Mark{" "}
                <strong>Handwritten</strong> for filled forms / block letters — uses
                Indic OCR retries and stricter UNCERTAIN handling.
              </p>

              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/30 bg-secondary/20 p-4">
                <Label htmlFor="docs">Scans (JPG / PNG / PDF)</Label>
                <Input
                  id="docs"
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const required = service.required_docs;
                    setUploads(
                      files.map((file, i) => ({
                        file,
                        docType:
                          required[i] ||
                          required[required.length - 1] ||
                          "Other",
                        handwritten: false,
                      }))
                    );
                    setExtractions([]);
                    setReviewed(false);
                  }}
                />

                {uploads.map((u, i) => (
                  <div
                    key={`${u.file.name}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {u.file.name}
                    </span>
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={u.docType}
                      onChange={(e) => {
                        const next = [...uploads];
                        next[i] = { ...next[i], docType: e.target.value };
                        setUploads(next);
                      }}
                    >
                      {[
                        ...service.required_docs,
                        ...service.optional_docs,
                        "Other",
                      ].map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={u.handwritten}
                        onChange={(e) => {
                          const next = [...uploads];
                          next[i] = { ...next[i], handwritten: e.target.checked };
                          setUploads(next);
                        }}
                      />
                      Handwritten / filled form
                    </label>
                  </div>
                ))}

                <Button
                  disabled={busy || uploads.length === 0}
                  onClick={() => void runOcr()}
                >
                  {busy ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <ScanSearch data-icon="inline-start" />
                  )}
                  Run Sarvam Vision + 30B OCR
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            <Button
              disabled={!extractions.length}
              onClick={() => setStep(3)}
              variant="secondary"
            >
              Review existing OCR
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          {!extractions.length ? (
            <Card className="border-border shadow-none">
              <CardContent className="p-6 text-sm text-muted-foreground">
                No OCR results yet. Upload documents and run Sarvam Vision first.
                <div className="mt-4">
                  <Button onClick={() => setStep(2)}>Go to OCR upload</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {extractions.map((doc, i) => (
                  <Button
                    key={`${doc.doc_type}-${i}`}
                    size="sm"
                    variant={i === reviewIdx ? "default" : "outline"}
                    onClick={() => setReviewIdx(i)}
                  >
                    {doc.doc_type}
                    {doc.handwritten ? " · HW" : ""}
                  </Button>
                ))}
                <Badge variant="outline" className="rounded-full">
                  {uncertainCount} UNCERTAIN field(s)
                </Badge>
              </div>

              {activeDoc && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="border-border shadow-none">
                    <CardHeader>
                      <CardTitle className="font-heading text-lg">
                        Check extracted fields
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {activeDoc.source_file} · {activeDoc.language}
                        {activeDoc.handwritten ? " · handwritten" : " · printed"}
                      </p>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {FIELD_KEYS.map((key) => {
                        const val = activeDoc.fields[key] || "";
                        const bad = isUncertain(val);
                        return (
                          <div key={key} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor={`${reviewIdx}-${key}`}>{key}</Label>
                              {bad ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-status-uncertain/40 text-status-uncertain"
                                >
                                  Needs check
                                </Badge>
                              ) : null}
                            </div>
                            <Input
                              id={`${reviewIdx}-${key}`}
                              value={val}
                              className={cn(bad && "border-status-uncertain")}
                              onChange={(e) =>
                                updateField(reviewIdx, key, e.target.value)
                              }
                            />
                          </div>
                        );
                      })}
                      <div className="flex flex-col gap-1.5">
                        <Label>Operator notes (on this doc)</Label>
                        <Textarea
                          value={activeDoc.fields.confidence_notes || ""}
                          onChange={(e) =>
                            updateField(reviewIdx, "confidence_notes", e.target.value)
                          }
                          rows={2}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border shadow-none">
                    <CardHeader>
                      <CardTitle className="font-heading text-lg">
                        OCR text (source)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                        {activeDoc.ocr_text || "(no OCR text returned)"}
                      </pre>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Compare the OCR dump with edited fields. Leave UNCERTAIN if the
                        scan is unreadable — do not invent values.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft data-icon="inline-start" />
                  Re-upload
                </Button>
                <Button variant="secondary" onClick={fillFormFromDocs}>
                  Fill form from OCR
                </Button>
                <Button
                  variant={reviewed ? "secondary" : "default"}
                  onClick={() => {
                    setReviewed(true);
                    toast.success("OCR marked reviewed");
                  }}
                >
                  Mark fields reviewed
                </Button>
                <Button
                  disabled={!reviewed || !formComplete}
                  onClick={() => void runVerify()}
                >
                  {busy ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : null}
                  Run verification
                  <ArrowRight data-icon="inline-end" />
                </Button>
                {!formComplete ? (
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    Complete form first
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}

      {step === 4 && result && (
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
              <Badge className="rounded-full">
                {Math.round(result.knowledge.score)} · {result.knowledge.grade}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>{result.knowledge.process_summary}</p>
              {result.knowledge.rejection_risks.slice(0, 4).map((r) => (
                <p key={r}>• {r}</p>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Form ↔ document</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {result.form_verification.checks.map((c) => (
                <div
                  key={c.form_key}
                  className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:justify-between"
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
              <CardTitle className="font-heading text-lg">Cross-document</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {result.cross_document.comparisons
                .filter((c) => c.status !== "MATCH")
                .map((c, i) => (
                  <div
                    key={`${c.field}-${i}`}
                    className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:justify-between"
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
            </CardContent>
          </Card>

          {result.remediation && (
            <Card className="border-primary/25 bg-secondary/40 shadow-none">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Priority remediation</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p>
                  {result.remediation.primary_doc
                    ? `Fix first: ${result.remediation.primary_doc}`
                    : "No critical blockers"}
                </p>
                <p className="text-muted-foreground">{result.remediation.how}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft data-icon="inline-start" />
              Back to review
            </Button>
            <Button onClick={() => setStep(5)}>
              Portal pack
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      {step === 5 && result && (
        <div className="flex flex-col gap-4">
          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Portal pack</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">Operator notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
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
              <Separator />
              <p className="text-xs text-muted-foreground">
                Pack is built from operator-reviewed OCR + form answers — not sample data.
              </p>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(4)}>
              <ArrowLeft data-icon="inline-start" />
              Back
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
