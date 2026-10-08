"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notifyError, notifySuccess } from "@/lib/notify";
import { fmtDate, talentGet, talentPost, type BackfillEstimate } from "@/lib/talent";
import { fmtNum } from "./Charts";
import { Panel, Pill, quietButton, useTalentOrg } from "./TalentShell";

interface Run {
  id: string;
  kind: string;
  status: string;
  total: number;
  succeeded: number;
  failed: number;
  created_at: string;
}

/** Embeddings for the whole pool, and the optional Claude re-parse through the Batch API. */
export function BackfillPanel() {
  const { isAdmin, orgId } = useTalentOrg();
  const [est, setEst] = useState<BackfillEstimate | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    Promise.all([talentGet<BackfillEstimate>("/backfill/estimate"), talentGet<Run[]>("/backfill/runs")])
      .then(([e, r]) => {
        setEst(e);
        setRuns(r);
      })
      .catch((e) => notifyError(e.message));
  }, []);

  useEffect(load, [load, orgId]);

  const start = async (kind: "embed" | "parse") => {
    try {
      await talentPost("/backfill", { kind });
      notifySuccess(kind === "embed" ? "Embedding started" : "Re-parse submitted to the Batch API");
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  };

  if (!est) return null;
  return (
    <Panel
      title="Matching readiness"
      description="Profiles need a vector for semantic matching. A Claude re-parse adds skills with years and last-used dates, per-field confidence and computed experience."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-100 p-4 text-sm dark:border-white/5">
          <div className="font-medium text-gray-900 dark:text-white">Embeddings</div>
          <div className="mt-1 text-gray-600 dark:text-gray-300">{fmtNum(est.embeddings_missing)} current CV versions have no vector yet.</div>
          {isAdmin && (
            <Button className={`mt-3 ${quietButton}`} variant="outline" disabled={!est.embeddings_missing} onClick={() => start("embed")}>
              <Database /> Embed profiles
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-gray-100 p-4 text-sm dark:border-white/5">
          <div className="font-medium text-gray-900 dark:text-white">Claude re-parse</div>
          <div className="mt-1 text-gray-600 dark:text-gray-300">
            {fmtNum(est.profiles)} CVs not yet parsed by the current prompt. Estimated cost on {est.model} with the Batch API
            (half price): <b>${est.estimated_cost_usd.toLocaleString()}</b> in {est.batches} batch{est.batches === 1 ? "" : "es"}, done within 24 hours.
          </div>
          {isAdmin && (
            <Button className={`mt-3 ${quietButton}`} variant="outline" disabled={!est.profiles} onClick={() => setConfirm(true)}>
              <Sparkles /> Re-parse with Claude
            </Button>
          )}
        </div>
      </div>
      {runs.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-gray-600 dark:text-gray-300">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <Pill tone={r.status === "collected" ? "green" : "blue"}>{r.status}</Pill>
              {r.kind} batch of {fmtNum(r.total)} · {fmtDate(r.created_at, true)}
              {r.status === "collected" && ` · ${fmtNum(r.succeeded)} parsed, ${fmtNum(r.failed)} failed`}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Re-parse the talent pool with Claude?"
        description={`${est.profiles.toLocaleString()} CVs, about $${est.estimated_cost_usd.toLocaleString()} on ${est.model}. CV text is sent to Anthropic for parsing. Values recruiters or candidates entered by hand are kept.`}
        confirmLabel="Start re-parse"
        variant="warning"
        onConfirm={() => {
          setConfirm(false);
          start("parse");
        }}
      />
    </Panel>
  );
}
