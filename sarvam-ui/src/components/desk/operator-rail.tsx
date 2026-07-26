"use client";

import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="border-border bg-secondary/30 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-lg">Operator brief</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
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
            <p className="rounded-lg border border-border bg-card p-3 text-xs leading-relaxed text-foreground">
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
        </CardContent>
      </Card>

      {op?.operator_checklist?.length ? (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">Before you submit</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {op.operator_checklist.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {op?.rejection_reasons?.length ? (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">Common rejections</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {op.rejection_reasons.slice(0, 5).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive/80" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {onSpeak && service.form_fields[0] ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onSpeak(service.form_fields[0].key)}
        >
          <Volume2 data-icon="inline-start" />
          {speakingField
            ? `Playing: ${speakingField}`
            : "Play first-field Hindi prompt"}
        </Button>
      ) : null}

      {service.positioning?.stack ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {service.positioning.hackathon}
          <br />
          {service.positioning.stack}
        </p>
      ) : null}
    </div>
  );
}

export function fillModeLabel(mode?: string) {
  if (!mode) return "";
  return FILL_LABEL[mode] || mode.replaceAll("_", " ");
}
