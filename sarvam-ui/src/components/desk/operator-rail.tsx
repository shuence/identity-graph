"use client";

import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Service } from "@/lib/api/identitygraph";

const FILL_LABEL: Record<string, string> = {
  paper_block_letters: "Paper · block letters",
  paper_or_online: "Paper or online",
  assisted_counter: "CSC / counter assisted",
  portal_identity: "Portal · identity match",
};

export function OperatorRail({
  service,
  speakingField,
  onSpeak,
  busy,
}: {
  service: Service;
  speakingField?: string | null;
  onSpeak?: (fieldKey: string) => void;
  busy?: boolean;
}) {
  const op = service.operator;
  return (
    <div className="flex flex-col gap-4">
      <div className="desk-panel overflow-hidden">
        <div className="desk-panel-head">Operator brief</div>
        <div className="flex flex-col gap-3 bg-card p-4 text-sm text-muted-foreground">
          {service.fill_mode ? (
            <p>
              <span className="font-medium text-foreground">Mode: </span>
              {FILL_LABEL[service.fill_mode] || service.fill_mode}
            </p>
          ) : null}
          {service.official_form ? (
            <p>
              <span className="font-medium text-foreground">Form: </span>
              {service.official_form}
            </p>
          ) : null}
          <p>{service.why}</p>
          {op?.process_summary ? (
            <p className="border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
              {op.process_summary}
            </p>
          ) : null}
          {service.source_url ? (
            <a
              href={service.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Official source
            </a>
          ) : null}
        </div>
      </div>

      {op?.operator_checklist?.length ? (
        <div className="desk-panel overflow-hidden">
          <div className="desk-panel-head">Before you submit</div>
          <ul className="flex flex-col divide-y divide-border bg-card text-sm text-muted-foreground">
            {op.operator_checklist.map((item) => (
              <li key={item} className="flex gap-2 px-4 py-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {op?.rejection_reasons?.length ? (
        <div className="desk-panel overflow-hidden">
          <div className="desk-panel-head">Common rejection reasons</div>
          <ul className="flex flex-col divide-y divide-border bg-card text-sm text-muted-foreground">
            {op.rejection_reasons.slice(0, 6).map((item) => (
              <li key={item} className="px-4 py-2.5">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onSpeak && service.form_fields[0] ? (
        <Button
          variant="outline"
          className="rounded-lg"
          disabled={busy}
          onClick={() => onSpeak(service.form_fields[0].key)}
        >
          <Volume2 data-icon="inline-start" />
          {speakingField ? "Speaking…" : "Play first field prompt"}
        </Button>
      ) : null}

      {service.positioning?.stack ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {service.positioning.hackathon}
          {service.positioning.hackathon ? " · " : null}
          {service.positioning.stack}
        </p>
      ) : null}
    </div>
  );
}

export function fillModeLabel(mode?: string | null) {
  if (!mode) return "";
  return FILL_LABEL[mode] || mode.replaceAll("_", " ");
}
