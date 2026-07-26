"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Car,
  CheckCircle2,
  Download,
  ExternalLink,
  FileScan,
  FileText,
  Fingerprint,
  IdCard,
  Landmark,
  Loader2,
  MessageSquareWarning,
  PenLine,
  Scale,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Vote,
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
  ocrDocAccuracy,
  overallAccuracy,
  perDocAccuracy,
} from "@/lib/desk/doc-accuracy";
import {
  OperatorRail,
  fillModeLabel,
} from "@/components/desk/operator-rail";
import { VoiceFormAgent } from "@/components/desk/voice-form-agent";
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
import { createCase, getCase, patchCase } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

function citizenFromAnswers(answers: Record<string, string>) {
  return (
    answers.full_name ||
    answers.applicant_name ||
    answers.name ||
    answers.citizen_name ||
    ""
  ).trim();
}

const STEPS = [
  "Service",
  "Form",
  "Docs",
  "Review",
  "Verify",
  "Pack",
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

const OCR_FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  father_name: "Father / guardian",
  dob: "Date of birth",
  address: "Address",
  id_number: "ID number",
};

function ocrFieldLabel(docType: string, key: string): string {
  if (key === "id_number") {
    if (docType === "PAN Card") return "PAN Number";
    if (docType === "Aadhaar Card") return "Aadhaar Number";
    if (docType === "Driving License") return "DL Number";
    if (docType === "Voter ID") return "EPIC Number";
    if (docType === "Bank Passbook") return "Account Number";
    if (docType === "Passport") return "Passport Number";
    if (docType === "Ration Card") return "Ration Card Number";
  }
  if (key === "father_name" && docType === "PAN Card") {
    return "Father's Name (on PAN)";
  }
  return OCR_FIELD_LABELS[key] || key;
}

/** Mirrors DOC_TYPES in Sarvam_AI/identitygraph/config.py */
const ALL_DOC_TYPES = [
  "Aadhaar Card",
  "PAN Card",
  "Voter ID",
  "Ration Card",
  "Bank Passbook",
  "School Certificate",
  "Driving License",
  "Passport",
  "Rejection letter",
  "Acknowledgement receipt",
  "Other",
] as const;

const MODE_CHIPS: { mode: string; label: string }[] = [
  { mode: "all", label: "All" },
  { mode: "paper_block_letters", label: "Paper" },
  { mode: "paper_or_online", label: "Hybrid" },
  { mode: "assisted_counter", label: "Counter" },
  { mode: "portal_identity", label: "Portal" },
];

function serviceIcon(category?: string | null) {
  const c = (category || "").toLowerCase();
  if (c.includes("aadhaar")) return Fingerprint;
  if (c.includes("transport") || c.includes("driving")) return Car;
  if (c.includes("scheme")) return Landmark;
  if (c.includes("grievance")) return MessageSquareWarning;
  if (c.includes("tax") || c.includes("pan")) return FileText;
  if (c.includes("election") || c.includes("voter")) return Vote;
  if (c.includes("passport")) return IdCard;
  if (c.includes("gazette") || c.includes("name")) return Scale;
  if (c.includes("certificate") || c.includes("birth")) return Building2;
  if (c.includes("ration") || c.includes("bank")) return Building2;
  return PenLine;
}

/** Soft accent class for category icon wells — scan-friendly, not rainbow. */
function serviceAccent(category?: string | null) {
  const c = (category || "").toLowerCase();
  if (c.includes("aadhaar")) return "accent-aadhaar";
  if (c.includes("transport") || c.includes("driving")) return "accent-transport";
  if (c.includes("scheme")) return "accent-scheme";
  if (c.includes("grievance")) return "accent-grievance";
  if (c.includes("tax") || c.includes("pan")) return "accent-pan";
  if (c.includes("election") || c.includes("voter")) return "accent-voter";
  if (c.includes("passport")) return "accent-passport";
  if (c.includes("gazette") || c.includes("name")) return "accent-gazette";
  return "accent-default";
}

function shortServiceTitle(title: string) {
  const cut = title.split(/\s[—–-]\s/)[0]?.trim();
  return cut || title;
}

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

export function DeskWizard({
  initialServiceId,
  initialCaseId,
}: {
  initialServiceId?: string;
  initialCaseId?: string;
}) {
  const router = useRouter();
  const [caseId, setCaseId] = useState<string | null>(initialCaseId || null);
  const persistReady = useRef(false);
  const creatingCase = useRef(false);
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
  const [voiceFullOpen, setVoiceFullOpen] = useState(false);
  const [modeFilter, setModeFilter] = useState<string>("all");

  const filteredServices = useMemo(() => {
    if (modeFilter === "all") return services;
    return services.filter((s) => s.fill_mode === modeFilter);
  }, [modeFilter, services]);

  const loadServices = useCallback(async () => {
    persistReady.current = false;
    try {
      const health = await fetchHealth();
      setBootError(null);
      const keyLoaded = Boolean(
        health.sarvam_key_loaded ?? health.sarvam_configured
      );
      setApiLive(keyLoaded);
      const data = await fetchServices();
      setServices(data);

      if (initialCaseId) {
        const c = await getCase(initialCaseId);
        setCaseId(c.id);
        const id =
          c.service_id ||
          initialServiceId ||
          data[0]?.id ||
          "link_mobile_aadhaar";
        setServiceId(id);
        setService(await fetchService(id));
        setStep(c.step || 0);
        setAnswers(c.answers || {});
        setExtractions((c.extractions || []) as Extraction[]);
        setResult((c.verify_result as VerifyResult) || null);
        setNotes(c.notes || "");
        setFormReviewed(Boolean(c.form_reviewed));
        setReviewed(Boolean(c.ocr_reviewed));
      } else {
        const id = initialServiceId || data[0]?.id || "link_mobile_aadhaar";
        setServiceId(id);
        setService(await fetchService(id));
      }
    } catch (e) {
      setApiLive(false);
      setBootError(
        e instanceof Error ? e.message : "Could not reach Sarvam_AI API on :8001."
      );
    } finally {
      setBusy(false);
      // ponytail: skip first paint so resume doesn't PATCH itself
      queueMicrotask(() => {
        persistReady.current = true;
      });
    }
  }, [initialCaseId, initialServiceId]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  // Auto-save desk state to FastAPI case store (Memory L3).
  useEffect(() => {
    if (!persistReady.current) return;
    const payload = {
      service_id: serviceId,
      citizen_label: citizenFromAnswers(answers) || null,
      step,
      answers,
      extractions,
      verify_result: result ?? undefined,
      notes,
      form_reviewed: formReviewed,
      ocr_reviewed: reviewed,
      status: step >= 4 && result ? "verified" : "draft",
    };
    const hasProgress =
      step > 0 ||
      Object.keys(answers).length > 0 ||
      extractions.length > 0 ||
      Boolean(result) ||
      notes.trim().length > 0;
    if (!caseId && !hasProgress) return;
    if (!caseId && creatingCase.current) return;

    const t = window.setTimeout(() => {
      if (!caseId) {
        creatingCase.current = true;
        void createCase(payload)
          .then((c) => {
            setCaseId(c.id);
            router.replace(`/app?case=${c.id}`);
          })
          .catch(() => {
            creatingCase.current = false;
          });
        return;
      }
      void patchCase(caseId, payload).catch(() => {
        /* ignore transient save errors */
      });
    }, 700);
    return () => window.clearTimeout(t);
  }, [
    caseId,
    serviceId,
    step,
    answers,
    extractions,
    result,
    notes,
    formReviewed,
    reviewed,
    router,
  ]);

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
        `Sample loaded · ${demo.citizen || "Sanika Chavan"}`
      );
      setUploads([]);
      setNotes(
        "RTO address update sample — blockers and variants are intentional."
      );
      const v = await verifyCase({
        service_id: id,
        form_answers: demo.form_answers,
        extractions: demo.extractions,
        operator_notes:
          "Desk caught identity mismatches before portal upload.",
      });
      setResult(v);
      setStep(4);
      toast.success(
        `Ready · ${Math.round(v.knowledge.score)} · ${v.knowledge.grade}`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Demo failed");
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
    // Only high-stakes fields are compulsory; optional ones can stay blank.
    const required = service.form_fields.filter((f) => f.high_stakes);
    const check = required.length ? required : service.form_fields;
    return check.every((f) => (answers[f.key] || "").trim());
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
          variant="desk"
          title="Suvidha Desk"
          description="Connect Sarvam_AI for live Vision OCR."
        />
        <Card className="border-status-blocker/30 bg-status-blocker/5">
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-foreground">{bootError}</p>
            <pre className="overflow-x-auto border border-border bg-muted/30 p-3 font-mono text-xs">
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
      {voiceFullOpen && service ? (
        <VoiceFormAgent
          service={service}
          answers={answers}
          apiLive={apiLive}
          onAnswers={(updates) => {
            setFormReviewed(false);
            setAnswers((prev) => ({ ...prev, ...updates }));
          }}
          onClose={() => setVoiceFullOpen(false)}
          onRedirect={(where) => {
            if (where === "review_form") {
              toast.success(
                "Voice capture complete — review and edit the form if anything is wrong"
              );
              setFormReviewed(false);
              setVoiceFullOpen(false);
              setStep(1);
            } else if (where === "upload_docs") {
              toast.success("Form ready — continue to document upload when reviewed");
              setFormReviewed(false);
              setVoiceFullOpen(false);
              setStep(1);
            } else if (where === "verify") {
              setVoiceFullOpen(false);
              setStep(3);
            }
          }}
        />
      ) : null}

      <PageHeader
        variant="desk"
        title="Suvidha Desk"
        description={
          service
            ? shortServiceTitle(service.title)
            : "Pick a service to start"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void runJudgeDemo()}
              className="rounded-lg"
            >
              {busy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              Quick demo
            </Button>
            <Badge
              variant="secondary"
              className={cn(
                "rounded-full",
                apiLive
                  ? "border-status-match/40 bg-status-match/10 text-status-match"
                  : "border-status-uncertain/40 text-status-uncertain"
              )}
            >
              {apiLive ? "Live" : "Offline"}
            </Badge>
          </div>
        }
      />

      <nav
        aria-label="Desk steps"
        className="desk-panel bg-card p-1.5"
      >
        <ol className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={label} className="min-w-0">
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
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors",
                    current && "desk-step-current",
                    done && !current && "desk-step-done",
                    !done &&
                      !current &&
                      "bg-transparent text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      current
                        ? "border-white/40 bg-white/15 text-white"
                        : done
                          ? "border-primary/30 bg-background text-primary"
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
        <div className="flex flex-col gap-4">
          <div className="desk-catalog-hero">
            <div className="desk-catalog-hero-copy">
              <p className="desk-catalog-kicker">Service catalog</p>
              <h2 className="desk-catalog-title">What is the citizen here for?</h2>
              <ol className="desk-pipeline" aria-label="What happens next">
                <li>
                  <span className="desk-pipeline-num">1</span>
                  Form
                </li>
                <li aria-hidden className="desk-pipeline-sep" />
                <li>
                  <span className="desk-pipeline-num">2</span>
                  Docs
                </li>
                <li aria-hidden className="desk-pipeline-sep" />
                <li>
                  <span className="desk-pipeline-num">3</span>
                  Verify
                </li>
                <li aria-hidden className="desk-pipeline-sep" />
                <li>
                  <span className="desk-pipeline-num">4</span>
                  Pack
                </li>
              </ol>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runJudgeDemo()}
              className="desk-judge-card"
            >
              <span className="desk-judge-card-icon" aria-hidden>
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Sparkles className="size-5" />
                )}
              </span>
              <span className="desk-judge-card-body">
                <span className="desk-judge-card-title">Quick demo</span>
                <span className="desk-judge-card-sub">
                  RTO address update · sample pack
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 opacity-70" aria-hidden />
            </button>
          </div>

          <div className="desk-mode-chips" role="tablist" aria-label="Filter services">
            {MODE_CHIPS.map((chip) => {
              const count =
                chip.mode === "all"
                  ? services.length
                  : services.filter((s) => s.fill_mode === chip.mode).length;
              if (chip.mode !== "all" && count === 0) return null;
              const on = modeFilter === chip.mode;
              return (
                <button
                  key={chip.mode}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setModeFilter(chip.mode)}
                  className={cn("desk-mode-chip", on && "is-active")}
                >
                  {chip.label}
                  <span className="desk-mode-chip-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="desk-service-grid">
            {filteredServices.map((s) => {
              const on = s.id === serviceId;
              const Icon = serviceIcon(s.category);
              const title = shortServiceTitle(s.title);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void selectService(s.id)}
                  className={cn(
                    "desk-service-tile",
                    serviceAccent(s.category),
                    on && "is-selected"
                  )}
                >
                  <span className="desk-service-tile-top">
                    <span className="desk-service-tile-icon" aria-hidden>
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    {on ? (
                      <span className="desk-service-check" aria-label="Selected">
                        <CheckCircle2 className="size-4" />
                      </span>
                    ) : null}
                  </span>
                  <span className="desk-service-tile-cat">
                    {s.category || "Service"}
                  </span>
                  <span className="desk-service-tile-title">{title}</span>
                  <span className="desk-service-tile-meta">
                    <span className="desk-meta-pill">{s.required_docs.length} docs</span>
                    <span className="desk-meta-pill">{s.form_fields.length} fields</span>
                  </span>
                </button>
              );
            })}
          </div>

          {service ? (
            <div className="desk-catalog-footer">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "desk-service-tile-icon is-footer",
                    serviceAccent(service.category)
                  )}
                  aria-hidden
                >
                  {(() => {
                    const Icon = serviceIcon(service.category);
                    return <Icon className="size-5" strokeWidth={1.75} />;
                  })()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {shortServiceTitle(service.title)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {service.required_docs.slice(0, 2).join(" · ")}
                    {service.required_docs.length > 2
                      ? ` +${service.required_docs.length - 2}`
                      : ""}
                  </p>
                </div>
              </div>
              <Button
                disabled={!service}
                onClick={() => setStep(1)}
                className="shrink-0 rounded-lg"
              >
                Continue
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Tap a service tile to continue
            </p>
          )}
        </div>
      )}

      {step === 1 && service && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Card>
            <CardHeader className="gap-1 text-center">
              <CardTitle className="uppercase tracking-wide">
                {service.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {service.official_form || service.portal.name}
                {service.fill_mode
                  ? ` · ${fillModeLabel(service.fill_mode)}`
                  : ""}
              </p>
              {formOcrNote ? (
                <p className="text-xs text-status-uncertain">{formOcrNote}</p>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {service.form_fields.map((field) => (
                <div
                  key={field.key}
                  className={cn(
                    "flex flex-col gap-2 border border-transparent p-1",
                    speakingField === field.key && "border-primary/40 bg-secondary/40"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Label
                      htmlFor={field.key}
                      className="flex-1"
                      title={field.operator_tip || undefined}
                    >
                      {field.label}
                      {field.high_stakes ? " *" : ""}
                    </Label>
                    {field.high_stakes ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Critical
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
                </div>
              ))}

              {formComplete ? (
                <label className="flex cursor-pointer items-center gap-3 border border-border bg-muted/20 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={formReviewed}
                    onChange={(e) => setFormReviewed(e.target.checked)}
                  />
                  <span>Reviewed — ready for docs</span>
                </label>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileScan className="size-4" />
                  Scan filled form
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Scan the filled form — OCR fills the fields.
                </p>
                <div className="desk-upload">
                  <input
                    type="file"
                    accept={SCAN_ACCEPT}
                    className="block w-full cursor-pointer text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
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
                </div>
              </CardContent>
            </Card>

            <div className="desk-notice flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-foreground">
                <span className="font-semibold text-primary">Voice · </span>
                Citizen can&apos;t type? Use full-screen voice form.
              </p>
              <Button
                className="shrink-0 rounded-lg"
                onClick={() => setVoiceFullOpen(true)}
              >
                <Volume2 data-icon="inline-start" />
                Voice form
              </Button>
            </div>

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
                    ? "Next — docs"
                    : "Review first"
                  : "Skip to docs"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && service && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Upload documents for OCR
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Required: {service.required_docs.join(", ")}
                {!apiLive ? (
                  <span className="text-status-uncertain">
                    {" "}
                    · API offline — set API_KEY to run OCR
                  </span>
                ) : null}
              </p>

              <div className="desk-upload">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="docs">Add scans (multi OK)</Label>
                    <input
                      id="docs"
                      type="file"
                      accept={SCAN_ACCEPT}
                      multiple
                      className="block w-full max-w-md cursor-pointer text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
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
                      {Array.from(
                        new Set([
                          ...service.required_docs,
                          ...service.optional_docs,
                          ...ALL_DOC_TYPES,
                        ])
                      ).map((d) => (
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
            <Card>
              <CardContent className="text-sm text-muted-foreground">
                No OCR results yet. Upload documents and run Sarvam Vision first.
                <div className="mt-4">
                  <Button onClick={() => setStep(2)}>Go to OCR upload</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {extractions.map((doc, i) => {
                  const ocr = ocrDocAccuracy(doc);
                  return (
                    <button
                      key={`ocr-acc-${doc.doc_type}-${i}`}
                      type="button"
                      onClick={() => setReviewIdx(i)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        i === reviewIdx
                          ? "border-primary bg-secondary"
                          : "border-border bg-card hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">
                          {doc.doc_type}
                        </p>
                        <p
                          className={cn(
                            "shrink-0 font-heading text-lg font-semibold tabular-nums",
                            ocr.ocrPct >= 80
                              ? "text-status-match"
                              : ocr.ocrPct >= 50
                                ? "text-status-variant"
                                : "text-status-uncertain"
                          )}
                        >
                          {ocr.ocrPct}%
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        OCR · {ocr.ocrReadable}/{ocr.ocrExpected} fields
                        {ocr.ocrUnsure.length
                          ? ` · missing ${ocr.ocrUnsure.join(", ")}`
                          : ""}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-lg">
                  {uncertainCount} unsure field(s)
                </Badge>
              </div>

              {activeDoc && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fields</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {activeDoc.doc_type}
                        {activeDoc.handwritten ? " · handwritten" : ""}
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
                              <Label htmlFor={`${reviewIdx}-${key}`}>
                                {ocrFieldLabel(activeDoc.doc_type, key)}
                              </Label>
                              {bad ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-lg border-status-uncertain/40 text-status-uncertain"
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
                            {!bad ? null : elsewhere.length > 0 ? (
                              <p className="text-[11px] text-muted-foreground">
                Also on: {elsewhere.join(" · ")}
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                Unreadable here — OK if another ID has it.
                              </p>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex flex-col gap-1.5">
                        <Label>Notes</Label>
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

                  <Card>
                    <CardHeader>
                      <CardTitle>OCR source</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                        {activeDoc.ocr_text || "(empty)"}
                      </pre>
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
          {(() => {
            const summary = result.cross_document.summary;
            const docScores = perDocAccuracy(
              extractions,
              result.cross_document.comparisons,
              result.form_verification.checks
            );
            const accuracy = overallAccuracy(docScores);
            const blockers = [
              ...result.cross_document.comparisons.filter(
                (c) => c.status === "CRITICAL"
              ),
              ...result.form_verification.checks
                .filter((c) => c.status === "CRITICAL")
                .map((c) => ({
                  field: c.label,
                  doc_a: "Form",
                  doc_b: c.doc_type || "—",
                  value_a: c.form_value,
                  value_b: c.doc_value || "—",
                  status: c.status,
                  detail: c.detail,
                })),
            ];
            const variants = result.cross_document.comparisons.filter(
              (c) => c.status === "VARIANT" || c.status === "UNCERTAIN"
            );
            const formOk = result.form_verification.checks.filter(
              (c) => c.status === "MATCH" || c.status === "VARIANT"
            );
            const formRisk = result.form_verification.checks.filter(
              (c) => c.status === "CRITICAL" || c.status === "UNCERTAIN"
            );

            return (
              <>
                {/* Overall + counts */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="desk-panel flex flex-col justify-between gap-2 bg-card p-4 sm:col-span-2 lg:col-span-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Overall
                    </p>
                    <p className="font-heading text-4xl font-semibold tabular-nums text-foreground">
                      {accuracy}
                      <span className="text-lg text-muted-foreground">%</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg across {docScores.length} docs ·{" "}
                      {Math.round(result.knowledge.score)} KB
                      {judgeMode ? " · demo" : ""}
                    </p>
                  </div>
                  {(
                    [
                      [
                        "blocker",
                        "Risks",
                        summary.blockers,
                        "text-status-blocker",
                        "border-status-blocker/30 bg-status-blocker/5",
                      ],
                      [
                        "match",
                        "Match",
                        summary.matches,
                        "text-status-match",
                        "border-status-match/30 bg-status-match/5",
                      ],
                      [
                        "variant",
                        "Variant",
                        summary.variants,
                        "text-status-variant",
                        "border-status-variant/30 bg-status-variant/5",
                      ],
                      [
                        "uncertain",
                        "Unsure",
                        summary.uncertain,
                        "text-status-uncertain",
                        "border-status-uncertain/40 bg-status-uncertain/5",
                      ],
                    ] as const
                  ).map(([key, label, value, color, box]) => (
                    <div
                      key={key}
                      className={cn(
                        "desk-panel flex flex-col justify-between gap-2 border p-4",
                        box
                      )}
                    >
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      <p
                        className={cn(
                          "font-heading text-3xl font-semibold tabular-nums",
                          color
                        )}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Per-document accuracy */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-heading text-base font-semibold">
                    Accuracy per document
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {docScores.map((d, i) => (
                      <div
                        key={`${d.docType}-${i}`}
                        className={cn(
                          "rounded-xl border bg-card p-4",
                          d.blocker > 0
                            ? "border-status-blocker/35"
                            : d.overallPct >= 85
                              ? "border-status-match/30"
                              : "border-border"
                        )}
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {d.docType}
                            </p>
                            {d.sourceFile ? (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {d.sourceFile}
                              </p>
                            ) : null}
                          </div>
                          <p
                            className={cn(
                              "font-heading text-2xl font-semibold tabular-nums",
                              d.overallPct >= 85
                                ? "text-status-match"
                                : d.overallPct >= 60
                                  ? "text-status-variant"
                                  : "text-status-blocker"
                            )}
                          >
                            {d.overallPct}
                            <span className="text-sm">%</span>
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              OCR fill
                            </p>
                            <p className="font-semibold tabular-nums">
                              {d.ocrPct}%
                              <span className="ml-1 font-normal text-muted-foreground">
                                {d.ocrReadable}/{d.ocrExpected}
                              </span>
                            </p>
                          </div>
                          <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Verify
                            </p>
                            <p className="font-semibold tabular-nums">
                              {d.verifyPct == null ? "—" : `${d.verifyPct}%`}
                              {d.verifyTotal > 0 ? (
                                <span className="ml-1 font-normal text-muted-foreground">
                                  {d.verifyTotal} checks
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                          {d.match > 0 ? (
                            <span className="rounded-full bg-status-match/10 px-2 py-0.5 text-status-match">
                              {d.match} match
                            </span>
                          ) : null}
                          {d.variant > 0 ? (
                            <span className="rounded-full bg-status-variant/10 px-2 py-0.5 text-status-variant">
                              {d.variant} variant
                            </span>
                          ) : null}
                          {d.blocker > 0 ? (
                            <span className="rounded-full bg-status-blocker/10 px-2 py-0.5 text-status-blocker">
                              {d.blocker} risk
                            </span>
                          ) : null}
                          {d.unsure > 0 ? (
                            <span className="rounded-full bg-status-uncertain/15 px-2 py-0.5 text-status-uncertain">
                              {d.unsure} unsure
                            </span>
                          ) : null}
                          {d.ocrUnsure.length > 0 ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                              OCR miss: {d.ocrUnsure.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Risks first */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-heading text-base font-semibold">
                      Risks to fix
                    </h3>
                    {result.remediation?.primary_doc ? (
                      <span className="rounded-full border border-status-blocker/30 bg-status-blocker/10 px-2.5 py-1 text-xs font-medium text-status-blocker">
                        Fix · {result.remediation.primary_doc}
                      </span>
                    ) : blockers.length === 0 ? (
                      <span className="rounded-full border border-status-match/30 bg-status-match/10 px-2.5 py-1 text-xs font-medium text-status-match">
                        No blockers
                      </span>
                    ) : null}
                  </div>

                  {blockers.length === 0 ? (
                    <div className="rounded-xl border border-status-match/25 bg-status-match/5 px-4 py-6 text-center text-sm text-status-match">
                      Clear — no critical mismatches
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {blockers.map((c, i) => (
                        <div
                          key={`${c.field}-${i}`}
                          className="rounded-xl border border-status-blocker/35 bg-status-blocker/5 p-4"
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold capitalize text-foreground">
                              {c.field.replaceAll("_", " ")}
                            </p>
                            <StatusBadge status="blocker" className="shrink-0" />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {c.doc_a} ↔ {c.doc_b}
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg border border-border bg-card px-2.5 py-2">
                              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {c.doc_a}
                              </p>
                              <p className="leading-snug text-foreground">
                                {c.value_a}
                              </p>
                            </div>
                            <div className="rounded-lg border border-border bg-card px-2.5 py-2">
                              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {c.doc_b}
                              </p>
                              <p className="leading-snug text-foreground">
                                {c.value_b}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form fields grid */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-heading text-base font-semibold">
                    Form fields
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {[...formRisk, ...formOk].map((c) => {
                      const st = mapStatus(c.status);
                      return (
                        <div
                          key={c.form_key}
                          className={cn(
                            "rounded-xl border bg-card p-3",
                            st === "blocker" &&
                              "border-status-blocker/35 bg-status-blocker/5",
                            st === "uncertain" &&
                              "border-status-uncertain/40 bg-status-uncertain/5",
                            st === "variant" && "border-status-variant/30",
                            st === "match" && "border-border"
                          )}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">
                              {c.label}
                            </p>
                            <StatusBadge status={st} className="shrink-0" />
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.form_value || "—"}
                          </p>
                          {c.doc_type ? (
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              via {c.doc_type}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Variants — compact, secondary */}
                {variants.length > 0 ? (
                  <details className="group rounded-xl border border-border bg-card open:pb-3">
                    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-2">
                        <span>
                          Harmless variants{" "}
                          <span className="text-muted-foreground">
                            ({variants.length})
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground group-open:hidden">
                          Show
                        </span>
                        <span className="hidden text-xs text-muted-foreground group-open:inline">
                          Hide
                        </span>
                      </span>
                    </summary>
                    <div className="grid gap-2 px-3 sm:grid-cols-2">
                      {variants.map((c, i) => (
                        <div
                          key={`${c.field}-v-${i}`}
                          className="rounded-lg border border-status-variant/25 bg-status-variant/5 px-3 py-2.5"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-xs font-medium capitalize">
                              {c.field.replaceAll("_", " ")}
                            </p>
                            <StatusBadge
                              status={mapStatus(c.status)}
                              className="shrink-0"
                            />
                          </div>
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {c.doc_a} ↔ {c.doc_b}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                {impact ? (
                  <p className="text-center text-xs text-muted-foreground">
                    ~{impact.minutesSaved} min saved ·{" "}
                    {result.service.portal.name}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep(3)}
                    className="rounded-lg"
                  >
                    <ArrowLeft data-icon="inline-start" />
                    Back
                  </Button>
                  <Button onClick={() => setStep(5)} className="rounded-lg">
                    {blockers.length ? "Pack anyway" : "Portal pack"}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {step === 5 && result && impact && (
        <div className="flex flex-col gap-4">
          <div className="desk-panel overflow-hidden">
            <div
              className={cn(
                "desk-panel-head",
                impact.ready
                  ? "bg-status-match/15 text-status-match"
                  : "bg-status-uncertain/15 text-status-uncertain"
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
                    Sample
                  </span>
                ) : null}
              </span>
              <span className="border border-current/25 bg-white/80 px-2 py-0.5 text-xs">
                {impact.score} · {impact.grade}
              </span>
            </div>
            <div className="border-b border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {impact.ready
                ? `Ready for ${result.service.portal.name} — download the pack.`
                : `${impact.caught} risk(s) before ${result.service.portal.name}. Download audit or remediate.`}
            </div>
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Blockers caught
                </p>
                <p className="text-2xl font-semibold tabular-nums">{impact.caught}</p>
                <p className="text-[11px] text-muted-foreground">
                  {impact.blockers} cross · {impact.formBlockers} form
                </p>
              </div>
              <div className="bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Time saved
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  ~{impact.minutesSaved}m
                </p>
              </div>
              <div className="bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Variants / unsure
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {impact.variants}
                  <span className="text-base text-muted-foreground">
                    {" "}
                    / {impact.uncertain}
                  </span>
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
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-secondary disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-semibold">Filled form PDF</p>
                  <p className="text-xs text-muted-foreground">
                    Block-letter / portal fields from reviewed answers — ready to
                    upload or print.
                  </p>
                </div>
                <Download className="mt-0.5 size-4 shrink-0 text-primary" />
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
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-secondary disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-semibold">Identity audit PDF</p>
                  <p className="text-xs text-muted-foreground">
                    MATCH / VARIANT / CRITICAL / UNCERTAIN trail + best-source
                    provenance for the desk file.
                  </p>
                </div>
                <Download className="mt-0.5 size-4 shrink-0 text-primary" />
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
                className="rounded-lg"
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
                className="rounded-lg"
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
              className="rounded-lg"
            >
              <ArrowLeft data-icon="inline-start" />
              Back to verify
            </Button>
            <Button
              variant="ghost"
              className="rounded-lg"
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
