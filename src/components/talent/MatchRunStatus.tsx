"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, OctagonAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fmtDate, parseUtc, type MatchProgress, type TalentJob } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Pill } from "./TalentShell";

const STEPS: { key: MatchProgress["stage"]; label: string }[] = [
  { key: "queued", label: "Waiting for the background worker" },
  { key: "filtering", label: "Filtering the talent pool (skills, experience, location)" },
  { key: "ranking", label: "Ranking by similarity (embeddings)" },
  { key: "scoring", label: "Scoring the shortlist with Claude" },
];
const ORDER = ["queued", "filtering", "ranking", "scoring", "done"];

function percent(p: MatchProgress): number {
  switch (p.stage) {
    case "queued":
      return 4;
    case "filtering":
      return 12;
    case "ranking":
      return 25;
    case "scoring":
      return p.total ? 30 + Math.round((65 * (p.scored ?? 0)) / p.total) : 30;
    case "done":
      return 100;
    default:
      return 0;
  }
}

function since(iso?: string): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - parseUtc(iso).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Ticks once a second while a run is active, so the elapsed time moves. */
function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

/**
 * What a matching run is doing right now — or why it isn't running. Shown on
 * the job page while a run is queued or running, and after it ends.
 */
export function MatchRunStatus({ job }: { job: TalentJob }) {
  const s = job.settings;
  const p = s.match_progress;
  const active = s.match_status === "queued" || s.match_status === "running";
  useTick(active);
  if (!p && !s.match_status) return null;

  if (s.match_status === "failed") {
    return (
      <Alert variant="destructive">
        <OctagonAlert />
        <AlertTitle>Matching failed</AlertTitle>
        <AlertDescription>
          <p>{s.match_error || "The run stopped with an error."}</p>
          <p>Fix the cause and click Run matching again.</p>
        </AlertDescription>
      </Alert>
    );
  }
  if (s.match_status === "skipped") {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>Matching didn&apos;t run</AlertTitle>
        <AlertDescription>{s.match_error}</AlertDescription>
      </Alert>
    );
  }
  if (!active && s.match_status === "done") {
    if (p?.ai_error) {
      // Stays up until a run scores again: the ranking below has no AI scores.
      return (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Ranked without AI scores</AlertTitle>
          <AlertDescription>
            <p>{p.ai_error}</p>
            <p>Candidates are ordered by skills and similarity only. Run matching again once it&apos;s fixed.</p>
          </AlertDescription>
        </Alert>
      );
    }
    const recent = p?.finished_at && Date.now() - parseUtc(p.finished_at).getTime() < 10 * 60_000;
    if (!recent) return null;
    return (
      <Alert variant="success">
        <CheckCircle2 />
        <AlertTitle>Matching finished</AlertTitle>
        <AlertDescription>
          {p?.matches ?? 0} candidate{p?.matches === 1 ? "" : "s"} ranked from {p?.pool ?? 0} that passed the filter
          {p?.finished_at ? ` · ${fmtDate(p.finished_at, true)}` : ""}.
        </AlertDescription>
      </Alert>
    );
  }
  if (!active || !p) return null;

  const current = ORDER.indexOf(p.stage);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-brand-500" aria-hidden />
          Matching in progress
          <Pill>{s.match_status}</Pill>
        </CardTitle>
        <CardDescription>
          Started {since(p.started_at ?? p.requested_at)} ago · this page updates by itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={percent(p)} aria-label="Matching progress" className="[&>[data-slot=progress-indicator]]:bg-brand-500" />
        <ol className="space-y-2">
          {STEPS.map((step, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            const Icon = state === "done" ? CheckCircle2 : state === "active" ? Loader2 : Circle;
            let detail = "";
            if (step.key === "filtering" && p.pool != null) detail = `${p.pool} profiles passed`;
            if (step.key === "scoring" && p.total != null) detail = `${p.scored ?? 0} of ${p.total} scored`;
            return (
              <li key={step.key} className="flex items-start gap-2 text-sm">
                <Icon
                  aria-hidden
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    state === "done" && "text-emerald-600",
                    state === "active" && "animate-spin text-brand-500",
                    state === "todo" && "text-muted-foreground/50",
                  )}
                />
                <span className={cn(state === "todo" ? "text-muted-foreground" : "text-foreground")}>
                  {step.label}
                  {detail && <span className="ml-1.5 text-xs whitespace-nowrap text-muted-foreground">· {detail}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        {p.ai_error && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Claude can&apos;t score this run</AlertTitle>
            <AlertDescription>{p.ai_error}</AlertDescription>
          </Alert>
        )}
        {p.rerun_requested && (
          <p className="text-xs text-muted-foreground">The job changed during this run — another run follows it.</p>
        )}
        {job.stuck_hint && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Still waiting after a few minutes</AlertTitle>
            <AlertDescription>{job.stuck_hint}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
