"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AtSign,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CirclePause,
  CirclePlay,
  CircleX,
  Eye,
  EyeOff,
  FileStack,
  FlaskConical,
  GitMerge,
  Hourglass,
  Loader2,
  MailX,
  Megaphone,
  OctagonAlert,
  Pause,
  Phone,
  Play,
  RefreshCw,
  Repeat,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";
import { BackfillPanel } from "./BackfillPanel";
import { FunnelBars, Meter, StatusLine, fmtNum } from "./Charts";
import {
  ColumnFilter,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  RelativeTime,
  RowActions,
  SearchBox,
  Toolbar,
  type RowAction,
} from "./data-table";
import { Panel, Pill, TalentShell, Warnings, useTalentOrg } from "./TalentShell";

// ── Small helpers ───────────────────────────────────────────────────────────

type Level = "good" | "warning" | "critical";

function healthLevel(rate: number, limit: number): Level {
  if (rate > limit) return "critical";
  if (rate > limit * 0.6) return "warning";
  return "good";
}

/** "62%" of a whole; "<1%" for a small non-zero share; "—" when there is no whole. */
function share(n: number, of: number): string {
  if (of <= 0) return "—";
  const p = (n / of) * 100;
  if (n > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

/** "0-12" → "Under 12 months", "12-24" → "12–24 months", "24+" → "Over 24 months". */
function ageLabel(key: string): string {
  if (key.endsWith("+")) return `Over ${key.slice(0, -1)} months`;
  const [lo, hi] = key.split("-");
  if (lo === "0" && hi) return `Under ${hi} months`;
  return `${key.replace("-", "–")} months`;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

// Full class names: Tailwind only generates classes it can see in the source.
const BAR_TONES: Record<Level, string> = {
  good: "[&>[data-slot=progress-indicator]]:bg-emerald-500",
  warning: "[&>[data-slot=progress-indicator]]:bg-amber-500",
  critical: "[&>[data-slot=progress-indicator]]:bg-red-500",
};
const BRAND_BAR = "[&>[data-slot=progress-indicator]]:bg-brand-500";

// ── Talent pool KPIs ────────────────────────────────────────────────────────

type KpiTone = "good" | "warn" | "bad" | "neutral";

const KPI_TONES: Record<KpiTone, string> = {
  good: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  warn: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  bad: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  neutral: "bg-muted text-muted-foreground",
};

/** One number with a label and an icon: a compact Card. */
function Kpi({
  label,
  value,
  icon: Icon,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  tone?: KpiTone;
}) {
  return (
    <Card className="gap-0 py-4 shadow-none">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", KPI_TONES[tone])} aria-hidden>
            <Icon className="size-4" />
          </div>
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/** How old the CVs are, one bar per band (the bands a pilot samples evenly). */
function CvAge({ buckets }: { buckets: Record<string, number> }) {
  const entries = Object.entries(buckets);
  if (!entries.length) return null;
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  return (
    <Card className="gap-0 py-4 shadow-none">
      <CardContent className="px-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="text-sm font-medium text-foreground">CV age</div>
          <div className="text-xs text-muted-foreground">How long ago each CV arrived. Pilots sample evenly across these bands.</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {entries.map(([k, v]) => (
            <div key={k} className="space-y-1.5" title={`${ageLabel(k)}: ${v.toLocaleString()} profiles`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{ageLabel(k)}</span>
                <span className="font-medium tabular-nums text-foreground">
                  {fmtNum(v)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{share(v, total)}</span>
                </span>
              </div>
              <Progress value={total ? (v / total) * 100 : 0} aria-label={`CV age ${ageLabel(k)}`} className={cn("h-1.5", BRAND_BAR)} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TalentPool({ segments }: { segments: Segments | null }) {
  const headingId = useId();
  const vs = segments?.by_verification_status ?? {};
  const total = segments?.profiles ?? 0;
  const ofPool = (n: number) => `${share(n, total)} of profiles`;
  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <div>
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          Talent pool
        </h2>
        <p className="text-sm text-muted-foreground">
          Freshness is measured from the candidate&apos;s last confirmation, or when the CV arrived.
        </p>
      </div>
      {segments ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Profiles" value={fmtNum(total)} icon={Users} />
            <Kpi label="Fresh" value={fmtNum(vs.fresh ?? 0)} icon={BadgeCheck} tone="good" hint={ofPool(vs.fresh ?? 0)} />
            <Kpi label="Stale" value={fmtNum(vs.stale ?? 0)} icon={Hourglass} tone="warn" hint={ofPool(vs.stale ?? 0)} />
            <Kpi label="Refreshing" value={fmtNum(vs.refreshing ?? 0)} icon={RefreshCw} hint={ofPool(vs.refreshing ?? 0)} />
            <Kpi label="Unreachable" value={fmtNum(vs.unreachable ?? 0)} icon={MailX} tone="bad" hint={ofPool(vs.unreachable ?? 0)} />
            <Kpi label="Refresh consent" value={fmtNum(segments.refresh_consent ?? 0)} icon={ShieldCheck} hint="may be emailed to refresh" />
            <Kpi label="Due now" value={fmtNum(segments.due_now ?? 0)} icon={CalendarClock} hint="consented, reachable, stale" />
          </div>
          <CvAge buckets={segments.cv_age_months} />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7" aria-label="Loading">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Clean-up (phase 0) ──────────────────────────────────────────────────────

type CheckLevel = "ok" | "review" | "info";

const CHECK_WORD: Record<CheckLevel, { word: string; tone: "green" | "amber" | "gray" }> = {
  ok: { word: "OK", tone: "green" },
  review: { word: "Review", tone: "amber" },
  info: { word: "Info", tone: "gray" },
};

/** One clean-up check: icon, title, a word for its state, the count and what it means. */
function CheckRow({
  icon: Icon,
  title,
  level,
  count,
  unit,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  level: CheckLevel;
  count: number;
  unit: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const state = CHECK_WORD[level];
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <Pill tone={state.tone}>{state.word}</Pill>
        </div>
        <div className="text-sm text-muted-foreground">{children}</div>
        {action && <div className="pt-1">{action}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg leading-tight font-semibold tabular-nums text-foreground">{fmtNum(count)}</div>
        <div className="text-xs text-muted-foreground">{unit}</div>
      </div>
    </li>
  );
}

function CleanupChecks({
  report,
  isAdmin,
  busy,
  onReviewMerge,
}: {
  report: Phase0Report;
  isAdmin: boolean;
  busy: string | null;
  onReviewMerge: () => void;
}) {
  const statuses = Object.entries(report.email_status);
  const d = report.duplicates;
  return (
    <ul className="divide-y divide-border">
      <CheckRow
        icon={AtSign}
        title="Unusable emails"
        level={report.invalid_or_unusable_emails ? "review" : "ok"}
        count={report.invalid_or_unusable_emails}
        unit="profiles"
      >
        <p>Profiles with no usable email are never contacted.</p>
        {statuses.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {statuses.map(([k, v]) => (
              <Badge key={k} variant="secondary" className="font-normal">
                {k.replace(/_/g, " ")} <span className="font-semibold tabular-nums">{fmtNum(v)}</span>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-0.5 text-xs">Not checked yet.</p>
        )}
      </CheckRow>
      <CheckRow
        icon={Users}
        title="Same person, same email"
        level={d.same_email.groups ? "review" : "ok"}
        count={d.same_email.groups}
        unit="groups"
        action={
          isAdmin &&
          d.same_email.groups > 0 && (
            <Button variant="outline" className="h-8" disabled={busy === "plan" || busy === "merge"} onClick={onReviewMerge}>
              {busy === "plan" ? <Loader2 className="animate-spin" /> : <GitMerge />} Review duplicate merge
            </Button>
          )
        }
      >
        {plural(d.same_email.removable, "row")} would be folded into the newest CV.
      </CheckRow>
      <CheckRow
        icon={Phone}
        title="Shared phone, different email"
        level={d.same_phone_different_email.groups ? "review" : "ok"}
        count={d.same_phone_different_email.groups}
        unit="groups"
      >
        These may be different people — review by hand.
      </CheckRow>
      <CheckRow icon={FileStack} title="Identical CV file" level="info" count={d.same_file.groups} unit="groups">
        The same file was uploaded more than once.
      </CheckRow>
    </ul>
  );
}

// ── Sending ─────────────────────────────────────────────────────────────────

const HEALTH_WORD: Record<Level, { word: string; tone: "green" | "amber" | "red" }> = {
  good: { word: "healthy", tone: "green" },
  warning: { word: "near limit", tone: "amber" },
  critical: { word: "over limit", tone: "red" },
};

/** A 7-day rate against its auto-pause limit: value, a word, a bar and the detail. */
function HealthRow({ label, rate, limit, digits, detail }: { label: string; rate: number; limit: number; digits: number; detail: string }) {
  const level = healthLevel(rate, limit);
  const state = HEALTH_WORD[level];
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="flex items-center gap-2">
          <span className="font-medium tabular-nums text-foreground">{pct(rate, digits)}</span>
          <Pill tone={state.tone}>{state.word}</Pill>
        </span>
      </div>
      <Progress
        value={limit > 0 ? Math.min(rate / limit, 1) * 100 : 0}
        aria-label={`${label}: ${pct(rate, digits)}, ${state.word}`}
        className={cn("h-1.5", BAR_TONES[level])}
      />
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function Sending({
  deliv,
  isAdmin,
  busy,
  onResume,
}: {
  deliv: Deliverability;
  isAdmin: boolean;
  busy: string | null;
  onResume: () => void;
}) {
  const usage = deliv.usage_today;
  const health = deliv.domain_health_7d;
  if (!usage || !health) return null;
  return (
    <div className="space-y-5">
      {usage.paused && (
        <Alert variant="destructive">
          <OctagonAlert />
          <AlertTitle>Sending is paused</AlertTitle>
          <AlertDescription>
            <p>{usage.paused_reason || "No reason was recorded."}</p>
            {isAdmin && (
              <Button variant="outline" className="mt-1 h-8" disabled={busy === "resume-domain"} onClick={onResume}>
                <Play /> Resume sending
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <Meter
        label="Sent today"
        value={usage.total}
        max={usage.cap}
        sub={`Refresh mail may use ${usage.bulk_cap.toLocaleString()} of it (${usage.bulk.toLocaleString()} used); the rest is kept for invites and reminders.`}
      />
      {deliv.forecast.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Daily cap ramp</span>
            <span className="text-xs text-muted-foreground">started {fmtDate(deliv.ramp_started_on)}</span>
          </div>
          <ol className="flex flex-wrap items-center gap-1.5" aria-label="Daily cap forecast">
            {deliv.forecast.map((f, i) => (
              <li key={f.day} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
                <div className="rounded-md border bg-muted/40 px-2.5 py-1 text-xs">
                  <div className="text-muted-foreground">{fmtDate(f.day)}</div>
                  <div className="font-medium tabular-nums text-foreground">{f.cap.toLocaleString()}/day</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <Separator />
      <div className="grid gap-5 sm:grid-cols-2">
        <HealthRow
          label="Bounces · 7 days"
          rate={health.bounce_rate}
          limit={deliv.thresholds.bounce_rate}
          digits={1}
          detail={`${health.bounces.toLocaleString()} of ${health.sent.toLocaleString()} sent. Auto-pause above ${pct(deliv.thresholds.bounce_rate, 0)}.`}
        />
        <HealthRow
          label="Spam complaints · 7 days"
          rate={health.complaint_rate}
          limit={deliv.thresholds.complaint_rate}
          digits={2}
          detail={`${plural(health.complaints, "complaint")}. Auto-pause above ${pct(deliv.thresholds.complaint_rate, 1)}.`}
        />
      </div>
    </div>
  );
}

// ── Campaigns ───────────────────────────────────────────────────────────────

type StatusAction = "pause" | "resume" | "cancel";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", icon: CirclePlay },
  { value: "paused", label: "Paused", icon: CirclePause },
  { value: "completed", label: "Completed", icon: CircleCheck },
  { value: "cancelled", label: "Cancelled", icon: CircleX },
];

const TYPE_OPTIONS = [
  { value: "pilot", label: "Pilot", icon: FlaskConical },
  { value: "rolling", label: "Rolling", icon: Repeat },
];

const campaignType = (c: CampaignRow) => c.segment?.type ?? c.kind;

/** The full funnel of one campaign, shown when its row is opened. */
function CampaignDetail({ c }: { c: CampaignRow }) {
  const f = c.funnel;
  const touches = Object.entries(f.touches ?? {});
  const skipped = Object.entries(f.skipped_reasons ?? {});
  const facts: [string, string][] = [
    ["Messages sent", fmtNum(f.messages_sent)],
    ["Unreachable", fmtNum(f.unreachable)],
    ["Opted out", fmtNum(f.opted_out)],
    ["No response", fmtNum(f.no_response)],
    ["Bounce rate", pct(f.health.bounce_rate)],
    ["Complaints", fmtNum(f.health.complaints)],
  ];
  return (
    <div className="space-y-4">
      {c.paused_reason && <StatusLine level="warning">Paused — {c.paused_reason}</StatusLine>}
      {c.segment?.strata && c.segment.strata.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {c.segment.strata.map((s) => (
            <Badge key={s.label} variant="secondary" className="font-normal tabular-nums">
              CV {s.label}: <b>{s.selected.toLocaleString()}</b> of {s.eligible.toLocaleString()} eligible
            </Badge>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <FunnelBars
          stages={[
            { label: "Enrolled", value: f.members },
            { label: "Sent", value: f.sent },
            { label: "Opened", value: f.opened },
            { label: "Refreshed", value: f.refreshed },
          ]}
        />
        <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-2 text-sm">
          {facts.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right tabular-nums text-foreground">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
      {touches.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">By touch</div>
          <div className="flex flex-wrap gap-2">
            {touches.map(([no, byStatus]) => (
              <div key={no} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border bg-background px-2.5 py-1.5 text-xs">
                <span className="font-medium text-foreground">Touch {no}</span>
                {Object.entries(byStatus).map(([s, n]) => (
                  <span key={s} className="text-muted-foreground">
                    {s.replace(/_/g, " ")} <span className="tabular-nums text-foreground">{fmtNum(n)}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {skipped.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Not sent: {skipped.map(([k, v]) => `${k.replace(/_/g, " ")} ${v.toLocaleString()}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

/** A count with its share of a whole underneath. */
function CountShare({ value, of, whole }: { value: number; of: number; whole: string }) {
  return (
    <div className="text-right">
      <div className="tabular-nums text-foreground">{fmtNum(value)}</div>
      <div className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {share(value, of)} of {whole}
      </div>
    </div>
  );
}

/** "New pilot": a popover asking for the pilot size. */
function NewPilot({
  size,
  onSize,
  busy,
  onCreate,
  children,
}: {
  size: string;
  onSize: (v: string) => void;
  busy: boolean;
  onCreate: () => Promise<boolean>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const n = Number(size);
  const valid = size.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 10_000;
  const submit = async () => {
    if (!valid || busy) return;
    if (await onCreate()) setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">New refresh pilot</div>
          <p className="text-xs text-muted-foreground">
            Samples consented profiles evenly across CV ages (under 12 months, 12 to 24, over 24). The sweep starts sending
            within the day&apos;s budget.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id}>Pilot size</Label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={size}
            aria-invalid={!valid}
            aria-describedby={`${id}-help`}
            onChange={(e) => onSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="h-9 tabular-nums"
          />
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            1 to 10,000 people.
          </p>
        </div>
        <Button variant="primary" className="w-full" disabled={!valid || busy} onClick={submit}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Create pilot
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ── The page ────────────────────────────────────────────────────────────────

function ConsoleBody() {
  const { isAdmin, orgId } = useTalentOrg();
  const [settings, setSettings] = useState<TalentSettings | null>(null);
  const [segments, setSegments] = useState<Segments | null>(null);
  const [phase0, setPhase0] = useState<Phase0Report | null>(null);
  const [deliv, setDeliv] = useState<Deliverability | null>(null);
  const [list, setList] = useState<CampaignRow[] | null>(null);
  const [pilotSize, setPilotSize] = useState("2000");
  const [busy, setBusy] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [mergePlan, setMergePlan] = useState<{ groups: number; rows_to_delete: number } | null>(null);
  const [cancelling, setCancelling] = useState<CampaignRow | null>(null);

  // Each section fills in as its own request answers; one failing endpoint doesn't blank the page.
  const load = useCallback(async () => {
    const [s, seg, p0, d, cs] = await Promise.allSettled([
      talentGet<TalentSettings>("/settings"),
      talentGet<Segments>("/segments"),
      talentGet<Phase0Report>("/phase0/report"),
      talentGet<Deliverability>("/deliverability"),
      talentGet<CampaignRow[]>("/campaigns?kind=refresh"),
    ]);
    if (s.status === "fulfilled") setSettings(s.value);
    if (seg.status === "fulfilled") setSegments(seg.value);
    if (p0.status === "fulfilled") setPhase0(p0.value);
    if (d.status === "fulfilled") setDeliv(d.value);
    setList((prev) => (cs.status === "fulfilled" ? cs.value : (prev ?? [])));
    const failed = [s, seg, p0, d, cs].find((r) => r.status === "rejected");
    if (failed) notifyError(((failed as PromiseRejectedResult).reason as Error)?.message ?? "Could not load the console");
  }, []);

  useEffect(() => {
    load();
  }, [load, orgId]);

  const reload = async () => {
    setReloading(true);
    try {
      await load();
    } finally {
      setReloading(false);
    }
  };

  const run = async (key: string, fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setBusy(key);
    try {
      await fn();
      notifySuccess(ok);
      await load();
      return true;
    } catch (e) {
      notifyError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const reviewMerge = async () => {
    setBusy("plan");
    try {
      setMergePlan(await talentPost<{ groups: number; rows_to_delete: number }>("/phase0/merge-duplicates", { dry_run: true }));
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createPilot = () =>
    run(
      "pilot",
      () => talentPost("/campaigns/pilot", { size: Number(pilotSize) }),
      "Pilot created — the sweep will start sending within the day's budget",
    );

  const setStatus = useCallback(
    async (c: CampaignRow, status: StatusAction) => {
      setRowBusy(c.id);
      try {
        await talentPost(`/campaigns/${c.id}/status`, { status });
        notifySuccess(status === "resume" ? "Campaign resumed" : status === "pause" ? "Campaign paused" : "Campaign cancelled");
        await load();
      } catch (e) {
        notifyError((e as Error).message);
      } finally {
        setRowBusy(null);
      }
    },
    [load],
  );

  const columns = useMemo<ColumnDef<CampaignRow, unknown>[]>(
    () => [
      {
        id: "expand",
        enableGlobalFilter: false,
        size: 32,
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <ChevronRight
            aria-hidden
            className={cn("size-4 text-muted-foreground transition-transform", row.getIsExpanded() && "rotate-90")}
          />
        ),
      },
      {
        accessorKey: "name",
        meta: { label: "Campaign" },
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Campaign" />,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="max-w-72 min-w-40">
              <div className="truncate font-medium text-foreground">{c.name}</div>
              {c.paused_reason ? (
                <div className="flex min-w-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-400" title={c.paused_reason}>
                  <TriangleAlert className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">Paused — {c.paused_reason}</span>
                </div>
              ) : (
                <div className="truncate text-xs text-muted-foreground capitalize">{c.kind.replace(/_/g, " ")} campaign</div>
              )}
            </div>
          );
        },
      },
      {
        id: "type",
        accessorFn: campaignType,
        meta: { label: "Type" },
        filterFn: "oneOf",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => {
          const t = campaignType(row.original);
          return <Pill tone={t === "pilot" ? "blue" : "gray"}>{t}</Pill>;
        },
      },
      {
        accessorKey: "status",
        meta: { label: "Status" },
        filterFn: "oneOf",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <Pill>{row.original.status}</Pill>,
      },
      {
        id: "cohort",
        enableGlobalFilter: false,
        accessorFn: (c) => c.funnel.members,
        meta: { label: "Cohort" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cohort" align="right" />,
        cell: ({ row }) => <div className="text-right tabular-nums text-foreground">{fmtNum(row.original.funnel.members)}</div>,
      },
      {
        id: "sent",
        enableGlobalFilter: false,
        accessorFn: (c) => (c.funnel.members ? c.funnel.sent / c.funnel.members : 0),
        meta: { label: "Sent" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sent" />,
        cell: ({ row }) => {
          const f = row.original.funnel;
          const ratio = f.members ? Math.min(f.sent / f.members, 1) : 0;
          return (
            <div className="min-w-28 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular-nums text-foreground">{fmtNum(f.sent)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{share(f.sent, f.members)} of cohort</span>
              </div>
              <Progress value={ratio * 100} aria-label={`Sent ${share(f.sent, f.members)} of cohort`} className={cn("h-1.5", BRAND_BAR)} />
            </div>
          );
        },
      },
      {
        id: "opened",
        enableGlobalFilter: false,
        accessorFn: (c) => c.funnel.opened,
        meta: { label: "Opened" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Opened" align="right" />,
        cell: ({ row }) => <CountShare value={row.original.funnel.opened} of={row.original.funnel.sent} whole="sent" />,
      },
      {
        id: "refreshed",
        enableGlobalFilter: false,
        accessorFn: (c) => c.funnel.refreshed,
        meta: { label: "Refreshed" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Refreshed" align="right" />,
        cell: ({ row }) => <CountShare value={row.original.funnel.refreshed} of={row.original.funnel.members} whole="cohort" />,
      },
      {
        id: "messages",
        enableGlobalFilter: false,
        accessorFn: (c) => c.funnel.messages_sent,
        meta: { label: "Messages sent" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Messages" align="right" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{fmtNum(row.original.funnel.messages_sent)}</div>,
      },
      {
        id: "unreachable",
        enableGlobalFilter: false,
        accessorFn: (c) => c.funnel.unreachable,
        meta: { label: "Unreachable" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Unreachable" align="right" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{fmtNum(row.original.funnel.unreachable)}</div>,
      },
      {
        id: "opted_out",
        enableGlobalFilter: false,
        accessorFn: (c) => c.funnel.opted_out,
        meta: { label: "Opted out" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Opted out" align="right" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{fmtNum(row.original.funnel.opted_out)}</div>,
      },
      {
        id: "bounce",
        enableGlobalFilter: false,
        accessorFn: (c) => c.funnel.health.bounce_rate,
        meta: { label: "Bounce rate" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Bounces" align="right" />,
        cell: ({ row }) => {
          const h = row.original.funnel.health;
          return (
            <div className="text-right">
              <div className="tabular-nums text-foreground">{pct(h.bounce_rate)}</div>
              <div className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{plural(h.complaints, "complaint")}</div>
            </div>
          );
        },
      },
      {
        accessorKey: "created_at",
        enableGlobalFilter: false,
        meta: { label: "Created" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        cell: ({ row }) => <RelativeTime iso={row.original.created_at} className="text-muted-foreground" />,
      },
      {
        id: "actions",
        enableGlobalFilter: false,
        size: 48,
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const c = row.original;
          const open = c.status !== "cancelled" && c.status !== "completed";
          const working = rowBusy === c.id;
          const actions: RowAction[] = [
            {
              label: row.getIsExpanded() ? "Hide details" : "View details",
              icon: row.getIsExpanded() ? EyeOff : Eye,
              onSelect: () => row.toggleExpanded(),
            },
          ];
          if (isAdmin && open) {
            actions.push(
              c.status === "active"
                ? { label: "Pause", icon: Pause, disabled: working, separatorBefore: true, onSelect: () => setStatus(c, "pause") }
                : { label: "Resume", icon: Play, disabled: working, separatorBefore: true, onSelect: () => setStatus(c, "resume") },
              { label: "Cancel campaign", icon: X, destructive: true, disabled: working, onSelect: () => setCancelling(c) },
            );
          }
          return working ? (
            <div className="flex size-8 items-center justify-center" aria-label="Updating">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <RowActions actions={actions} label="Campaign actions" />
          );
        },
      },
    ],
    [isAdmin, rowBusy, setStatus],
  );

  const total = list?.length ?? 0;

  return (
    <div className="space-y-6">
      {settings && <Warnings items={settings.warnings} />}

      <TalentPool segments={segments} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          className="min-w-0"
          title="Clean-up (phase 0)"
          description="Duplicates and unusable emails, before anything is sent."
          action={
            isAdmin && (
              <Button
                variant="outline"
                disabled={busy === "backfill"}
                onClick={() => run("backfill", () => talentPost("/phase0/backfill", { check_mx: false }), "Profiles checked")}
              >
                {busy === "backfill" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check all profiles
              </Button>
            )
          }
        >
          {phase0 ? (
            <CleanupChecks report={phase0} isAdmin={isAdmin} busy={busy} onReviewMerge={reviewMerge} />
          ) : (
            <div className="space-y-4" aria-label="Loading">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-6 w-10" />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="min-w-0" title="Sending" description={deliv?.usage_today ? `Sender domain ${deliv.usage_today.domain}` : undefined}>
          {deliv ? (
            <Sending
              deliv={deliv}
              isAdmin={isAdmin}
              busy={busy}
              onResume={() => run("resume-domain", () => talentPost("/sender-domain/resume", {}), "Sending resumed")}
            />
          ) : (
            <div className="space-y-4" aria-label="Loading">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          )}
        </Panel>
      </div>

      <BackfillPanel />

      <Panel
        className="min-w-0"
        title="Refresh campaigns"
        description="Each person gets at most three messages per cycle — touch 1, then 3 days, touch 2, then 4 days, touch 3 — and the sequence stops the moment they answer, opt out or bounce. Click a campaign for its funnel."
        action={
          isAdmin && (
            <>
              <NewPilot size={pilotSize} onSize={setPilotSize} busy={busy === "pilot"} onCreate={createPilot}>
                <Button variant="primary">
                  <Sparkles /> New pilot
                </Button>
              </NewPilot>
              <Button variant="outline" disabled={busy === "sweep"} onClick={() => run("sweep", () => talentPost("/sweep", {}), "Sweep queued")}>
                {busy === "sweep" ? <Loader2 className="animate-spin" /> : <Send />} Run sweep now
              </Button>
            </>
          )
        }
      >
        <DataTable
          storageKey="campaigns"
          columns={columns}
          data={list}
          getRowId={(c) => c.id}
          renderExpanded={(c) => <CampaignDetail c={c} />}
          initialSorting={[{ id: "created_at", desc: true }]}
          initialHidden={["messages", "unreachable", "opted_out", "bounce"]}
          pageSize={10}
          noPagination={total <= 10}
          empty={
            total === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No refresh campaigns yet"
                description="Start with a pilot: it samples consented profiles evenly across CV ages (under 12 months, 12 to 24, over 24)."
                action={
                  isAdmin ? (
                    <NewPilot size={pilotSize} onSize={setPilotSize} busy={busy === "pilot"} onCreate={createPilot}>
                      <Button variant="primary" className="h-8">
                        <Sparkles /> Start a pilot
                      </Button>
                    </NewPilot>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState icon={Search} title="No campaigns match" description="Clear the search or a filter to see them all." />
            )
          }
          toolbar={(table) => (
            <Toolbar
              table={table}
              actions={
                <Button variant="outline" className="h-8 px-2.5" disabled={reloading} onClick={reload} aria-label="Reload campaigns">
                  <RotateCw className={cn(reloading && "animate-spin")} /> Reload
                </Button>
              }
            >
              <SearchBox
                value={(table.getState().globalFilter as string) ?? ""}
                onChange={(v) => table.setGlobalFilter(v)}
                placeholder="Search campaigns…"
              />
              <ColumnFilter column={table.getColumn("status")} title="Status" options={STATUS_OPTIONS} />
              <ColumnFilter column={table.getColumn("type")} title="Type" options={TYPE_OPTIONS} />
            </Toolbar>
          )}
        />
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

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this campaign?"
        description={
          cancelling
            ? `"${cancelling.name}" stops for good: nobody in it gets another message, and profiles it was refreshing go back to stale. This can't be resumed.`
            : ""
        }
        confirmLabel="Cancel campaign"
        cancelLabel="Keep it"
        variant="danger"
        loading={!!cancelling && rowBusy === cancelling.id}
        onConfirm={() => {
          if (cancelling) setStatus(cancelling, "cancel").then(() => setCancelling(null));
        }}
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
