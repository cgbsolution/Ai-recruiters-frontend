"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";
import { fmtDate, talentGet, talentPost, type InterviewRow } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Panel, Pill, TalentShell, quietButton, useTalentOrg } from "./TalentShell";

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
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          Needs me{flagged && !onlyFlagged ? ` (${flagged})` : ""}
        </label>
      }
    >
      {rows === null ? (
        <p className="py-6 text-center text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No interviews yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                <th className="py-2 pr-4 font-medium">Candidate</th>
                <th className="py-2 pr-4 font-medium">Job</th>
                <th className="py-2 pr-4 font-medium">When</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 text-right font-medium">Interview</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn("border-b border-gray-100 dark:border-white/5", r.needs_recruiter && "bg-amber-50/60 dark:bg-amber-500/5")}>
                  <td className="py-2.5 pr-4">
                    {["completed", "scored"].includes(r.status) ? (
                      <Link href={`/talent/interviews/${r.id}`} className="font-medium text-gray-900 hover:text-brand-600 dark:text-white">
                        {r.candidate ?? `Profile ${r.profile_id}`}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-900 dark:text-white">{r.candidate ?? `Profile ${r.profile_id}`}</span>
                    )}
                    <div className="text-xs text-gray-500">{r.mode.replace("_", " ")}</div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Link href={`/talent/jobs/${r.job_ref}`} className="text-gray-700 hover:text-brand-600 dark:text-gray-300">{r.job_title}</Link>
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-gray-600 dark:text-gray-300">
                    {r.completed_at ? fmtDate(r.completed_at, true) : r.scheduled_at ? fmtDate(r.scheduled_at, true) : "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex flex-wrap gap-1">
                      <Pill>{r.status}</Pill>
                      {r.needs_recruiter && <Pill tone="amber">needs you</Pill>}
                      {r.human_review_status === "pending" && <Pill tone="amber">review</Pill>}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.overall_score != null ? `${r.overall_score.toFixed(1)} / 5` : "—"}</td>
                  <td className="py-2.5 text-right">
                    {r.needs_recruiter && ["no_show", "expired", "human_requested", "offered", "scheduled"].includes(r.status) && (
                      <Button className={quietButton} variant="outline" onClick={() => reoffer(r.id)}>
                        <RefreshCw /> Offer new times
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
