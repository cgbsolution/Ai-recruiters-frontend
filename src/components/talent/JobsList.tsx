"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyError } from "@/lib/notify";
import { fmtDate, pct, talentGet, type PrecisionReport, type TalentJobRow } from "@/lib/talent";
import { Panel, Pill, Stat, TalentShell, useTalentOrg } from "./TalentShell";

function JobsBody() {
  const { orgId } = useTalentOrg();
  const [jobs, setJobs] = useState<TalentJobRow[] | null>(null);
  const [precision, setPrecision] = useState<PrecisionReport | null>(null);

  useEffect(() => {
    Promise.all([talentGet<TalentJobRow[]>("/jobs"), talentGet<PrecisionReport>("/reports/precision")])
      .then(([j, p]) => {
        setJobs(j);
        setPrecision(p);
      })
      .catch((e) => notifyError(e.message));
  }, [orgId]);

  const open = jobs?.filter((j) => j.status === "Open") ?? [];
  const other = jobs?.filter((j) => j.status !== "Open") ?? [];

  const row = (j: TalentJobRow) => {
    const total = Object.values(j.matches).reduce((a, b) => a + b, 0);
    const pending = j.matches.approval_pending ?? 0;
    return (
      <Link
        key={j.id}
        href={`/talent/jobs/${j.ref}`}
        className="block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Card className="flex-row items-center justify-between gap-4 px-4 py-3 shadow-none transition-colors hover:bg-muted/50">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-gray-900 dark:text-white">{j.title}</span>
              {j.autonomy_mode && <Pill tone={j.autonomy_mode === "autopilot" ? "blue" : "gray"}>{j.autonomy_mode}</Pill>}
              {pending > 0 && <Pill tone="amber">{`${pending} awaiting approval`}</Pill>}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {j.location} · {total ? `${total} matches` : "not matched yet"}
              {j.last_matched_at ? ` · matched ${fmtDate(j.last_matched_at)}` : ""}
              {j.match_status === "running" || j.match_status === "queued" ? " · matching now…" : ""}
              {j.match_status === "failed" ? " · last run failed" : ""}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Card>
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <Panel
        title="Ranking quality"
        description="Rate the top 10 matches of a job as relevant or not; precision@10 is the share of the top 10 a recruiter judged relevant."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            label="Mean precision@10"
            value={precision?.mean_precision_at_10 != null ? pct(precision.mean_precision_at_10, 0) : "—"}
            hint={`${precision?.jobs_fully_rated ?? 0} job${precision?.jobs_fully_rated === 1 ? "" : "s"} fully rated`}
          />
          <Stat label="Jobs with ratings" value={precision?.jobs.length ?? 0} />
        </div>
        {precision && precision.jobs.length > 0 && (
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow className="text-xs uppercase tracking-wide hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Job</TableHead>
                  <TableHead className="text-right text-muted-foreground">Rated in top 10</TableHead>
                  <TableHead className="text-right text-muted-foreground">Relevant</TableHead>
                  <TableHead className="text-right text-muted-foreground">Precision@10</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {precision.jobs.map((j) => (
                  <TableRow key={j.job_id}>
                    <TableCell>
                      <Link className="text-brand-600 hover:underline dark:text-brand-400" href={`/talent/jobs/${j.ref}`}>{j.title}</Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{j.rated_in_top_10}</TableCell>
                    <TableCell className="text-right tabular-nums">{j.relevant_in_top_10}</TableCell>
                    <TableCell className="text-right tabular-nums">{j.precision_at_10 != null ? pct(j.precision_at_10, 0) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel title="Open jobs" description="Matching runs when a job is created or changed while the match loop is on, or when you ask.">
        {jobs === null ? (
          <div className="space-y-2" aria-label="Loading">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : open.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No open jobs.</p>
        ) : (
          <div className="space-y-2">{open.map(row)}</div>
        )}
      </Panel>
      {other.length > 0 && (
        <Panel title="Other jobs">
          <div className="space-y-2">{other.map(row)}</div>
        </Panel>
      )}
    </div>
  );
}

export default function JobsList() {
  return (
    <TalentShell title="Job matches" subtitle="Ranked candidates for each opening — the AI orders the list; you decide.">
      <JobsBody />
    </TalentShell>
  );
}
