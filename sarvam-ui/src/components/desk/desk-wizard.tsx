"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileScan,
  Loader2,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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
import { StatusBadge } from "@/components/identity/status-badge";
import {
  OperatorRail,
  fillModeLabel,
} from "@/components/desk/operator-rail";
import {
  downloadPack,
  extractDocuments,
  extractForm,
  fetchDemo,
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

/** Find where a value appears in raw OCR text — provenance for the operator. */
function ocrSnippet(
  text: string | undefined,
  value: string | undefined
): string | null {
  if (!text || !value || isUncertain(value)) return null;
  const clean = value.trim();
  const words = clean.split(/\s+/).filter((w) => w.length > 2);
  const candidates = [clean, ...words.sort((a, b) => b.length - a.length)].slice(
    0,
    4
  );
  const lower = text.toLowerCase();
  for (const cand of candidates) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 45);
      const end = Math.min(text.length, idx + cand.length + 45);
      const chunk = text.slice(start, end).replace(/\s+/g, " ").trim();
      return `${start > 0 ? "…" : ""}${chunk}${end < text.length ? "…" : ""}`;
    }
  }
  return null;
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
  const [judgeMode, setJudgeMode] = useState(false);

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
    setJudgeMode(false);
  }

  /** One-click judge path: Sanika RTO fixtures → review → verify → pack. */
  async function runJudgeDemo() {
    setBusy(true);
    try {
      const id = "rto_dl_update";
      setServiceId(id);
      const detail = await fetchService(id);
      setService(detail);
      const demo = await fetchDemo(id, "sanika");
      setAnswers(demo.form_answers);
      setExtractions(demo.extractions);
      setFormReviewed(true);
      setReviewed(true);
      setJudgeMode(true);
      setFormOcrNote(
        `Judge demo: ${demo.citizen || "Sanika Chavan"} — fixtures loaded (no API burn)`
      );
      setUploads([]);
      setNotes(
        "Judge demo: Sanika Chavan RTO address update. Blockers/variants are intentional — show MATCH / VARIANT / CRITICAL / UNCERTAIN."
      );
      const v = await verifyCase({
        service_id: id,
        form_answers: demo.form_answers,
        extractions: demo.extractions,
        operator_notes:
          "Judge demo pack — Suvidha desk caught mismatches before portal upload.",
      });
      setResult(v);
      setStep(4);
      toast.success(
        `Judge demo ready · ${Math.round(v.knowledge.score)} · ${v.knowledge.grade} · ${v.cross_document.summary.blockers} blocker(s)`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Judge demo failed");
    } finally {
      setBusy(false);
    }
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
    const priority = [
      "Aadhaar Card",
      "PAN Card",
      "Driving License",
      "Voter ID",
      "Passport",
      "Ration Card",
      "School Certificate",
      "Bank Passbook",
    ];
    const next = { ...answers };
    let filled = 0;
    for (const spec of service.form_fields) {
      const compare = spec.compare_to;
      if (!compare) continue;
      const ordered = [...extractions].sort((a, b) => {
        const pa = priority.indexOf(a.doc_type);
        const pb = priority.indexOf(b.doc_type);
        const preferA =
          spec.compare_doc && a.doc_type === spec.compare_doc ? -1 : 0;
        const preferB =
          spec.compare_doc && b.doc_type === spec.compare_doc ? -1 : 0;
        return preferA - preferB || (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
      });
      const hit = ordered.find((d) => {
        const val = d.fields[compare] || d.fields[spec.key];
        return val && !isUncertain(val);
      });
      if (!hit) continue;
      const val = hit.fields[compare] || hit.fields[spec.key];
      if (val) {
        next[spec.key] = val;
        filled += 1;
      }
    }
    setAnswers(next);
    setFormReviewed(false);
    toast.success(
      filled
        ? `Filled ${filled} form field(s) from best readable OCR (Aadhaar → PAN → …). Review on Form step.`
        : "No readable OCR fields to copy — check document extractions"
    );
    if (filled) setStep(1);
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

  const impact = useMemo(() => {
    if (!result) return null;
    const blockers = result.cross_document.summary.blockers;
    const formBlockers = result.form_verification.checks.filter(
      (c) => c.status === "CRITICAL"
    ).length;
    const caught = blockers + formBlockers;
    const variants = result.cross_document.summary.variants;
    const minutesSaved = Math.max(8, 4 + caught * 3 + variants);
    return {
      caught,
      blockers,
      formBlockers,
      variants,
      uncertain: result.cross_document.summary.uncertain,
      minutesSaved,
      ready: Boolean(result.ready_for_portal) && caught === 0,
      score: Math.round(result.knowledge.score),
      grade: result.knowledge.grade,
    };
  }, [result]);

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
        className="border-border bg-card px-4 py-4 md:px-5"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void runJudgeDemo()}
              className="rounded-sm"
            >
              {busy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              Judge demo (90s)
            </Button>
            {judgeMode ? (
              <Badge
                variant="secondary"
                className="rounded-sm border-primary/40 bg-primary/10 text-primary"
              >
                Judge demo
              </Badge>
            ) : null}
            <Badge
              variant="secondary"
              className={cn(
                "rounded-sm",
                apiLive
                  ? "border-status-match/40 bg-status-match/10 text-status-match"
                  : "border-status-uncertain/40 text-status-uncertain"
              )}
            >
              {apiLive ? "Sarvam OCR live" : "API not connected"}
            </Badge>
          </div>
        }
      />

      <nav
        aria-label="Desk steps"
        className="desk-panel overflow-hidden bg-card"
      >
        <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={label} className="min-w-0 border-b border-r border-border last:border-r-0 sm:[&:nth-child(3)]:border-r-0 lg:[&:nth-child(3)]:border-r lg:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    if (i === 0 || i === 1) setStep(i);
                    if (i === 2) setStep(2);
                    if (i === 3 && extractions.length) setStep(3);
                    if (i === 4 && result) setStep(4);
                    if (i === 5 && result) setStep(5);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors",
                    current && "bg-[#0b3d91] text-white",
                    done && !current && "bg-[#e8eef8] text-[#0b3d91]",
                    !done && !current && "bg-card text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center border text-[11px] font-semibold",
                      current
                        ? "border-white/40 bg-white/15 text-white"
                        : done
                          ? "border-[#0b3d91]/30 bg-white text-[#0b3d91]"
                          : "border-border bg-muted text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate font-medium">{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <div className="desk-notice flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-[#0b3d91]">
                Quick path for judges — Sanika Chavan RTO demo
              </p>
              <p className="text-sm text-muted-foreground">
                Loads fixtures → MATCH / VARIANT / CRITICAL / UNCERTAIN → portal
                pack PDFs. No OCR API burn.
              </p>
            </div>
            <Button
              disabled={busy}
              onClick={() => void runJudgeDemo()}
              className="shrink-0 rounded-sm"
            >
              {busy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              Run judge demo
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-sm text-muted-foreground">
              Select the service scheme. Catalog covers paper block-letter forms,
              BLO/ERO offline, CSC-assisted portals, and identity-mismatch
              remediation.
            </p>
            <Button disabled={!service} onClick={() => setStep(1)} className="rounded-sm">
              Next — Application form
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
          {servicesByMode.map((group) => (
            <div key={group.mode} className="desk-panel overflow-hidden">
              <div className="desk-panel-head">
                {fillModeLabel(group.mode) || group.mode}
              </div>
              <div className="divide-y divide-border bg-card">
                {group.items.map((s) => {
                  const on = s.id === serviceId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void selectService(s.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between",
                        on
                          ? "bg-[#e8eef8]"
                          : "bg-card hover:bg-muted/40"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {on ? (
                            <span className="border border-[#0b3d91] bg-[#0b3d91] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                              Selected
                            </span>
                          ) : null}
                          {s.category ? (
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {s.category}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {s.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.tagline}</p>
                      </div>
                      <div className="shrink-0 text-left text-[11px] text-muted-foreground sm:text-right">
                        {s.official_form ? <p>{s.official_form}</p> : null}
                        <p>
                          Docs: {s.required_docs.join(" · ")} · {s.form_fields.length}{" "}
                          fields
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button disabled={!service} onClick={() => setStep(1)} className="rounded-sm">
              Next — Application form
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      {step === 1 && service && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="border-border shadow-none rounded-sm">
            <CardHeader className="gap-1 border-b border-border bg-[#0b3d91] text-white">
              <CardTitle className="text-center text-base font-semibold uppercase tracking-wide text-white">
                {service.title}
              </CardTitle>
              <p className="text-center text-xs text-white/80">
                {service.official_form || service.portal.name}
                {service.fill_mode
                  ? ` · ${fillModeLabel(service.fill_mode)}`
                  : ""}
              </p>
              {formOcrNote ? (
                <p className="text-center text-xs text-amber-200">{formOcrNote}</p>
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
                <label className="flex cursor-pointer items-start gap-3 border border-border bg-muted/20 p-3 text-sm">
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

              <div className="flex flex-col gap-3 border border-dashed border-[#0b3d91]/35 bg-[#e8eef8]/60 p-4">
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
                    className="flex flex-wrap items-center gap-2 border border-border bg-card p-3"
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
                <Badge variant="outline" className="rounded-sm">
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
                        const elsewhere = extractions
                          .filter((d) => d !== activeDoc)
                          .map((d) => {
                            const v = d.fields[key] || "";
                            return !isUncertain(v)
                              ? `${d.doc_type}: ${v}`
                              : null;
                          })
                          .filter(Boolean) as string[];
                        return (
                          <div key={key} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor={`${reviewIdx}-${key}`}>{key}</Label>
                              {bad ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-sm border-status-uncertain/40 text-status-uncertain"
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
                            {!bad ? (
                              (() => {
                                const snip = ocrSnippet(activeDoc.ocr_text, val);
                                return snip ? (
                                  <p className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-[10px] leading-snug text-muted-foreground">
                                    <span className="font-sans font-medium text-foreground">
                                      Provenance ·{" "}
                                    </span>
                                    {snip}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground">
                                    Source: {activeDoc.doc_type}
                                    {activeDoc.source_file
                                      ? ` · ${activeDoc.source_file}`
                                      : ""}
                                  </p>
                                );
                              })()
                            ) : null}
                            {bad && elsewhere.length > 0 ? (
                              <p className="text-[11px] text-muted-foreground">
                                Not on this {activeDoc.doc_type}. Available on{" "}
                                {elsewhere.join(" · ")}. Verification will use the
                                best readable source (Aadhaar → PAN → …).
                              </p>
                            ) : bad ? (
                              <p className="text-[11px] text-muted-foreground">
                                Not printed / unreadable on this document — OK if
                                another ID has it.
                              </p>
                            ) : null}
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
                    Fill form from best OCR
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
          {impact ? (
            <div
              className={cn(
                "desk-notice",
                impact.ready
                  ? "border-l-status-match bg-status-match/5"
                  : "border-l-status-blocker bg-status-blocker/5"
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {impact.ready ? (
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-status-match" />
                  ) : (
                    <ShieldAlert className="mt-0.5 size-5 shrink-0 text-status-blocker" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {impact.ready
                        ? "Desk cleared — safe for portal pack"
                        : `${impact.caught} portal rejection risk(s) caught at the desk`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ~{impact.minutesSaved} min saved vs discovering this at{" "}
                      {result.service.portal.name}. Score {impact.score} ·{" "}
                      {impact.grade}
                      {judgeMode ? " · Judge demo fixtures" : ""}.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
                  <span className="border border-border bg-card px-2 py-1">
                    {impact.caught} blockers caught
                  </span>
                  <span className="inline-flex items-center gap-1 border border-border bg-card px-2 py-1">
                    <Clock className="size-3" />~{impact.minutesSaved} min
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="desk-panel overflow-hidden">
            <div className="desk-panel-head">Verification summary</div>
            <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
              {(
                [
                  ["match", "Matches", result.cross_document.summary.matches],
                  ["variant", "Variants", result.cross_document.summary.variants],
                  ["blocker", "Blockers", result.cross_document.summary.blockers],
                  [
                    "uncertain",
                    "Uncertain",
                    result.cross_document.summary.uncertain,
                  ],
                ] as const
              ).map(([status, label, value]) => (
                <div
                  key={status}
                  className="flex items-center justify-between bg-card px-4 py-3"
                >
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {value}
                    </p>
                  </div>
                  <StatusBadge status={status} />
                </div>
              ))}
            </div>
          </div>

          <div className="desk-panel overflow-hidden">
            <div className="desk-panel-head">
              <span>Knowledge score</span>
              <span className="border border-[#0b3d91]/25 bg-white px-2 py-0.5 text-xs font-semibold text-[#0b3d91]">
                {Math.round(result.knowledge.score)} · {result.knowledge.grade}
              </span>
            </div>
            <div className="flex flex-col gap-3 bg-card p-4 text-sm text-muted-foreground">
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
            </div>
          </div>

          <div className="desk-panel overflow-hidden">
            <div className="desk-panel-head">
              <span>Form ↔ best-source document</span>
            </div>
            <p className="border-b border-border bg-[#fafbfd] px-4 py-2 text-xs text-muted-foreground">
              Each field is checked against the highest-priority readable ID
              (Aadhaar → PAN → DL → …). Docs missing the field are ignored — not
              blockers.
            </p>
            <div className="divide-y divide-border bg-card">
              {result.form_verification.checks.map((c) => {
                const sourceDoc = extractions.find((d) => d.doc_type === c.doc_type);
                const snip = ocrSnippet(
                  sourceDoc?.ocr_text,
                  c.doc_value || undefined
                );
                return (
                  <div
                    key={c.form_key}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{c.label}</p>
                        {c.doc_type ? (
                          <span className="border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Best source: {c.doc_type}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Form: “{c.form_value}” · {c.doc_type || "—"}: “
                        {c.doc_value || "—"}”
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
                      {snip ? (
                        <p className="mt-1 border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] leading-snug text-muted-foreground">
                          <span className="font-sans font-medium text-foreground">
                            Provenance ·{" "}
                          </span>
                          {snip}
                        </p>
                      ) : null}
                      {c.other_sources && c.other_sources.length > 0 ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Also readable on: {c.other_sources.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge status={mapStatus(c.status)} />
                  </div>
                );
              })}
              {Object.keys(result.form_verification.approved_fields).length > 0 ? (
                <div className="bg-[#fafbfd] px-4 py-3 text-xs text-muted-foreground">
                  FORM-ONLY (no KYC source):{" "}
                  {Object.entries(result.form_verification.approved_fields)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" · ")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="desk-panel overflow-hidden">
            <div className="desk-panel-head">Cross-document</div>
            <div className="divide-y divide-border bg-card">
              {result.cross_document.comparisons
                .filter((c) => c.status !== "MATCH")
                .map((c, i) => (
                  <div
                    key={`${c.field}-${i}`}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between"
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
              {result.cross_document.comparisons.filter((c) => c.status !== "MATCH")
                .length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  No non-match comparisons.
                </p>
              ) : null}
            </div>
          </div>

          {result.remediation && (
            <div className="desk-notice">
              <p className="text-sm font-semibold text-[#0b3d91]">
                Priority remediation
              </p>
              <p className="mt-1 text-sm">
                {result.remediation.primary_doc
                  ? `Fix first: ${result.remediation.primary_doc}`
                  : "No critical blockers"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.remediation.how}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(3)} className="rounded-sm">
              <ArrowLeft data-icon="inline-start" />
              Back to review
            </Button>
            <Button onClick={() => setStep(5)} className="rounded-sm">
              Portal pack
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}

      {step === 5 && result && impact && (
        <div className="flex flex-col gap-4">
          <div className="desk-panel overflow-hidden">
            <div
              className={cn(
                "desk-panel-head",
                impact.ready ? "bg-[#e8f5e9] text-[#14532d]" : "bg-[#fff8e6] text-[#854d0e]"
              )}
            >
              <span className="inline-flex items-center gap-2">
                {impact.ready ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <ShieldAlert className="size-4" />
                )}
                {impact.ready ? "Portal pack ready" : "Portal pack with caveats"}
                {judgeMode ? (
                  <span className="border border-current/30 bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    Judge demo
                  </span>
                ) : null}
              </span>
              <span className="border border-current/25 bg-white/80 px-2 py-0.5 text-xs">
                {impact.score} · {impact.grade}
              </span>
            </div>
            <div className="border-b border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {impact.ready
                ? `Operator-reviewed OCR + form answers are packed for ${result.service.portal.name}. Download both PDFs, then open the portal.`
                : `Desk caught ${impact.caught} rejection risk(s) before ${result.service.portal.name} upload. Download the audit for the citizen file, or go back and remediate.`}
            </div>
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Blockers caught
                </p>
                <p className="text-2xl font-semibold tabular-nums">{impact.caught}</p>
                <p className="text-[11px] text-muted-foreground">
                  {impact.blockers} cross-doc · {impact.formBlockers} form
                </p>
              </div>
              <div className="bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Minutes saved
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  ~{impact.minutesSaved}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  vs portal rejection loop
                </p>
              </div>
              <div className="bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Variants / uncertain
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {impact.variants}
                  <span className="text-base text-muted-foreground">
                    {" "}
                    / {impact.uncertain}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Operator judgment still needed
                </p>
              </div>
            </div>
          </div>

          <div className="desk-panel overflow-hidden">
            <div className="desk-panel-head">Download portal documents</div>
            <div className="divide-y divide-border bg-card">
              <button
                type="button"
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
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-[#e8eef8] disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-semibold">Filled form PDF</p>
                  <p className="text-xs text-muted-foreground">
                    Block-letter / portal fields from reviewed answers — ready to
                    upload or print.
                  </p>
                </div>
                <Download className="mt-0.5 size-4 shrink-0 text-[#0b3d91]" />
              </button>
              <button
                type="button"
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
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-[#e8eef8] disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-semibold">Identity audit PDF</p>
                  <p className="text-xs text-muted-foreground">
                    MATCH / VARIANT / CRITICAL / UNCERTAIN trail + best-source
                    provenance for the desk file.
                  </p>
                </div>
                <Download className="mt-0.5 size-4 shrink-0 text-[#0b3d91]" />
              </button>
            </div>
          </div>

          <div className="desk-panel overflow-hidden">
            <div className="desk-panel-head">Operator notes</div>
            <div className="bg-card p-4">
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="rounded-sm"
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Included in the audit PDF
                {judgeMode ? " · Sanika judge fixtures" : ""}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {result.service.portal.url ? (
              <Button
                variant="secondary"
                className="rounded-sm"
                render={
                  <a
                    href={result.service.portal.url}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
                nativeButton={false}
              >
                Open {result.service.portal.name}
                <ExternalLink data-icon="inline-end" />
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => setStep(4)}
              className="rounded-sm"
            >
              <ArrowLeft data-icon="inline-start" />
              Back to verify
            </Button>
            <Button
              variant="ghost"
              className="rounded-sm"
              render={<Link href="/app" />}
              nativeButton={false}
            >
              Desk home
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
