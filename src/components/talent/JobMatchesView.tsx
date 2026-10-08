"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Play, Save, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  fmtDate,
  talentGet,
  talentPost,
  talentPut,
  type ApprovalItem,
  type JobTalentSettings,
  type MatchItem,
  type TalentJob,
} from "@/lib/talent";
import { cn } from "@/lib/utils";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { MatchCard } from "./MatchCard";
import { ShortlistPanel } from "./ShortlistPanel";
import { Panel, Pill, TalentShell, quietButton, useTalentOrg } from "./TalentShell";

const input =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:opacity-60 dark:border-white/10 dark:bg-gray-900 dark:text-gray-100";

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

function SettingsForm({ job, onSaved }: { job: TalentJob; onSaved: () => void }) {
  const { isAdmin } = useTalentOrg();
  const s = job.settings;
  const [form, setForm] = useState({
    autonomy_mode: s.autonomy_mode,
    top_k: s.top_k,
    must_haves: (s.must_haves ?? []).join("\n"),
    nice_to_haves: (s.nice_to_haves ?? []).join("\n"),
    budget_max_ctc: s.budget_max_ctc ?? "",
    max_notice_days: s.max_notice_days ?? "",
    locations: (s.locations ?? []).join(", "),
    relocation_ok: s.relocation_ok,
    interview_mode: s.interview_mode,
    question_count: s.question_count,
    time_limit_minutes: s.time_limit_minutes,
    slot_minutes: s.slot_minutes,
    rubric: (s.rubric ?? []).map((r) => `${r.criterion}${r.description ? ` — ${r.description}` : ""}`).join("\n"),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | number | boolean) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      await talentPut<JobTalentSettings>(`/jobs/${job.ref}/settings`, {
        autonomy_mode: form.autonomy_mode,
        top_k: Number(form.top_k),
        must_haves: lines(form.must_haves),
        nice_to_haves: lines(form.nice_to_haves),
        budget_max_ctc: form.budget_max_ctc === "" ? null : Number(form.budget_max_ctc),
        max_notice_days: form.max_notice_days === "" ? null : Number(form.max_notice_days),
        locations: form.locations.split(",").map((x) => x.trim()).filter(Boolean),
        relocation_ok: form.relocation_ok,
        interview_mode: form.interview_mode,
        question_count: Number(form.question_count),
        time_limit_minutes: Number(form.time_limit_minutes),
        slot_minutes: Number(form.slot_minutes),
        rubric: lines(form.rubric).map((l) => {
          const [criterion, ...rest] = l.split("—");
          return { criterion: criterion.trim(), description: rest.join("—").trim(), weight: 1 };
        }),
      });
      notifySuccess("Job settings saved");
      onSaved();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="How the agent works this job" description="Copilot: you approve the invite list. Autopilot: the agent invites the top matches itself. Submissions to the client and rejections always need you.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Autonomy</span>
          <select className={input} value={form.autonomy_mode} onChange={(e) => set("autonomy_mode", e.target.value)}>
            <option value="copilot">Copilot — I approve invites</option>
            <option value="autopilot" disabled={!isAdmin}>Autopilot — invite automatically{!isAdmin ? " (admins)" : ""}</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Invite the top</span>
          <input type="number" min={1} max={200} className={input} value={form.top_k} onChange={(e) => set("top_k", e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Budget (max LPA)</span>
          <input type="number" min={0} step="0.5" className={input} value={form.budget_max_ctc} onChange={(e) => set("budget_max_ctc", e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Longest notice (days)</span>
          <input type="number" min={0} max={365} className={input} value={form.max_notice_days} onChange={(e) => set("max_notice_days", e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm md:col-span-2">
          <span className="font-medium text-gray-800 dark:text-gray-200">Must-haves (one per line)</span>
          <textarea rows={5} className={cn(input, "h-auto py-2")} placeholder={job.effective_must_haves.join("\n")}
            value={form.must_haves} onChange={(e) => set("must_haves", e.target.value)} />
          <span className="block text-xs text-gray-500 dark:text-gray-400">Empty: derived from the job&apos;s required skills and experience.</span>
        </label>
        <label className="space-y-1.5 text-sm md:col-span-2">
          <span className="font-medium text-gray-800 dark:text-gray-200">Nice to have (one per line)</span>
          <textarea rows={5} className={cn(input, "h-auto py-2")} value={form.nice_to_haves} onChange={(e) => set("nice_to_haves", e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm md:col-span-2">
          <span className="font-medium text-gray-800 dark:text-gray-200">Locations (comma separated)</span>
          <input className={input} placeholder={job.location} value={form.locations} onChange={(e) => set("locations", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-800 dark:text-gray-200">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={form.relocation_ok} onChange={(e) => set("relocation_ok", e.target.checked)} />
          Consider people willing to relocate
        </label>
        <div />
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Interview</span>
          <select className={input} value={form.interview_mode} onChange={(e) => set("interview_mode", e.target.value)}>
            <option value="async_text">Written (async)</option>
            <option value="async_voice">Recorded voice (async)</option>
            <option value="live_voice">Live voice (phase 5)</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Questions</span>
          <input type="number" min={8} max={12} className={input} value={form.question_count} onChange={(e) => set("question_count", e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Time limit (minutes)</span>
          <input type="number" min={25} max={30} className={input} value={form.time_limit_minutes} onChange={(e) => set("time_limit_minutes", e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">Slot length (minutes)</span>
          <input type="number" min={15} max={120} className={input} value={form.slot_minutes} onChange={(e) => set("slot_minutes", e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm md:col-span-2 xl:col-span-4">
          <span className="font-medium text-gray-800 dark:text-gray-200">Interview rubric (one criterion per line: “Criterion — what good looks like”)</span>
          <textarea rows={4} className={cn(input, "h-auto py-2")} placeholder={"Kafka at scale — has run production streaming pipelines\nCommunication — explains trade-offs clearly"}
            value={form.rubric} onChange={(e) => set("rubric", e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" className="h-10 py-0" disabled={saving} onClick={save}>
          <Save /> Save
        </Button>
      </div>
    </Panel>
  );
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "needs_refresh", label: "Needs refresh" },
  { key: "approval_pending", label: "Awaiting approval" },
  { key: "invited", label: "Invited" },
  { key: "scheduled", label: "Scheduled" },
  { key: "interviewed", label: "Interviewed" },
  { key: "shortlisted", label: "Shortlisted" },
];

function JobBody({ jobRef }: { jobRef: string }) {
  const { orgId } = useTalentOrg();
  const [job, setJob] = useState<TalentJob | null>(null);
  const [matches, setMatches] = useState<MatchItem[] | null>(null);
  const [pending, setPending] = useState<ApprovalItem[]>([]);
  const [filter, setFilter] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const [j, m, a] = await Promise.all([
        talentGet<TalentJob>(`/jobs/${jobRef}`),
        talentGet<{ items: MatchItem[] }>(`/jobs/${jobRef}/matches?limit=200${filter ? `&status=${filter}` : ""}`),
        talentGet<ApprovalItem[]>(`/approvals?job_id=${jobRef}&kind=invite`),
      ]);
      setJob(j);
      setMatches(m.items);
      setPending(a);
    } catch (e) {
      notifyError((e as Error).message);
    }
  }, [jobRef, filter]);

  useEffect(() => {
    load();
  }, [load, orgId]);

  const running = job?.settings.match_status === "running" || job?.settings.match_status === "queued";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [running, load]);

  if (!job) return <div className="py-10 text-center text-sm text-gray-500">Loading…</div>;

  const invite = async (m: MatchItem) => {
    try {
      await talentPost(`/matches/${m.id}/invite`, {});
      notifySuccess(`Inviting ${m.profile.name ?? "the candidate"}`);
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  };

  const plan = async () => {
    try {
      await talentPost(`/jobs/${job.ref}/invites/plan`, {});
      notifySuccess(job.settings.autonomy_mode === "autopilot" ? "Inviting the top matches" : "Approval list being prepared");
      setTimeout(load, 2500);
    } catch (e) {
      notifyError((e as Error).message);
    }
  };

  const run = async () => {
    try {
      await talentPost(`/jobs/${job.ref}/match`, {});
      notifySuccess("Matching started");
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{job.title}</h2>
              <Pill tone={job.settings.autonomy_mode === "autopilot" ? "blue" : "gray"}>{job.settings.autonomy_mode}</Pill>
            </div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {job.location} · {job.experience_min ?? 0}-{job.experience_max ?? "?"} yrs · skills {job.skills.join(", ") || "—"}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {running ? "Matching now…" : job.settings.last_matched_at ? `Last matched ${fmtDate(job.settings.last_matched_at, true)}` : "Not matched yet"}
              {job.settings.match_status === "failed" && ` · last run failed: ${job.settings.match_error ?? ""}`}
            </div>
          </div>
          <div className="flex gap-2">
            <Button className={quietButton} variant="outline" onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? "Hide settings" : "Settings"}
            </Button>
            <Button className={quietButton} variant="outline" disabled={running} onClick={plan}>
              <Send /> {job.settings.autonomy_mode === "autopilot" ? "Invite top matches" : "Prepare invites"}
            </Button>
            <Button variant="primary" className="h-9 py-0" disabled={running} onClick={run}>
              <Play /> Run matching
            </Button>
          </div>
        </div>
      </Panel>

      {showSettings && <SettingsForm job={job} onSaved={load} />}

      <ApprovalsPanel key={pending.map((p) => p.id).join()} items={pending} onDone={load} />

      <ShortlistPanel jobRef={job.ref} />

      <Panel title="Ranked matches" description="Ordered by the evidence-based score; fresh profiles first on ties. Thumbs feed the precision@10 report.">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filter === f.key
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5",
              )}
            >
              {f.label}
              {f.key && job.matches[f.key] ? ` · ${job.matches[f.key]}` : ""}
            </button>
          ))}
        </div>
        {matches === null ? (
          <p className="py-6 text-center text-sm text-gray-500">Loading…</p>
        ) : matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No matches{filter ? " in this state" : " yet — run matching"}.</p>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchCard
                key={m.id}
                m={m}
                actions={
                  (m.status === "ranked" || m.status === "needs_refresh") && m.ai_score != null ? (
                    <Button className={quietButton} variant="outline" onClick={() => invite(m)} title="Invite now (records your approval)">
                      <UserPlus /> Invite
                    </Button>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function JobMatchesView({ jobRef }: { jobRef: string }) {
  return (
    <TalentShell title="Job matches" subtitle="Evidence for every requirement, quoted from the CV.">
      <JobBody jobRef={jobRef} />
    </TalentShell>
  );
}
