"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyError, notifySuccess } from "@/lib/notify";
import { fmtDate, talentGet, talentPost, type InterviewRow } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Panel, Pill, TalentShell, useTalentOrg } from "./TalentShell";

const ONLY_FLAGGED_ID = "interviews-only-flagged";

function InterviewsBody() {
  const { orgId } = useTalentOrg();
  const [rows, setRows] = useState<InterviewRow[] | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const load = useCallback(() => {
    talentGet<InterviewRow[]>(`/interviews${onlyFlagged ? "?needs_recruiter=true" : ""}`)
      .then(setRows)
      .catch((e) => notifyError(e.message));
  }, [onlyFlagged]);

  useEffect(load, [load, orgId]);

  const reoffer = async (id: string) => {
    try {
      await talentPost(`/interviews/${id}/reschedule`, {});
      notifySuccess("New times offered to the candidate");
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  };

  const flagged = rows?.filter((r) => r.needs_recruiter).length ?? 0;
  return (
    <Panel
      title="Interviews"
      description="AI interviews the agent has scheduled. Flagged ones need you: a second reschedule, a second no-show, no free calendar time, or the candidate asked for a person."
      action={
        <div className="flex items-center gap-2">
          <Checkbox id={ONLY_FLAGGED_ID} checked={onlyFlagged} onCheckedChange={(v) => setOnlyFlagged(v === true)} />
          <Label htmlFor={ONLY_FLAGGED_ID} className="font-normal text-gray-600 dark:text-gray-300">
            Needs me{flagged && !onlyFlagged ? ` (${flagged})` : ""}
          </Label>
        </div>
      }
    >
      {rows === null ? (
        <div className="space-y-2" aria-label="Loading">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No interviews yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs uppercase tracking-wide hover:bg-transparent">
              <TableHead className="text-muted-foreground">Candidate</TableHead>
              <TableHead className="text-muted-foreground">Job</TableHead>
              <TableHead className="text-muted-foreground">When</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-right text-muted-foreground">Interview</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={cn(r.needs_recruiter && "bg-amber-50/60 dark:bg-amber-500/5")}>
                <TableCell className="py-2.5">
                  {["completed", "scored"].includes(r.status) ? (
                    <Link href={`/talent/interviews/${r.id}`} className="font-medium text-gray-900 hover:text-brand-600 dark:text-white">
                      {r.candidate ?? `Profile ${r.profile_id}`}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900 dark:text-white">{r.candidate ?? `Profile ${r.profile_id}`}</span>
                  )}
                  <div className="text-xs text-muted-foreground">{r.mode.replace("_", " ")}</div>
                </TableCell>
                <TableCell className="py-2.5">
                  <Link href={`/talent/jobs/${r.job_ref}`} className="text-gray-700 hover:text-brand-600 dark:text-gray-300">{r.job_title}</Link>
                </TableCell>
                <TableCell className="py-2.5 tabular-nums text-gray-600 dark:text-gray-300">
                  {r.completed_at ? fmtDate(r.completed_at, true) : r.scheduled_at ? fmtDate(r.scheduled_at, true) : "—"}
                </TableCell>
                <TableCell className="py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <Pill>{r.status}</Pill>
                    {r.needs_recruiter && <Pill tone="amber">needs you</Pill>}
                    {r.human_review_status === "pending" && <Pill tone="amber">review</Pill>}
                  </div>
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">{r.overall_score != null ? `${r.overall_score.toFixed(1)} / 5` : "—"}</TableCell>
                <TableCell className="py-2.5 text-right">
                  {r.needs_recruiter && ["no_show", "expired", "human_requested", "offered", "scheduled"].includes(r.status) && (
                    <Button variant="outline" onClick={() => reoffer(r.id)}>
                      <RefreshCw /> Offer new times
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

export default function InterviewsList() {
  return (
    <TalentShell title="Interviews" subtitle="Scheduling, no-shows and reviews.">
      <InterviewsBody />
    </TalentShell>
  );
}
