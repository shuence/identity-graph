"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  PhoneOff,
  Radio,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  agentTurn,
  speakPrompt,
  transcribeAudio,
  type AgentTurnResult,
  type Service,
} from "@/lib/api/identitygraph";
import { cn } from "@/lib/utils";

type ChatMsg = {
  role: "agent" | "citizen" | "system";
  text: string;
};

type Mode = "idle" | "listening" | "thinking" | "speaking";

const SPEECH_RMS = 0.018;
const SILENCE_HANG_MS = 1800; // wait longer so names aren't cut off
const MAX_UTTERANCE_MS = 20000;
const NO_SPEECH_MS = 10000;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const prefs = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return prefs.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

/** Simple desk avatar — mouth animates while Sevak speaks / listens. */
function SevakAvatar({ mode, level }: { mode: Mode; level: number }) {
  const talking = mode === "speaking";
  const listening = mode === "listening";
  const thinking = mode === "thinking";
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!talking) return;
    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [talking]);

  const mouthOpen = talking
    ? 6 + Math.round((Math.sin(tick / 4) * 0.5 + 0.5) * 16)
    : listening
      ? 4 + Math.min(16, Math.round(level * 220))
      : 3;

  return (
    <div className="relative mt-2 flex flex-col items-center gap-2">
      <div
        className={cn(
          "relative flex size-36 items-center justify-center rounded-full border-4 bg-card transition-shadow md:size-44",
          talking && "border-[#0b3d91] shadow-[0_0_0_10px_rgba(11,61,145,0.12)]",
          listening &&
            "border-status-match shadow-[0_0_0_10px_rgba(21,128,61,0.12)]",
          thinking && "border-status-uncertain",
          mode === "idle" && "border-border"
        )}
      >
        <svg viewBox="0 0 120 120" className="size-[88%]" aria-hidden>
          <circle cx="60" cy="60" r="52" fill="#f3e7d9" />
          <path
            d="M18 58c4-28 22-42 42-42s38 14 42 42c-8-14-22-20-42-20S26 44 18 58z"
            fill="#1f2937"
          />
          <ellipse cx="42" cy="58" rx="5" ry={thinking ? 1.5 : 5} fill="#111827" />
          <ellipse cx="78" cy="58" rx="5" ry={thinking ? 1.5 : 5} fill="#111827" />
          <path d="M34 48h16" stroke="#111827" strokeWidth="2" strokeLinecap="round" />
          <path d="M70 48h16" stroke="#111827" strokeWidth="2" strokeLinecap="round" />
          <path d="M60 62v10" stroke="#c4a484" strokeWidth="2" strokeLinecap="round" />
          <ellipse
            cx="60"
            cy="88"
            rx={talking || listening ? 14 : 10}
            ry={Math.max(2, mouthOpen / 2)}
            fill={talking ? "#0b3d91" : "#7f1d1d"}
          />
          {talking ? (
            <ellipse
              cx="60"
              cy="88"
              rx="8"
              ry={Math.max(1, mouthOpen / 3.5)}
              fill="#1e3a8a"
            />
          ) : null}
        </svg>
        {thinking ? (
          <Loader2 className="absolute size-7 animate-spin text-status-uncertain" />
        ) : null}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#0b3d91]">
        Sevak · desk agent
      </p>
    </div>
  );
}

export function VoiceFormAgent({
  service,
  answers,
  apiLive,
  onAnswers,
  onRedirect,
  onClose,
}: {
  service: Service;
  answers: Record<string, string>;
  apiLive: boolean;
  onAnswers: (updates: Record<string, string>) => void;
  onRedirect?: (where: NonNullable<AgentTurnResult["redirect"]>) => void;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [conversing, setConversing] = useState(false);
  const [level, setLevel] = useState(0);
  const [lastAgentLine, setLastAgentLine] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<{
    field_key: string;
    value: string;
  } | null>(null);

  const convoRef = useRef(false);
  const answersRef = useRef(answers);
  const activeFieldRef = useRef<string | null>(null);
  const pendingRef = useRef<{ field_key: string; value: string } | null>(null);
  const messagesRef = useRef<ChatMsg[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    activeFieldRef.current = activeField;
  }, [activeField]);
  useEffect(() => {
    pendingRef.current = pendingConfirm;
  }, [pendingConfirm]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, mode]);

  const playReply = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!apiLive || !text.trim()) {
          resolve();
          return;
        }
        // Slower English voice so citizens can follow
        speakPrompt(text, "en-IN", { pace: 0.85 })
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            currentAudioRef.current = audio;
            const done = () => {
              URL.revokeObjectURL(url);
              if (currentAudioRef.current === audio) currentAudioRef.current = null;
              resolve();
            };
            audio.onended = done;
            audio.onerror = done;
            audio.play().catch(done);
          })
          .catch(() => resolve());
      }),
    [apiLive]
  );

  const processTranscript = useCallback(
    async (transcript: string): Promise<AgentTurnResult | null> => {
      const t = transcript.trim();
      if (t) setMessages((m) => [...m, { role: "citizen", text: t }]);
      const history = messagesRef.current
        .filter((m) => m.role !== "system")
        .slice(-8)
        .map((m) => ({
          role: m.role === "agent" ? "assistant" : "user",
          text: m.text,
        }));
      try {
        const result = await agentTurn({
          service_id: service.id,
          transcript: t,
          answers: answersRef.current,
          active_field: activeFieldRef.current,
          pending_confirm: pendingRef.current,
          history,
          use_llm: apiLive,
        });
        if (Object.keys(result.field_updates || {}).length) {
          onAnswers(result.field_updates);
          answersRef.current = { ...answersRef.current, ...result.field_updates };
          const filled = Object.entries(result.field_updates)
            .map(([k, v]) => `${k}=${v}`)
            .join(" · ");
          setMessages((m) => [
            ...m,
            { role: "system", text: `Saved after your YES: ${filled}` },
          ]);
        }
        const pending = result.pending_confirm || null;
        setPendingConfirm(pending);
        pendingRef.current = pending;
        setActiveField(result.active_field);
        activeFieldRef.current = result.active_field;
        const reply = result.reply_en || result.reply_hi;
        setLastAgentLine(reply);
        setMessages((m) => [...m, { role: "agent", text: reply }]);
        if (result.redirect && onRedirect) onRedirect(result.redirect);
        return result;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Agent failed");
        return null;
      }
    },
    [apiLive, onAnswers, onRedirect, service.id]
  );

  const listenForSpeech = useCallback((): Promise<Blob | null> => {
    const stream = streamRef.current;
    const ctx = audioCtxRef.current;
    if (!stream || !ctx) return Promise.resolve(null);

    return new Promise<Blob | null>((resolve) => {
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      let heardSpeech = false;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        cancelAnimationFrame(raf);
        try {
          source.disconnect();
        } catch {
          /* noop */
        }
        setLevel(0);
        if (!heardSpeech || !chunks.length) {
          resolve(null);
          return;
        }
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);

      const started = Date.now();
      let silenceStart = 0;
      let raf = 0;

      const finish = () => {
        stopListenRef.current = null;
        if (recorder.state !== "inactive") recorder.stop();
      };
      stopListenRef.current = finish;

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);
        const now = Date.now();
        if (rms > SPEECH_RMS) {
          heardSpeech = true;
          silenceStart = 0;
        } else if (heardSpeech) {
          if (!silenceStart) silenceStart = now;
          else if (now - silenceStart > SILENCE_HANG_MS) return finish();
        }
        if (now - started > MAX_UTTERANCE_MS) return finish();
        if (!heardSpeech && now - started > NO_SPEECH_MS) return finish();
        raf = requestAnimationFrame(tick);
      };

      recorder.start();
      raf = requestAnimationFrame(tick);
    });
  }, []);

  const stopConversation = useCallback(() => {
    convoRef.current = false;
    setConversing(false);
    stopListenRef.current?.();
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMode("idle");
    setLevel(0);
  }, []);

  const runCitizenTurn = useCallback(
    async (transcript: string) => {
      stopListenRef.current?.();
      setMode("thinking");
      const result = await processTranscript(transcript);
      if (result && (result.reply_en || result.reply_hi)) {
        setMode("speaking");
        await playReply(result.reply_en || result.reply_hi);
      }
      if (result?.redirect) {
        stopConversation();
        return result;
      }
      if (convoRef.current) setMode("listening");
      else setMode("idle");
      return result;
    },
    [playReply, processTranscript, stopConversation]
  );

  const conversationLoop = useCallback(async () => {
    while (convoRef.current) {
      setMode("listening");
      let blob: Blob | null = null;
      try {
        blob = await listenForSpeech();
      } catch {
        break;
      }
      if (!convoRef.current) break;
      if (!blob) continue;

      setMode("thinking");
      let transcript = "";
      try {
        const r = await transcribeAudio(blob, "codemix");
        transcript = (r.transcript || "").trim();
      } catch {
        continue;
      }
      if (!convoRef.current || !transcript) continue;

      const result = await processTranscript(transcript);
      if (!convoRef.current) break;

      if (result && (result.reply_en || result.reply_hi)) {
        setMode("speaking");
        await playReply(result.reply_en || result.reply_hi);
      }
      if (result?.redirect) {
        stopConversation();
        break;
      }
    }
    setMode("idle");
  }, [listenForSpeech, playReply, processTranscript, stopConversation]);

  const startConversation = useCallback(async () => {
    if (!apiLive) {
      toast.error(
        "Voice needs API_KEY in Sarvam_AI/.env (same key for Saaras + Bulbul). Typing still works."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = audioCtxRef.current || new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      toast.error("Microphone permission denied");
      return;
    }
    convoRef.current = true;
    setConversing(true);
    const line = lastAgentLine || messagesRef.current.find((m) => m.role === "agent")?.text;
    if (line) {
      setMode("speaking");
      await playReply(line);
    }
    void conversationLoop();
  }, [apiLive, conversationLoop, lastAgentLine, playReply]);

  // Boot greeting + auto-start voice when API is live.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    async function boot() {
      setMode("thinking");
      let greeting = "";
      try {
        const result = await agentTurn({
          service_id: service.id,
          transcript: "",
          answers: answersRef.current,
          active_field: null,
          history: [],
          use_llm: apiLive,
        });
        if (cancelled) return;
        setActiveField(result.active_field);
        activeFieldRef.current = result.active_field;
        greeting = result.reply_en || result.reply_hi;
        setLastAgentLine(greeting);
        setMessages([{ role: "agent", text: greeting }]);
        setPendingConfirm(result.pending_confirm || null);
        pendingRef.current = result.pending_confirm || null;
      } catch {
        if (cancelled) return;
        greeting =
          "Hello. No typing needed — press Start voice and answer each field, or type below.";
        setMessages([{ role: "agent", text: greeting }]);
      }
      if (cancelled) return;
      setMode("idle");

      if (!apiLive) return;

      // Open mic + speak first field question, then listen loop.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = audioCtxRef.current || new Ctx();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        convoRef.current = true;
        setConversing(true);
        if (greeting) {
          setMode("speaking");
          await playReply(greeting);
        }
        if (!cancelled && convoRef.current) void conversationLoop();
      } catch {
        toast.error(
          "Microphone permission needed for voice. You can still type answers below."
        );
      }
    }

    void boot();
    return () => {
      cancelled = true;
      stopConversation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  async function submitText() {
    const t = textInput.trim();
    if (!t || mode === "thinking" || mode === "speaking") return;
    setTextInput("");
    await runCitizenTurn(t);
  }

  const fields = service.form_fields;
  const filledCount = fields.filter((f) => (answers[f.key] || "").trim()).length;
  const activeLabel =
    fields.find((f) => f.key === activeField)?.label || activeField || "—";
  const activePrompt =
    fields.find((f) => f.key === activeField)?.prompt_en ||
    fields.find((f) => f.key === activeField)?.prompt_hi ||
    lastAgentLine;

  const statusText =
    mode === "listening"
      ? "Listening — please speak"
      : mode === "thinking"
        ? "Filling form…"
        : mode === "speaking"
          ? "Sevak is speaking…"
          : conversing
            ? "Connected"
            : "Ready";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f4f6f9]">
      <div className="desk-tricolor shrink-0" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-[#0b3d91] px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-wide">
            Sevak · Voice form · {service.title}
          </p>
          <p className="truncate text-[11px] text-white/75">
            English voice · one field at a time · same API_KEY in Sarvam_AI/.env
            (Saaras + Bulbul)
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden border border-white/30 bg-white/10 px-2 py-1 text-[11px] sm:inline">
            {filledCount}/{fields.length} fields
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-sm"
            onClick={() => {
              stopConversation();
              onClose?.();
            }}
          >
            <X data-icon="inline-start" />
            Close
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row md:p-6">
        {/* Field checklist */}
        <aside className="desk-panel flex max-h-48 shrink-0 flex-col overflow-hidden md:max-h-none md:w-72">
          <div className="desk-panel-head">Form fields</div>
          <ol className="flex-1 divide-y divide-border overflow-y-auto bg-card">
            {fields.map((f, i) => {
              const filled = Boolean((answers[f.key] || "").trim());
              const current = f.key === activeField;
              return (
                <li
                  key={f.key}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2.5 text-sm",
                    current && "bg-[#e8eef8]",
                    filled && !current && "bg-status-match/5"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center border text-[10px] font-semibold",
                      filled
                        ? "border-status-match bg-status-match text-white"
                        : current
                          ? "border-[#0b3d91] bg-[#0b3d91] text-white"
                          : "border-border bg-muted text-muted-foreground"
                    )}
                  >
                    {filled ? <CheckCircle2 className="size-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{f.label}</p>
                    {filled ? (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {answers[f.key]}
                      </p>
                    ) : pendingConfirm?.field_key === f.key ? (
                      <p className="text-[11px] text-status-uncertain">
                        Confirm: {pendingConfirm.value}
                      </p>
                    ) : current ? (
                      <p className="text-[11px] text-[#0b3d91]">Asking now…</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Pending</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Main voice stage */}
        <section className="desk-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="desk-panel-head">
            <span>Now asking</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px]",
                conversing
                  ? "border-status-match/40 bg-status-match/10 text-status-match"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  conversing ? "animate-pulse bg-status-match" : "bg-muted-foreground"
                )}
              />
              {statusText}
            </span>
          </div>

          <div className="flex flex-col items-center gap-3 border-b border-border bg-gradient-to-b from-[#e8eef8] to-card px-6 py-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0b3d91]">
              Field {Math.min(filledCount + 1, fields.length)} of {fields.length}
            </p>
            <h2 className="font-heading text-2xl font-semibold text-foreground md:text-3xl">
              {activeLabel}
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              {activePrompt}
            </p>

            <SevakAvatar mode={mode} level={level} />
            <p className="text-xs text-muted-foreground">
              {pendingConfirm
                ? "Please say YES to save, or NO to repeat — we will not move on until you confirm."
                : mode === "listening"
                  ? "Speak clearly. I wait ~2 seconds after you pause so I do not cut you off."
                  : mode === "speaking"
                    ? "Sevak is speaking — listen, then answer."
                    : apiLive
                      ? "English voice · same API_KEY in Sarvam_AI/.env"
                      : "API_KEY missing — typing still works below."}
            </p>

            {pendingConfirm ? (
              <div className="mt-2 w-full max-w-md border border-status-uncertain/40 bg-status-uncertain/10 px-4 py-3 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-status-uncertain">
                  Confirm before saving
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {pendingConfirm.value}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="rounded-sm"
                    disabled={mode === "thinking" || mode === "speaking"}
                    onClick={() => void runCitizenTurn("yes")}
                  >
                    Yes — save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-sm"
                    disabled={mode === "thinking" || mode === "speaking"}
                    onClick={() => void runCitizenTurn("no")}
                  >
                    No — say again
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            ref={scrollerRef}
            className="flex flex-1 flex-col gap-2 overflow-y-auto bg-card px-4 py-3"
          >
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}-${m.text.slice(0, 16)}`}
                className={cn(
                  "max-w-[92%] px-3 py-2 text-sm",
                  m.role === "citizen" &&
                    "ml-auto border border-[#0b3d91]/30 bg-[#e8eef8]",
                  m.role === "agent" && "border border-border bg-[#f7f9fc]",
                  m.role === "system" &&
                    "mx-auto border border-dashed border-border bg-muted/40 text-[11px] text-muted-foreground"
                )}
              >
                {m.role === "agent" ? (
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0b3d91]">
                    Sevak
                  </p>
                ) : null}
                <p>{m.text}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-border bg-[#f3f6fb] p-3">
            <div className="flex flex-wrap gap-2">
              {conversing ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-sm"
                  onClick={stopConversation}
                >
                  <PhoneOff data-icon="inline-start" />
                  Pause voice
                </Button>
              ) : (
                <Button
                  type="button"
                  className="rounded-sm"
                  disabled={mode === "thinking" || !apiLive}
                  onClick={() => void startConversation()}
                >
                  <Radio data-icon="inline-start" />
                  Start voice
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="rounded-sm"
                onClick={() => {
                  stopConversation();
                  onClose?.();
                }}
              >
                Back to typed form
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitText();
                }}
                placeholder="Type the answer if voice is unavailable…"
                className="rounded-sm"
                disabled={mode === "thinking"}
              />
              <Button
                type="button"
                className="rounded-sm"
                disabled={mode === "thinking" || !textInput.trim()}
                onClick={() => void submitText()}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
