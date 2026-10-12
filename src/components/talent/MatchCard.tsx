"use client";

import React, { useState } from "react";
import { AlertTriangle, Check, CircleHelp, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { notifyError } from "@/lib/notify";
import { DIMENSION_LABELS, fmtDate, talentPost, type MatchItem } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Pill } from "./TalentShell";

const MET_ICON = {
  yes: <Check aria-label="met" className="h-4 w-4 text-[#0ca30c]" />,
  no: <X aria-label="not met" className="h-4 w-4 text-[#d03b3b]" />,
  unclear: <CircleHelp aria-label="unclear" className="h-4 w-4 text-[#d98e00]" />,
};

function DimensionBars({ dims }: { dims: Record<string, number> }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-5">
      {Object.entries(DIMENSION_LABELS).map(([k, label]) => (
        <div key={k} title={`${label}: ${dims[k] ?? "—"} / 100`}>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{label}</span>
            <span className="tabular-nums text-gray-800 dark:text-gray-200">{dims[k] ?? "—"}</span>
          </div>
          <Progress
            value={Math.min(Math.max(dims[k] ?? 0, 0), 100)}
            aria-label={label}
            className="mt-1 h-1.5 bg-brand-50 dark:bg-brand-500/10 [&>[data-slot=progress-indicator]]:bg-brand-500 dark:[&>[data-slot=progress-indicator]]:bg-brand-400"
          />
        </div>
      ))}
    </div>
  );
}

export function MatchCard({ m, actions }: { m: MatchItem; actions?: React.ReactNode }) {
  const [rating, setRating] = useState(m.recruiter_rating);
  const [open, setOpen] = useState(false);
  const p = m.profile;

  const rate = async (relevant: boolean) => {
    const next = (relevant ? "relevant" : "not_relevant") as MatchItem["recruiter_rating"];
    const value = rating === next ? null : relevant;
    try {
      const r = await talentPost<{ recruiter_rating: MatchItem["recruiter_rating"] }>(`/matches/${m.id}/rating`, { relevant: value });
      setRating(r.recruiter_rating);
    } catch (e) {
      notifyError((e as Error).message);
    }
  };

  return (
    <Card role="article" className="gap-0 py-4 shadow-none">
      <CardContent className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Badge variant="secondary" className="h-11 w-11 shrink-0 flex-col gap-0.5 rounded-xl p-0">
              <span className="text-base font-semibold leading-none">{m.ai_score ?? "—"}</span>
              <span className="text-[10px] font-normal text-muted-foreground">#{m.rank}</span>
            </Badge>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-white">{p.name || `Profile ${m.profile_id}`}</span>
                <Pill>{p.verification_status}</Pill>
                {m.status !== "ranked" && <Pill>{m.status}</Pill>}
              </div>
              <div className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                {[p.current_designation, p.current_company].filter(Boolean).join(" at ") || "Role not stated"}
                {p.experience_years != null && ` · ${p.experience_years} yrs`}
                {p.city && ` · ${p.city}`}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {p.notice_period_days != null && `Notice ${p.notice_period_days} days · `}
                {p.expected_ctc != null && `Expects ${p.expected_ctc} LPA · `}
                {p.last_verified_at ? `Confirmed ${fmtDate(p.last_verified_at)}` : "Never confirmed by the candidate"}
              </div>
              {m.status_reason && m.ai_score == null && (
                <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Not scored: {m.status_reason.replace(/_/g, " ")} — review by hand.
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => rate(true)}
              aria-pressed={rating === "relevant"}
              title="Relevant"
              className={cn(
                "text-muted-foreground",
                rating === "relevant" &&
                  "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25",
              )}
            >
              <ThumbsUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => rate(false)}
              aria-pressed={rating === "not_relevant"}
              title="Not relevant"
              className={cn(
                "text-muted-foreground",
                rating === "not_relevant" &&
                  "bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-700 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25",
              )}
            >
              <ThumbsDown />
            </Button>
          </div>
        </div>

        {m.dimension_scores && (
          <div className="mt-4">
            <DimensionBars dims={m.dimension_scores} />
          </div>
        )}

        {m.must_haves && m.must_haves.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {m.must_haves.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">{MET_ICON[h.met] ?? MET_ICON.unclear}</span>
                <span className="text-gray-800 dark:text-gray-200">
                  {h.requirement}
                  {h.evidence && (
                    <span className="ml-1 text-muted-foreground">
                      — <q className="italic">{h.evidence}</q>
                      {!h.evidence_verified && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">(quote not found in the CV)</span>}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {(m.gaps?.length || m.risk_flags?.length) ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {m.gaps && m.gaps.length > 0 && (
              <div className="text-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gaps</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-gray-700 dark:text-gray-300">
                  {m.gaps.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            )}
            {m.risk_flags && m.risk_flags.length > 0 && (
              <div className="text-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Worth checking</div>
                <ul className="mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                  {m.risk_flags.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d98e00]" />
                      <span>{r.flag}{r.evidence ? ` — “${r.evidence}”` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        <Button
          type="button"
          variant="link"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="mt-3 h-auto px-0 py-0 text-xs font-normal text-muted-foreground hover:text-foreground"
        >
          {open ? "Hide" : "Show"} how this was scored
        </Button>
        {open && (
          <Card className="mt-2 gap-0 border-0 bg-muted/60 py-3 shadow-none">
            <CardContent className="space-y-1 px-3 text-xs text-gray-600 dark:text-gray-300">
              {m.strengths && m.strengths.length > 0 && (
                <div>Strengths: {m.strengths.map((s) => s.strength).join("; ")}</div>
              )}
              <div>
                Model {m.model ?? "—"} · prompt {m.prompt_version ?? "—"} · model&apos;s own score {m.model_score ?? "—"} · vector{" "}
                {m.vector_score ?? "—"} · stage 1 {m.stage1_score ?? "—"}
              </div>
              <div>Sent to the model (no name, contact, age, gender, religion, caste, address, nationality): {m.fields_sent?.join(", ") || "—"}</div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
