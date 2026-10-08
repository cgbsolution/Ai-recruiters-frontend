"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Pause, Play, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  fmtDate,
  pct,
  talentGet,
  talentPost,
  type CampaignRow,
  type Deliverability,
  type Phase0Report,
  type Segments,
  type TalentSettings,
} from "@/lib/talent";
import { BackfillPanel } from "./BackfillPanel";
import { FunnelBars, Meter, StatusLine, fmtNum } from "./Charts";
import { Panel, Pill, Stat, TalentShell, Warnings, quietButton, useTalentOrg } from "./TalentShell";

function healthLevel(rate: number, limit: number): "good" | "warning" | "critical" {
  if (rate > limit) return "critical";
  if (rate > limit * 0.6) return "warning";
  return "good";
}

function CampaignCard({ c, canEdit, onChange }: { c: CampaignRow; canEdit: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const f = c.funnel;
  const act = async (status: "pause" | "resume" | "cancel") => {
    setBusy(true);
    try {
      await talentPost(`/campaigns/${c.id}/status`, { status });
      notifySuccess(status === "resume" ? "Campaign resumed" : status === "pause" ? "Campaign paused" : "Campaign cancelled");
      onChange();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-gray-100 p-4 dark:border-white/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
            <Pill>{c.status}</Pill>
            {c.segment?.type === "pilot" && <Pill tone="blue">pilot</Pill>}
          </div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Started {fmtDate(c.created_at)} · {fmtNum(f.members)} people
          </div>
          {c.paused_reason && (
            <div className="mt-2">
              <StatusLine level="warning">Paused — {c.paused_reason}</StatusLine>
            </div>
          )}
        </div>
        {canEdit && c.status !== "cancelled" && c.status !== "completed" && (
          <div className="flex gap-2">
            {c.status === "active" ? (
              <Button className={quietButton} variant="outline" disabled={busy} onClick={() => act("pause")}>
                <Pause /> Pause
              </Button>
            ) : (
              <Button className={quietButton} variant="outline" disabled={busy} onClick={() => act("resume")}>
                <Play /> Resume
              </Button>
            )}
            <Button className={quietButton} variant="ghost" disabled={busy} onClick={() => act("cancel")}>
              <X /> Cancel
            </Button>
          </div>
        )}
      </div>

      {c.segment?.strata && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
          {c.segment.strata.map((s) => (
            <span key={s.label} className="rounded-lg bg-gray-50 px-2 py-1 dark:bg-white/5">
              CV {s.label}: <b>{s.selected}</b> of {s.eligible} eligible
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_16rem]">
        <FunnelBars
          stages={[
            { label: "Enrolled", value: f.members },
            { label: "Sent", value: f.sent },
            { label: "Opened", value: f.opened },
            { label: "Refreshed", value: f.refreshed },
          ]}
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500 dark:text-gray-400">Messages sent</dt>
          <dd className="text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtNum(f.messages_sent)}</dd>
          <dt className="text-gray-500 dark:text-gray-400">Unreachable</dt>
          <dd className="text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtNum(f.unreachable)}</dd>
          <dt className="text-gray-500 dark:text-gray-400">Opted out</dt>
          <dd className="text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtNum(f.opted_out)}</dd>
          <dt className="text-gray-500 dark:text-gray-400">No response</dt>
          <dd className="text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtNum(f.no_response)}</dd>
          <dt className="text-gray-500 dark:text-gray-400">Bounce rate</dt>
          <dd className="text-right tabular-nums text-gray-900 dark:text-gray-100">{pct(f.health.bounce_rate)}</dd>
          <dt className="text-gray-500 dark:text-gray-400">Complaints</dt>
          <dd className="text-right tabular-nums text-gray-900 dark:text-gray-100">{f.health.complaints}</dd>
        </dl>
      </div>
      {Object.keys(f.skipped_reasons).length > 0 && (
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Not sent:{" "}
          {Object.entries(f.skipped_reasons)
            .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

function ConsoleBody() {
  const { isAdmin, orgId } = useTalentOrg();
  const [settings, setSettings] = useState<TalentSettings | null>(null);
  const [segments, setSegments] = useState<Segments | null>(null);
  const [phase0, setPhase0] = useState<Phase0Report | null>(null);
  const [deliv, setDeliv] = useState<Deliverability | null>(null);
  const [list, setList] = useState<CampaignRow[]>([]);
  const [pilotSize, setPilotSize] = useState(2000);
  const [busy, setBusy] = useState<string | null>(null);
  const [mergePlan, setMergePlan] = useState<{ groups: number; rows_to_delete: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, seg, p0, d, cs] = await Promise.all([
        talentGet<TalentSettings>("/settings"),
        talentGet<Segments>("/segments"),
        talentGet<Phase0Report>("/phase0/report"),
        talentGet<Deliverability>("/deliverability"),
        talentGet<CampaignRow[]>("/campaigns?kind=refresh"),
      ]);
      setSettings(s);
      setSegments(seg);
      setPhase0(p0);
      setDeliv(d);
      setList(cs);
    } catch (e) {
      notifyError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, orgId]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      notifySuccess(ok);
      await load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const vs = segments?.by_verification_status ?? {};
  const usage = deliv?.usage_today;
  const health = deliv?.domain_health_7d;

  return (
    <div className="space-y-6">
      {settings && <Warnings items={settings.warnings} />}

      <Panel title="Talent pool" description="Freshness is measured from the candidate's last confirmation, or when the CV arrived.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Stat label="Profiles" value={fmtNum(segments?.profiles ?? 0)} />
          <Stat label="Fresh" value={fmtNum(vs.fresh ?? 0)} tone="good" />
          <Stat label="Stale" value={fmtNum(vs.stale ?? 0)} tone="warn" />
          <Stat label="Refreshing" value={fmtNum(vs.refreshing ?? 0)} />
          <Stat label="Unreachable" value={fmtNum(vs.unreachable ?? 0)} tone="bad" />
          <Stat label="Refresh consent" value={fmtNum(segments?.refresh_consent ?? 0)} hint="may be emailed to refresh" />
          <Stat label="Due now" value={fmtNum(segments?.due_now ?? 0)} hint="consented, reachable, stale" />
        </div>
        {segments && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
            {Object.entries(segments.cv_age_months).map(([k, v]) => (
              <span key={k} className="rounded-lg bg-gray-50 px-2 py-1 dark:bg-white/5">
                CV age {k} months: <b>{fmtNum(v)}</b>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Clean-up (phase 0)"
          description="Duplicates and unusable emails, before anything is sent."
          action={
            isAdmin && (
              <Button
                variant="outline"
                disabled={busy === "backfill"}
                onClick={() => run("backfill", () => talentPost("/phase0/backfill", { check_mx: false }), "Profiles checked")}
              >
                <RefreshCw /> Check all profiles
              </Button>
            )
          }
        >
          {phase0 && (
            <div className="space-y-3 text-sm">
              <StatusLine level={phase0.invalid_or_unusable_emails ? "warning" : "good"}>
                {fmtNum(phase0.invalid_or_unusable_emails)} profiles have no usable email (
                {Object.entries(phase0.email_status)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(", ") || "not checked yet"}
                ).
              </StatusLine>
              <StatusLine level={phase0.duplicates.same_email.groups ? "warning" : "good"}>
                {phase0.duplicates.same_email.groups} same-person groups by email ({phase0.duplicates.same_email.removable} rows
                would be folded into the newest CV).
              </StatusLine>
              <StatusLine level={phase0.duplicates.same_phone_different_email.groups ? "warning" : "good"}>
                {phase0.duplicates.same_phone_different_email.groups} groups share a phone number under different
                emails — review by hand.
              </StatusLine>
              <StatusLine level="good">{phase0.duplicates.same_file.groups} groups share an identical CV file.</StatusLine>
              {isAdmin && phase0.duplicates.same_email.groups > 0 && (
                <Button
                  variant="outline"
                  disabled={busy === "merge"}
                  onClick={async () => {
                    const plan = await talentPost<{ groups: number; rows_to_delete: number }>("/phase0/merge-duplicates", { dry_run: true });
                    setMergePlan(plan);
                  }}
                >
                  Review duplicate merge
                </Button>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Sending" description={usage ? `Sender domain ${usage.domain}` : undefined}>
          {usage && deliv && health && (
            <div className="space-y-4">
              {usage.paused && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusLine level="critical">Sending is paused — {usage.paused_reason}</StatusLine>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      onClick={() => run("resume-domain", () => talentPost("/sender-domain/resume", {}), "Sending resumed")}
                    >
                      Resume sending
                    </Button>
                  )}
                </div>
              )}
              <Meter label="Sent today" value={usage.total} max={usage.cap} sub={`Refresh mail may use ${usage.bulk_cap.toLocaleString()} of it (${usage.bulk.toLocaleString()} used); the rest is kept for invites and reminders.`} />
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Ramp from {fmtDate(deliv.ramp_started_on)}:{" "}
                {deliv.forecast.map((f) => `${fmtDate(f.day)} ${f.cap.toLocaleString()}/day`).join(" → ")}
              </div>
              <StatusLine level={healthLevel(health.bounce_rate, deliv.thresholds.bounce_rate)}>
                Bounces, last 7 days: {pct(health.bounce_rate)} ({health.bounces} of {health.sent}). Auto-pause above{" "}
                {pct(deliv.thresholds.bounce_rate, 0)}.
              </StatusLine>
              <StatusLine level={healthLevel(health.complaint_rate, deliv.thresholds.complaint_rate)}>
                Spam complaints, last 7 days: {pct(health.complaint_rate, 2)} ({health.complaints}). Auto-pause above{" "}
                {pct(deliv.thresholds.complaint_rate, 1)}.
              </StatusLine>
            </div>
          )}
        </Panel>
      </div>

      <BackfillPanel />

      <Panel
        title="Refresh campaigns"
        description="Each person gets at most three messages per cycle — touch 1, then 3 days, touch 2, then 4 days, touch 3 — and the sequence stops the moment they answer, opt out or bounce."
        action={
          isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                Pilot size
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={pilotSize}
                  onChange={(e) => setPilotSize(Number(e.target.value))}
                  className="h-9 w-24 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-gray-900"
                />
              </label>
              <Button
                variant="primary"
                className="h-9 py-0"
                disabled={busy === "pilot"}
                onClick={() =>
                  run("pilot", () => talentPost("/campaigns/pilot", { size: pilotSize }), "Pilot created — the sweep will start sending within the day's budget")
                }
              >
                <Sparkles /> New pilot
              </Button>
              <Button className={quietButton} variant="outline" disabled={busy === "sweep"} onClick={() => run("sweep", () => talentPost("/sweep", {}), "Sweep queued")}>
                <Send /> Run sweep now
              </Button>
            </div>
          )
        }
      >
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No refresh campaigns yet. Start with a pilot: it samples consented profiles evenly across CV ages (under 12
            months, 12 to 24, over 24).
          </p>
        ) : (
          <div className="space-y-4">
            {list.map((c) => (
              <CampaignCard key={c.id} c={c} canEdit={isAdmin} onChange={load} />
            ))}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={!!mergePlan}
        onOpenChange={(open) => !open && setMergePlan(null)}
        title="Merge duplicate profiles?"
        description={
          mergePlan
            ? `${mergePlan.groups} groups: ${mergePlan.rows_to_delete} older rows are deleted and their job applications moved to the newest CV. Every deletion is written to the audit log.`
            : ""
        }
        confirmLabel="Merge"
        variant="danger"
        loading={busy === "merge"}
        onConfirm={() =>
          run("merge", () => talentPost("/phase0/merge-duplicates", { dry_run: false }), "Duplicates merged").then(() => setMergePlan(null))
        }
      />
    </div>
  );
}

export default function CampaignConsole() {
  return (
    <TalentShell title="Talent Agent" subtitle="Keeps CVs fresh, matches openings, invites and interviews — you approve every outcome.">
      <ConsoleBody />
    </TalentShell>
  );
}
