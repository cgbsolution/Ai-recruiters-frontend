"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Save, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import { ApprovalsPanel } from "./ApprovalsPanel";
import { MatchCard } from "./MatchCard";
import { MatchRunStatus } from "./MatchRunStatus";
import { ShortlistPanel } from "./ShortlistPanel";
import { Panel, Pill, stackedAction, TalentShell, useTalentOrg } from "./TalentShell";

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

function Field({ id, label, help, className, children }: { id: string; label: string; help?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        {children}
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
    </div>
  );
}

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
    <Panel
      title="How the agent works this job"
      description="Copilot: you approve the invite list. Autopilot: the agent invites the top matches itself. Submissions to the client and rejections always need you."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field id="autonomy" label="Autonomy">
          <Select value={form.autonomy_mode} onValueChange={(v) => set("autonomy_mode", v)}>
            <SelectTrigger id="autonomy" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="copilot">Copilot — I approve invites</SelectItem>
              <SelectItem value="autopilot" disabled={!isAdmin}>
                Autopilot — invite automatically{!isAdmin ? " (admins)" : ""}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="top_k" label="Invite the top">
          <Input id="top_k" type="number" min={1} max={200} value={form.top_k} onChange={(e) => set("top_k", e.target.value)} />
        </Field>
        <Field id="budget" label="Budget (max LPA)">
          <Input id="budget" type="number" min={0} step="0.5" value={form.budget_max_ctc} onChange={(e) => set("budget_max_ctc", e.target.value)} />
        </Field>
        <Field id="notice" label="Longest notice (days)">
          <Input id="notice" type="number" min={0} max={365} value={form.max_notice_days} onChange={(e) => set("max_notice_days", e.target.value)} />
        </Field>
        <Field id="must" label="Must-haves (one per line)" help="Empty: derived from the job's required skills and experience." className="md:col-span-2">
          <Textarea id="must" rows={5} placeholder={job.effective_must_haves.join("\n")} value={form.must_haves}
            onChange={(e) => set("must_haves", e.target.value)} />
        </Field>
        <Field id="nice" label="Nice to have (one per line)" className="md:col-span-2">
          <Textarea id="nice" rows={5} value={form.nice_to_haves} onChange={(e) => set("nice_to_haves", e.target.value)} />
        </Field>
        <Field id="locations" label="Locations (comma separated)" className="md:col-span-2">
          <Input id="locations" placeholder={job.location} value={form.locations} onChange={(e) => set("locations", e.target.value)} />
        </Field>
        <div className="flex items-center gap-2 self-end pb-2">
          <Checkbox id="relocate" checked={form.relocation_ok} onCheckedChange={(v) => set("relocation_ok", v === true)} />
          <Label htmlFor="relocate" className="font-normal">Consider people willing to relocate</Label>
        </div>
        <div />
        <Field id="interview_mode" label="Interview">
          <Select value={form.interview_mode} onValueChange={(v) => set("interview_mode", v)}>
            <SelectTrigger id="interview_mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="async_text">Written (async)</SelectItem>
              <SelectItem value="async_voice">Recorded voice (async)</SelectItem>
              <SelectItem value="live_voice">Live voice (phase 5)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="questions" label="Questions">
          <Input id="questions" type="number" min={8} max={12} value={form.question_count} onChange={(e) => set("question_count", e.target.value)} />
        </Field>
        <Field id="time_limit" label="Time limit (minutes)">
          <Input id="time_limit" type="number" min={25} max={30} value={form.time_limit_minutes} onChange={(e) => set("time_limit_minutes", e.target.value)} />
        </Field>
        <Field id="slot" label="Slot length (minutes)">
          <Input id="slot" type="number" min={15} max={120} value={form.slot_minutes} onChange={(e) => set("slot_minutes", e.target.value)} />
        </Field>
        <Field id="rubric" label="Interview rubric (one criterion per line: “Criterion — what good looks like”)" className="md:col-span-2 xl:col-span-4">
          <Textarea id="rubric" rows={4} placeholder={"Kafka at scale — has run production streaming pipelines\nCommunication — explains trade-offs clearly"}
            value={form.rubric} onChange={(e) => set("rubric", e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </div>
    </Panel>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
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
  const [filter, setFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);
  const [starting, setStarting] = useState(false);
  const lastStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const status = filter === "all" ? "" : `&status=${filter}`;
      const [j, m, a] = await Promise.all([
        talentGet<TalentJob>(`/jobs/${jobRef}`),
        talentGet<{ items: MatchItem[] }>(`/jobs/${jobRef}/matches?limit=200${status}`),
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

  // While a run is active, follow it closely; announce how it ended.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  useEffect(() => {
    const status = job?.settings.match_status ?? null;
    const was = lastStatus.current;
    lastStatus.current = status;
    if (!job || (was !== "running" && was !== "queued")) return;
    if (status === "done") notifySuccess(`Matching finished — ${job.settings.match_progress?.matches ?? 0} candidates ranked`);
    if (status === "failed" || status === "skipped") notifyError(job.settings.match_error || "Matching didn't complete");
  }, [job]);

  if (!job) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

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
    setStarting(true);
    try {
      await talentPost(`/jobs/${job.ref}/match`, {});
      // Show the queued run at once (the poll takes over from here) instead of
      // the previous run's result until the next fetch lands.
      const requested_at = new Date().toISOString();
      setJob((j) =>
        j && { ...j, settings: { ...j.settings, match_status: "queued", match_error: null, match_progress: { stage: "queued", requested_at } } },
      );
      notifySuccess("Matching queued — progress shows below");
    } catch (e) {
      notifyError((e as Error).message); // e.g. Match switched off, job not open, worker unreachable
    } finally {
      setStarting(false);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="col-start-1 flex flex-wrap items-center gap-2 text-lg">
            {job.title}
            <Pill tone={job.settings.autonomy_mode === "autopilot" ? "blue" : "gray"}>{job.settings.autonomy_mode}</Pill>
          </CardTitle>
          <CardDescription className="col-start-1">
            {job.location} · {job.experience_min ?? 0}-{job.experience_max ?? "?"} yrs · skills {job.skills.join(", ") || "—"}
          </CardDescription>
          <CardAction className={stackedAction}>
            <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? "Hide settings" : "Settings"}
            </Button>
            <Button variant="outline" disabled={running} onClick={plan}>
              <Send /> {job.settings.autonomy_mode === "autopilot" ? "Invite top matches" : "Prepare invites"}
            </Button>
            <Button variant="primary" disabled={running || starting} onClick={run}>
              {running || starting ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Matching…" : "Run matching"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {job.settings.last_matched_at ? `Last matched ${fmtDate(job.settings.last_matched_at, true)}` : "Not matched yet"}
        </CardContent>
      </Card>

      <MatchRunStatus job={job} />

      {showSettings && <SettingsForm job={job} onSaved={load} />}

      <ApprovalsPanel key={pending.map((p) => p.id).join()} items={pending} onDone={load} />

      <ShortlistPanel jobRef={job.ref} />

      <Panel title="Ranked matches" description="Ordered by the evidence-based score; fresh profiles first on ties. Thumbs feed the precision@10 report.">
        <Tabs value={filter} onValueChange={setFilter} className="mb-4">
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key}>
                {f.label}
                {f.key !== "all" && job.matches[f.key] ? ` · ${job.matches[f.key]}` : ""}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {matches === null ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filter !== "all" ? "No matches in this state." : running ? "Matches will appear here as soon as the run finishes." : "No matches yet — run matching."}
          </p>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchCard
                key={m.id}
                m={m}
                actions={
                  (m.status === "ranked" || m.status === "needs_refresh") && m.ai_score != null ? (
                    m.contact && !m.contact.allowed ? (
                      <div className="flex max-w-[260px] flex-col items-end gap-1 text-right">
                        <Button variant="outline" disabled title={m.contact.reason ?? undefined}>
                          <UserPlus /> Invite
                        </Button>
                        <span className="text-xs text-amber-700 dark:text-amber-400">Can’t email: {m.contact.reason}</span>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => invite(m)} title="Invite now (records your approval)">
                        <UserPlus /> Invite
                      </Button>
                    )
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
