"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <Table>
        <TableHeader>
          <TableRow className="text-xs uppercase tracking-wide hover:bg-transparent">
            <TableHead className="text-muted-foreground">#</TableHead>
            <TableHead className="text-muted-foreground">Candidate</TableHead>
            <TableHead className="text-right text-muted-foreground">Interview</TableHead>
            <TableHead className="text-right text-muted-foreground">Match</TableHead>
            <TableHead className="text-right text-muted-foreground">Risk flags</TableHead>
            <TableHead className="text-muted-foreground">State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.match_id}>
              <TableCell className="tabular-nums text-muted-foreground">{r.rank}</TableCell>
              <TableCell>
                <Link href={`/talent/interviews/${r.interview_id}`} className="font-medium text-gray-900 hover:text-brand-600 dark:text-white">
                  {r.candidate ?? `Profile ${r.profile_id}`}
                </Link>
                <div className="text-xs text-muted-foreground">{r.current_designation}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.interview_score.toFixed(1)} / 5</TableCell>
              <TableCell className="text-right tabular-nums">{r.ai_score ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{r.risk_flags}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Pill>{r.status}</Pill>
                  {!r.reviewed && <Pill tone="amber">review</Pill>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
