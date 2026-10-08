"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { talentGet, type ShortlistRow } from "@/lib/talent";
import { Panel, Pill } from "./TalentShell";

/** Interviewed candidates in suggested order. A sort order only — it decides nothing. */
export function ShortlistPanel({ jobRef }: { jobRef: string }) {
  const [rows, setRows] = useState<ShortlistRow[]>([]);
  useEffect(() => {
    talentGet<ShortlistRow[]>(`/jobs/${jobRef}/shortlist`).then(setRows).catch(() => setRows([]));
  }, [jobRef]);
  if (rows.length === 0) return null;
  return (
    <Panel
      title="Shortlist order"
      description="Interviewed candidates, ordered by interview score (with your overrides), then match score, minus a small amount per risk flag. It's a reading order — submitting and closing are your calls."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Candidate</th>
              <th className="py-2 pr-3 text-right font-medium">Interview</th>
              <th className="py-2 pr-3 text-right font-medium">Match</th>
              <th className="py-2 pr-3 text-right font-medium">Risk flags</th>
              <th className="py-2 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.match_id} className="border-b border-gray-100 dark:border-white/5">
                <td className="py-2 pr-3 tabular-nums text-gray-500">{r.rank}</td>
                <td className="py-2 pr-3">
                  <Link href={`/talent/interviews/${r.interview_id}`} className="font-medium text-gray-900 hover:text-brand-600 dark:text-white">
                    {r.candidate ?? `Profile ${r.profile_id}`}
                  </Link>
                  <div className="text-xs text-gray-500">{r.current_designation}</div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.interview_score.toFixed(1)} / 5</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.ai_score ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.risk_flags}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    <Pill>{r.status}</Pill>
                    {!r.reviewed && <Pill tone="amber">review</Pill>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
