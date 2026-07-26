"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileScan,
  Loader2,
  ScanSearch,
  Trash2,
  Upload,
  Volume2,
  X,
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
  OperatorRail,
  fillModeLabel,
} from "@/components/desk/operator-rail";
import {
  downloadPack,
  extractDocuments,
  extractForm,
  fetchHealth,
  fetchService,
  fetchServices,
  guessDocType,
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

/** Explicit MIME + extensions — Safari often greys out .jpg when only `image/*` is set. */
const SCAN_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.pdf,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,application/pdf";

const FIELD_KEYS = [
  "full_name",
  "father_name",
  "dob",
  "address",
  "id_number",
] as const;

const FILL_ORDER = [
  "paper_block_letters",
  "paper_or_online",
  "assisted_counter",
  "portal_identity",
] as const;

type UploadRow = {
  file: File;
  docType: string;
  handwritten: boolean;
};

function isUncertain(v: string | undefined) {
  return !v || v.trim().toUpperCase() === "UNCERTAIN";
}

function isLongField(key: string) {
  return (
    key.includes("address") ||
    key.includes("reason") ||
    key.includes("complaint") ||
    key.includes("outcome") ||
    key.includes("summary") ||
    key.includes("members") ||
    key.includes("newspaper") ||
    key.includes("correction") ||
    key.includes("fields_to")
  );
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
  const [busy, setBusy] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [apiLive, setApiLive] = useState(false);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [speakingField, setSpeakingField] = useState<string | null>(null);

  // Scanned form OCR + review gate
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formOcrNote, setFormOcrNote] = useState<string | null>(null);
  const [formReviewed, setFormReviewed] = useState(false);

  const servicesByMode = useMemo(() => {
    const groups: { mode: string; items: Service[] }[] = [];
    for (const mode of FILL_ORDER) {
      const items = services.filter((s) => s.fill_mode === mode);
      if (items.length) groups.push({ mode, items });
    }
    const rest = services.filter(
      (s) => !s.fill_mode || !FILL_ORDER.includes(s.fill_mode as (typeof FILL_ORDER)[number])
    );
    if (rest.length) groups.push({ mode: "other", items: rest });
    return groups;
  }, [services]);

  const loadServices = useCallback(async () => {
    try {
      const health = await fetchHealth();
      setBootError(null);
      const keyLoaded = Boolean(
        health.sarvam_key_loaded ?? health.sarvam_configured
      );
      setApiLive(keyLoaded);
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

  function resetCaseState() {
    setAnswers({});
    setExtractions([]);
    setResult(null);
    setUploads([]);
    setReviewed(false);
    setFormFile(null);
    setFormOcrNote(null);
    setFormReviewed(false);
  }

  async function selectService(id: string) {
    setServiceId(id);
    resetCaseState();
    setBusy(true);
    try {
      setService(await fetchService(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load service");
    } finally {
      setBusy(false);
    }
  }

  async function runFormOcr() {
    if (!formFile) {
      toast.error("Choose a scanned form image first");
      return;
    }
    if (!apiLive) {
      toast.error("Live form OCR needs API_KEY in Sarvam_AI/.env.");
      return;
    }
    setBusy(true);
    try {
      const res = await extractForm({ serviceId, file: formFile });
      setAnswers((prev) => ({ ...prev, ...res.form_answers }));
      setFormReviewed(false);
      setFormOcrNote("Live form OCR complete — review answers before continuing");
      toast.success("Form OCR extracted — please review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Form OCR failed");
    } finally {
      setBusy(false);
    }
  }

  async function runOcr() {
    if (!apiLive) {
      toast.error("Live OCR needs API_KEY in Sarvam_AI/.env.");
      return;
    }
    if (uploads.length === 0) {
      toast.error("Upload at least one document scan");
      return;
    }
    setBusy(true);
    toast.message(`Running OCR on ${uploads.length} document(s)…`);
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
          `OCR complete — ${out.extractions.length} of ${uploads.length} document(s). Review fields next.`
        );
        setStep(3);
      } else {
        toast.error("No documents extracted — check files and try again");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setBusy(false);
    }
  }

  function addUploadFiles(files: File[]) {
    if (!service || files.length === 0) return;
    const preferred = [...service.required_docs, ...service.optional_docs];
    const existingNames = new Set(uploads.map((u) => `${u.file.name}:${u.file.size}`));
    const incoming = files.filter(
      (f) => !existingNames.has(`${f.name}:${f.size}`)
    );
    if (!incoming.length) {
      toast.message("Those files are already in the list");
      return;
    }
    const start = uploads.length;
    const rows: UploadRow[] = incoming.map((file, i) => ({
      file,
      docType:
        guessDocType(file.name, preferred) ||
        preferred[start + i] ||
        preferred[Math.min(start + i, preferred.length - 1)] ||
        preferred[0] ||
        "Other",
      handwritten: false,
    }));
    setUploads((prev) => [...prev, ...rows]);
    setExtractions([]);
    setReviewed(false);
    toast.success(`Added ${rows.length} document(s) · ${start + rows.length} total`);
  }

  function removeUpload(index: number) {
    setUploads((prev) => prev.filter((_, i) => i !== index));
    setExtractions([]);
    setReviewed(false);
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
    const next = { ...answers };
    for (const spec of service.form_fields) {
      const compare = spec.compare_to;
      if (!compare) continue;
      const preferred =
        (spec.compare_doc &&
          extractions.find((d) => d.doc_type === spec.compare_doc)) ||
        extractions.find((d) => d.doc_type === "Aadhaar Card") ||
        extractions[0];
      if (!preferred) continue;
      const val = preferred.fields[compare] || preferred.fields[spec.key];
      if (val && !isUncertain(val)) next[spec.key] = val;
    }
    setAnswers(next);
    setFormReviewed(false);
    toast.success("Form filled from reviewed OCR — check high-stakes fields");
    setStep(1);
  }

  async function playFieldPrompt(fieldKey: string) {
    if (!service || !apiLive) {
      toast.error("Live Sarvam voice required");
      return;
    }
    const field = service.form_fields.find((f) => f.key === fieldKey);
    const prompt = field?.prompt_hi || field?.prompt_en;
    if (!prompt) {
      toast.error("No voice prompt for this field");
      return;
    }
    setBusy(true);
    setSpeakingField(fieldKey);
    try {
      const blob = await speakPrompt(prompt, "hi-IN");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setSpeakingField(null);
      };
    } catch (e) {
      setSpeakingField(null);
      toast.error(e instanceof Error ? e.message : "TTS failed");
    } finally {
      setBusy(false);
    }
  }

  async function runVerify() {
    if (!formReviewed && Object.keys(answers).length) {
      toast.error("Confirm you reviewed the form answers first");
      return;
    }
    if (!reviewed) {
      toast.error("Mark OCR fields as reviewed before verification");
      return;
    }
    if (!extractions.length) {
      toast.error("Run OCR before verification");
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
          description="Connect Sarvam_AI for live Vision OCR."
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
            <Button
              onClick={() => {
                setBusy(true);
                setBootError(null);
                void loadServices();
              }}
              disabled={busy}
            >
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
            ? `${service.title} · ${fillModeLabel(service.fill_mode) || "operator desk"} — voice, OCR, mismatch verify, portal pack`
            : "Sarvam Epoch · CSC desk for India's still-manual identity forms"
        }
        actions={
          <Badge
            variant="secondary"
            className={cn(
              "rounded-full",
              apiLive
                ? "border-status-match/40 bg-status-match/10 text-status-match"
                : "border-status-uncertain/40 text-status-uncertain"
            )}
          >
            {apiLive ? "Sarvam OCR live" : "API not connected"}
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
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-sm text-muted-foreground">
              Pick the form the citizen needs. Catalog is evidence-backed: paper
              block-letter forms, BLO/ERO offline, CSC-assisted portals, and
              identity-mismatch remediation — not DigiLocker/GST self-serve.
            </p>
            <Button disabled={!service} onClick={() => setStep(1)}>
              Next — Application form
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
          {servicesByMode.map((group) => (
            <div key={group.mode} className="flex flex-col gap-3">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {fillModeLabel(group.mode) || group.mode}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {group.items.map((s) => {
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
                      {s.category ? (
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {s.category}
                        </p>
                      ) : null}
                      <p className="font-heading text-lg font-semibold">{s.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{s.tagline}</p>
                      {s.official_form ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {s.official_form}
                        </p>
                      ) : null}
                      <p className="mt-3 text-xs text-muted-foreground">
                        Docs: {s.required_docs.join(" · ")} ·{" "}
                        {s.form_fields.length} fields
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button disabled={!service} onClick={() => setStep(1)}>
              Next — Application form
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      {step === 1 && service && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="border-border shadow-none">
            <CardHeader className="gap-2 border-b border-border bg-muted/30">
              <CardTitle className="text-center font-heading text-xl uppercase tracking-wide">
                {service.title}
              </CardTitle>
              <p className="text-center text-xs text-muted-foreground">
                {service.official_form || service.portal.name}
                {service.fill_mode
                  ? ` · ${fillModeLabel(service.fill_mode)}`
                  : ""}
              </p>
              {formOcrNote ? (
                <p className="text-center text-xs text-primary">{formOcrNote}</p>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pt-6">
              {service.form_fields.map((field) => (
                <div
                  key={field.key}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border border-transparent p-1",
                    speakingField === field.key && "border-primary/40 bg-secondary/40"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={field.key} className="flex-1">
                      {field.label}
                      {field.high_stakes ? " *" : ""}
                    </Label>
                    {field.high_stakes ? (
                      <Badge variant="secondary" className="text-[10px]">
                        High stakes
                      </Badge>
                    ) : null}
                    {field.compare_doc ? (
                      <Badge variant="outline" className="text-[10px]">
                        Match {field.compare_doc}
                      </Badge>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || !apiLive}
                      className="h-7 px-2"
                      onClick={() => void playFieldPrompt(field.key)}
                      title="Play Hindi prompt (Bulbul)"
                    >
                      <Volume2 className="size-3.5" />
                    </Button>
                  </div>
                  {isLongField(field.key) ? (
                    <Textarea
                      id={field.key}
                      value={answers[field.key] || ""}
                      onChange={(e) => {
                        setFormReviewed(false);
                        setAnswers((a) => ({ ...a, [field.key]: e.target.value }));
                      }}
                      rows={3}
                      placeholder={field.prompt_en || ""}
                    />
                  ) : (
                    <Input
                      id={field.key}
                      value={answers[field.key] || ""}
                      onChange={(e) => {
                        setFormReviewed(false);
                        setAnswers((a) => ({ ...a, [field.key]: e.target.value }));
                      }}
                      placeholder={field.prompt_en || ""}
                    />
                  )}
                  {field.operator_tip ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {field.operator_tip}
                    </p>
                  ) : null}
                  {field.prompt_hi ? (
                    <p className="text-[11px] text-muted-foreground/80">
                      हि: {field.prompt_hi}
                    </p>
                  ) : null}
                </div>
              ))}

              {formComplete ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={formReviewed}
                    onChange={(e) => setFormReviewed(e.target.checked)}
                  />
                  <span>
                    I reviewed the OCR / form answers above. Proceed to
                    document upload.
                  </span>
                </label>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="border-border shadow-none">
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <FileScan className="size-4" />
                  Scan filled form
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Upload the citizen&apos;s handwritten / block-letter form
                  (JPG, JPEG, PNG, WebP, or PDF). OCR fills fields — including
                  FORM-ONLY values like mobile that eKYC cannot provide. Review
                  before continuing.
                </p>
                <input
                  type="file"
                  accept={SCAN_ACCEPT}
                  className="block w-full cursor-pointer text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFormFile(f);
                    setFormReviewed(false);
                    if (f) {
                      toast.success(`Selected ${f.name}`);
                    }
                  }}
                />
                {formFile ? (
                  <p className="text-xs text-muted-foreground">
                    {formFile.name} · {(formFile.size / 1024).toFixed(0)} KB ·{" "}
                    {formFile.type || "unknown type"}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !formFile || !apiLive}
                    onClick={() => void runFormOcr()}
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <Upload data-icon="inline-start" />
                    )}
                    OCR form
                  </Button>
                </div>
              </CardContent>
            </Card>

            <OperatorRail
              service={service}
              speakingField={speakingField}
              onSpeak={(key) => void playFieldPrompt(key)}
              busy={busy}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft data-icon="inline-start" />
                Back
              </Button>
              <Button
                disabled={formComplete && !formReviewed}
                onClick={() => setStep(2)}
              >
                {formComplete
                  ? formReviewed
                    ? "Next — OCR upload"
                    : "Review form first"
                  : "Skip to OCR (fill later)"}
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
                Add multiple KYC scans (Aadhaar, PAN, passbook, DL…). Select
                several files at once, or keep adding. Required:{" "}
                {service.required_docs.join(", ")}. Mark{" "}
                <strong>Handwritten</strong> for filled forms / block letters.
                {!apiLive ? (
                  <>
                    {" "}
                    <span className="text-status-uncertain">
                      No API_KEY — live OCR disabled. Add{" "}
                      <code className="rounded bg-muted px-1">API_KEY</code> in{" "}
                      <code className="rounded bg-muted px-1">Sarvam_AI/.env</code>.
                    </span>
                  </>
                ) : null}
              </p>

              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/30 bg-secondary/20 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="docs">
                      Add scans (JPG / JPEG / PNG / WebP / PDF) — multiple OK
                    </Label>
                    <input
                      id="docs"
                      type="file"
                      accept={SCAN_ACCEPT}
                      multiple
                      className="block w-full max-w-md cursor-pointer text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        addUploadFiles(files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {uploads.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setUploads([]);
                        setExtractions([]);
                        setReviewed(false);
                      }}
                    >
                      <Trash2 data-icon="inline-start" />
                      Clear all
                    </Button>
                  ) : null}
                </div>

                {uploads.length > 0 ? (
                  <p className="text-xs font-medium text-foreground">
                    {uploads.length} document{uploads.length === 1 ? "" : "s"} queued
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No documents yet — pick one or more files above.
                  </p>
                )}

                {uploads.map((u, i) => (
                  <div
                    key={`${u.file.name}-${u.file.size}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {i + 1}. {u.file.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {(u.file.size / 1024).toFixed(0)} KB
                      </span>
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
                      Handwritten
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      disabled={busy}
                      onClick={() => removeUpload(i)}
                      title="Remove"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || uploads.length === 0 || !apiLive}
                    onClick={() => void runOcr()}
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <ScanSearch data-icon="inline-start" />
                    )}
                    Run Sarvam OCR on {uploads.length || ""} file
                    {uploads.length === 1 ? "" : "s"}
                  </Button>
                </div>
                {busy ? (
                  <p className="text-xs text-muted-foreground">
                    Live Vision can take 1–2 min per file — leave this tab open.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2">
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
            {extractions.length < 1 ? (
              <p className="text-sm text-status-uncertain">
                Verification unlocks after OCR finishes.
              </p>
            ) : null}
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

              <div className="flex flex-col gap-2">
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
                    disabled={!reviewed || !formComplete || !formReviewed}
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
                {(!reviewed || !formReviewed || !extractions.length) && (
                  <p className="text-sm text-status-uncertain">
                    {!extractions.length
                      ? "OCR must finish before Run verification."
                      : !formReviewed
                        ? "Go back to Form and tick “I reviewed the OCR / form answers” before verifying."
                        : "Mark OCR fields as reviewed before Run verification."}
                  </p>
                )}
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
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>{result.knowledge.process_summary}</p>
              {result.knowledge.checklist?.length ? (
                <div>
                  <p className="mb-1 font-medium text-foreground">Operator checklist</p>
                  <ul className="flex flex-col gap-1">
                    {result.knowledge.checklist.map((c) => (
                      <li key={c}>• {c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {result.knowledge.rejection_risks.length ? (
                <div>
                  <p className="mb-1 font-medium text-foreground">Rejection risks</p>
                  {result.knowledge.rejection_risks.slice(0, 5).map((r) => (
                    <p key={r}>• {r}</p>
                  ))}
                </div>
              ) : null}
              {result.knowledge.field_issues
                ?.filter((i) => i.severity === "FAIL" || i.severity === "WARN")
                .slice(0, 8)
                .map((i) => (
                  <p key={`${i.field_key}-${i.message}`} className="text-xs">
                    <span className="font-medium text-foreground">{i.field_key}</span>{" "}
                    [{i.severity}] {i.message}
                  </p>
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
              {Object.keys(result.form_verification.approved_fields).length > 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  FORM-ONLY (no KYC source):{" "}
                  {Object.entries(result.form_verification.approved_fields)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" · ")}
                </div>
              ) : null}
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
                Pack is built from operator-reviewed OCR + form answers.
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
