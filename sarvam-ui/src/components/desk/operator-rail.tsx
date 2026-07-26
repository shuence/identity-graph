"use client";

import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Service } from "@/lib/api/identitygraph";

const FILL_LABEL: Record<string, string> = {
  paper_block_letters: "Paper · block letters",
  paper_or_online: "Paper or online",
  assisted_counter: "CSC assisted",
  portal_identity: "Portal identity",
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
  const checklist = (service.operator?.operator_checklist || []).slice(0, 4);
  const rejections = (service.operator?.rejection_reasons || []).slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <div className="desk-panel overflow-hidden">
        <div className="desk-panel-head">Quick brief</div>
        <div className="flex flex-col gap-2 bg-card p-4 text-sm">
          {service.fill_mode ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Mode · </span>
              {FILL_LABEL[service.fill_mode] || service.fill_mode}
            </p>
          ) : null}
          {service.official_form ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Form · </span>
              {service.official_form}
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

      {checklist.length ? (
        <div className="desk-panel overflow-hidden">
          <div className="desk-panel-head">Checklist</div>
          <ul className="divide-y divide-border bg-card text-sm text-muted-foreground">
            {checklist.map((item) => (
              <li key={item} className="flex gap-2 px-4 py-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rejections.length ? (
        <div className="desk-panel overflow-hidden">
          <div className="desk-panel-head">Watch for</div>
          <ul className="divide-y divide-border bg-card text-sm text-muted-foreground">
            {rejections.map((item) => (
              <li key={item} className="px-4 py-2.5 leading-snug">
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
          {speakingField ? "Speaking…" : "Play first prompt"}
        </Button>
      ) : null}
    </div>
  );
}

export function fillModeLabel(mode?: string | null) {
  if (!mode) return "";
  return FILL_LABEL[mode] || mode.replaceAll("_", " ");
}
