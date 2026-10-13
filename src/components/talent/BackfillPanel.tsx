"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";
import { talentGet, talentPost, type BackfillEstimate } from "@/lib/talent";
import { fmtNum, StatusLine } from "./Charts";
import { Panel, useTalentOrg } from "./TalentShell";

/** Embeddings for the whole pool. Profiles keep their fast-parse metadata (no Claude re-parse). */
export function BackfillPanel() {
  const { isAdmin, orgId } = useTalentOrg();
  const [est, setEst] = useState<BackfillEstimate | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    talentGet<BackfillEstimate>("/backfill/estimate")
      .then(setEst)
      .catch((e) => notifyError(e.message));
  }, []);

  useEffect(load, [load, orgId]);

  const embed = async () => {
    setBusy(true);
    try {
      await talentPost("/backfill", { kind: "embed" });
      notifySuccess("Embedding started");
      load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!est) return null;
  const missing = est.embeddings_missing;
  return (
    <Panel
      title="Matching readiness"
      description="Profiles need a vector (embedding) for semantic matching. While Match is on, new and updated CVs are embedded automatically within about 15 minutes."
      action={
        isAdmin && (
          <Button variant="outline" disabled={!missing || busy} onClick={embed}>
            <Database /> Embed profiles
          </Button>
        )
      }
    >
      <StatusLine level={missing ? "warning" : "good"}>
        {missing
          ? `${fmtNum(missing)} current CV version${missing === 1 ? "" : "s"} have no vector yet.`
          : "Every current CV version has a vector."}
      </StatusLine>
    </Panel>
  );
}
