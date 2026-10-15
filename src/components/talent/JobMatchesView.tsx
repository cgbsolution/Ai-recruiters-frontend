"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef, HeaderContext, Table as TanTable } from "@tanstack/react-table";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  ChevronRight,
  Clock3,
  FileSearch,
  History,
  LayoutList,
  ListChecks,
  Loader2,
  MailCheck,
  MailX,
  MapPin,
  Mic,
  Play,
  Save,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Target,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { ConsentDialog } from "./ConsentDialog";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  FacetedFilter,
  Person,
  RelativeTime,
  RowActions,
  ScoreBar,
  SearchBox,
  Toolbar,
  type FilterOption,
  type RowAction,
} from "./data-table";
import { MatchCard, MatchDetails, MatchFacts, MetIcon, RatingButtons, mustHavesMet, roleLine, type MatchRating } from "./MatchCard";
import { MatchRunStatus } from "./MatchRunStatus";
import { ShortlistPanel } from "./ShortlistPanel";
import { Panel, Pill, stackedAction, TalentShell, useTalentOrg, type TalentIcon } from "./TalentShell";

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

// ── Job settings form ───────────────────────────────────────────────────────

function Field({ id, label, help, className, children }: { id: string; label: string; help?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}

/** A number input with its unit shown inside, on the right. */
function UnitInput({ unit, className, ...props }: React.ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className="relative">
      <Input {...props} className={cn("pr-16 tabular-nums", className)} />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        {unit}
      </span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: TalentIcon; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function SettingsForm({ job, onSaved, onClose }: { job: TalentJob; onSaved: () => void; onClose: () => void }) {
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
  const set = (k: keyof typeof form, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

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
      icon={SlidersHorizontal}
      title="How the agent works this job"
      description="Copilot: you approve the invite list. Autopilot: the agent invites the top matches itself. Submissions to the client and rejections always need you."
      action={
        <Button variant="ghost" size="icon" className="size-8" aria-label="Close settings" onClick={onClose}>
          <X />
        </Button>
      }
    >
      <div className="space-y-6">
        <section className="space-y-4" aria-label="Matching">
          <SectionTitle icon={Target} title="Matching" description="Who gets invited, and the limits a candidate must fit." />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <UnitInput id="top_k" unit="people" type="number" min={1} max={200} value={form.top_k} onChange={(e) => set("top_k", e.target.value)} />
            </Field>
            <Field id="budget" label="Budget (max LPA)">
              <UnitInput
                id="budget"
                unit="LPA"
                type="number"
                min={0}
                step="0.5"
                value={form.budget_max_ctc}
                onChange={(e) => set("budget_max_ctc", e.target.value)}
              />
            </Field>
            <Field id="notice" label="Longest notice (days)">
              <UnitInput
                id="notice"
                unit="days"
                type="number"
                min={0}
                max={365}
                value={form.max_notice_days}
                onChange={(e) => set("max_notice_days", e.target.value)}
              />
            </Field>
            <Field id="locations" label="Locations (comma separated)" className="sm:col-span-2">
              <Input id="locations" placeholder={job.location} value={form.locations} onChange={(e) => set("locations", e.target.value)} />
            </Field>
            <div className="flex min-h-11 items-center justify-between gap-3 self-end rounded-md border px-3 py-2 sm:col-span-2">
              <Label htmlFor="relocate" className="leading-snug font-normal">
                Consider people willing to relocate
              </Label>
              <Switch id="relocate" checked={form.relocation_ok} onCheckedChange={(v) => set("relocation_ok", v)} />
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-4" aria-label="Requirements">
          <SectionTitle icon={ListChecks} title="Requirements" description="What the evidence is checked against, one per line." />
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="must" label="Must-haves (one per line)" help="Empty: derived from the job's required skills and experience.">
              <Textarea
                id="must"
                aria-describedby="must-help"
                rows={5}
                placeholder={job.effective_must_haves.join("\n")}
                value={form.must_haves}
                onChange={(e) => set("must_haves", e.target.value)}
              />
            </Field>
            <Field id="nice" label="Nice to have (one per line)">
              <Textarea id="nice" rows={5} value={form.nice_to_haves} onChange={(e) => set("nice_to_haves", e.target.value)} />
            </Field>
          </div>
        </section>

        <Separator />

        <section className="space-y-4" aria-label="Interview">
          <SectionTitle icon={Mic} title="Interview" description="The first-round AI interview the agent schedules." />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <UnitInput
                id="questions"
                unit="8–12"
                type="number"
                min={8}
                max={12}
                value={form.question_count}
                onChange={(e) => set("question_count", e.target.value)}
              />
            </Field>
            <Field id="time_limit" label="Time limit (minutes)">
              <UnitInput
                id="time_limit"
                unit="min"
                type="number"
                min={25}
                max={30}
                value={form.time_limit_minutes}
                onChange={(e) => set("time_limit_minutes", e.target.value)}
              />
            </Field>
            <Field id="slot" label="Slot length (minutes)">
              <UnitInput
                id="slot"
                unit="min"
                type="number"
                min={15}
                max={120}
                value={form.slot_minutes}
                onChange={(e) => set("slot_minutes", e.target.value)}
              />
            </Field>
            <Field
              id="rubric"
              label="Interview rubric (one criterion per line: “Criterion — what good looks like”)"
              className="sm:col-span-2 xl:col-span-4"
            >
              <Textarea
                id="rubric"
                rows={4}
                placeholder={"Kafka at scale — has run production streaming pipelines\nCommunication — explains trade-offs clearly"}
                value={form.rubric}
                onChange={(e) => set("rubric", e.target.value)}
              />
            </Field>
          </div>
        </section>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </div>
    </Panel>
  );
}

// ── Ranked matches ──────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_refresh", label: "Needs refresh" },
  { key: "approval_pending", label: "Awaiting approval" },
  { key: "invited", label: "Invited" },
  { key: "scheduled", label: "Scheduled" },
  { key: "interviewed", label: "Interviewed" },
  { key: "shortlisted", label: "Shortlisted" },
];

type View = "table" | "cards";
const VIEW_KEY = "talent-job-matches-view";
const CARD_PAGE = 20;

/** Table or cards, remembered in this browser (cards by default on phones). */
function useStoredView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>("table");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(VIEW_KEY);
    } catch {
      /* storage unavailable */
    }
    if (saved === "table" || saved === "cards") setView(saved);
    else if (window.matchMedia?.("(max-width: 639px)").matches) setView("cards");
  }, []);
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };
  return [view, choose];
}

const canInvite = (m: MatchItem) => (m.status === "ranked" || m.status === "needs_refresh") && m.ai_score != null;
/** Blocked only for want of consent (not a bounce or do-not-contact), so recording it would help. */
const needsConsent = (m: MatchItem) =>
  !!m.contact && !m.contact.allowed && (m.contact.code === "no_consent" || !!m.contact.code?.startsWith("consent_"));
const contactKey = (m: MatchItem) => (!m.contact ? "unknown" : m.contact.allowed ? "allowed" : "blocked");
const CONTACT_LABEL: Record<string, string> = { allowed: "Can email", blocked: "Can't email", unknown: "Not checked" };
const RATING_LABEL: Record<string, string> = { relevant: "Relevant", not_relevant: "Not relevant", unrated: "Not rated" };

/** Ratings made on this page, so the table keeps its page and the two views agree. */
const RatingContext = createContext<{ get: (m: MatchItem) => MatchRating; set: (id: string, r: MatchRating) => void }>({
  get: (m) => m.recruiter_rating,
  set: () => {},
});

function RatingCell({ m }: { m: MatchItem }) {
  const ratings = useContext(RatingContext);
  return <RatingButtons matchId={m.id} rating={ratings.get(m)} onRated={ratings.set} />;
}

function InviteButton({
  m,
  onInvite,
  onConsent,
  className,
}: {
  m: MatchItem;
  onInvite: (m: MatchItem) => void;
  onConsent: (m: MatchItem) => void;
  className?: string;
}) {
  if (!canInvite(m)) return null;
  if (m.contact && !m.contact.allowed) {
    return (
      <div className="flex max-w-[260px] flex-col items-end gap-1 text-right">
        <Button variant="outline" className={className} disabled title={m.contact.reason ?? undefined}>
          <UserPlus /> Invite
        </Button>
        <span className="text-xs text-amber-700 dark:text-amber-400">Can’t email: {m.contact.reason}</span>
        {needsConsent(m) && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onConsent(m)}>
            <ShieldCheck /> Record consent
          </Button>
        )}
      </div>
    );
  }
  return (
    <Button variant="outline" className={className} onClick={() => onInvite(m)} title="Invite now (records your approval)">
      <UserPlus /> Invite
    </Button>
  );
}

function ContactBadge({ m }: { m: MatchItem }) {
  if (!m.contact) return <span className="text-muted-foreground">—</span>;
  if (m.contact.allowed) {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-emerald-700 dark:text-emerald-300">
        <MailCheck /> Can email
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          className="gap-1 border-amber-200 bg-amber-50 font-normal text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <MailX /> Can’t email
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{m.contact.reason ?? "Not reachable by email"}</TooltipContent>
    </Tooltip>
  );
}

function MustHavesBadge({ m }: { m: MatchItem }) {
  const tally = mustHavesMet(m);
  if (!tally) return <span className="text-muted-foreground">—</span>;
  const all = tally.met === tally.total;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          className={cn(
            "font-medium tabular-nums",
            all && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
          )}
        >
          {tally.met}/{tally.total}
          <span className="sr-only"> must-haves met</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <ul className="space-y-1 py-0.5">
          {(m.must_haves ?? []).map((h, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <MetIcon met={h.met} className="mt-px size-3.5 text-current dark:text-current" />
              <span>{h.requirement}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/** The detail under an expanded table row: the same evidence as a card. */
function ExpandedMatch({ m, onInvite, onConsent }: { m: MatchItem; onInvite: (m: MatchItem) => void; onConsent: (m: MatchItem) => void }) {
  return (
    // Stays in view while a wide table is scrolled sideways, and never wider than the screen.
    <div className="sticky left-4 space-y-4 py-1" style={{ maxWidth: "min(60rem, calc(100vw - 6rem))" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <MatchFacts m={m} />
        <InviteButton m={m} onInvite={onInvite} onConsent={onConsent} className="h-8" />
      </div>
      <Separator />
      <MatchDetails m={m} />
    </div>
  );
}

/** A column header with the sort / hide menu. */
function sortable(title: string) {
  return function SortableHeader({ column }: HeaderContext<MatchItem, unknown>) {
    return <DataTableColumnHeader column={column} title={title} />;
  };
}

function JobBody({ jobRef }: { jobRef: string }) {
  const { orgId } = useTalentOrg();
  const router = useRouter();
  const [job, setJob] = useState<TalentJob | null>(null);
  const [matches, setMatches] = useState<MatchItem[] | null>(null);
  const [pending, setPending] = useState<ApprovalItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);
  const [starting, setStarting] = useState(false);
  const [view, setView] = useStoredView();
  const [text, setText] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);
  const [contact, setContact] = useState<string[]>([]);
  const [rated, setRated] = useState<string[]>([]);
  const [ratings, setRatings] = useState<Record<string, MatchRating>>({});
  const [cardLimit, setCardLimit] = useState(CARD_PAGE);
  const [consentFor, setConsentFor] = useState<MatchItem | null>(null);
  const lastStatus = useRef<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const status = filter === "all" ? "" : `&status=${filter}`;
      const [j, m, a] = await Promise.all([
        talentGet<TalentJob>(`/jobs/${jobRef}`),
        talentGet<{ items: MatchItem[] }>(`/jobs/${jobRef}/matches?limit=200${status}`),
        talentGet<ApprovalItem[]>(`/approvals?job_id=${jobRef}&kind=invite`),
      ]);
      if (mine !== seq.current) return; // a newer load (another filter) wins
      setJob(j);
      // Keep the same list when nothing changed, so polling doesn't reset the table.
      setMatches((prev) => (prev && JSON.stringify(prev) === JSON.stringify(m.items) ? prev : m.items));
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

  useEffect(() => {
    setCardLimit(CARD_PAGE);
  }, [filter, text, fresh, contact, rated]);

  const invite = useCallback(
    async (m: MatchItem) => {
      try {
        await talentPost(`/matches/${m.id}/invite`, {});
        notifySuccess(`Inviting ${m.profile.name ?? "the candidate"}`);
        load();
      } catch (e) {
        notifyError((e as Error).message);
      }
    },
    [load],
  );

  const ratingOf = useCallback((m: MatchItem): MatchRating => (m.id in ratings ? ratings[m.id] : m.recruiter_rating), [ratings]);
  const rate = useCallback((id: string, r: MatchRating) => setRatings((prev) => ({ ...prev, [id]: r })), []);
  const ratingCtx = useMemo(() => ({ get: ratingOf, set: rate }), [ratingOf, rate]);

  const needle = text.trim().toLowerCase();
  // Ratings only change the list while the Rating filter is on; otherwise a
  // thumb leaves the rows as they are (and the table on its page).
  const ratingsForFilter = rated.length ? ratings : null;
  const shown = useMemo(() => {
    if (!matches) return null;
    return matches.filter((m) => {
      if (fresh.length && !fresh.includes(m.profile.verification_status)) return false;
      if (contact.length && !contact.includes(contactKey(m))) return false;
      if (ratingsForFilter) {
        const r = m.id in ratingsForFilter ? ratingsForFilter[m.id] : m.recruiter_rating;
        if (!rated.includes(r ?? "unrated")) return false;
      }
      if (needle) {
        const p = m.profile;
        const hay = [p.name, p.current_designation, p.current_company, p.city, `#${m.profile_id}`].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [matches, fresh, contact, rated, needle, ratingsForFilter]);

  const count = (key: (m: MatchItem) => string) => {
    const out = new Map<string, number>();
    (matches ?? []).forEach((m) => out.set(key(m), (out.get(key(m)) ?? 0) + 1));
    return out;
  };
  const freshCounts = count((m) => m.profile.verification_status);
  const contactCounts = count(contactKey);
  const ratingCounts = count((m) => ratingOf(m) ?? "unrated");
  const freshOptions: FilterOption[] = [...freshCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, n]) => ({ value, label: value.replace(/_/g, " "), count: n }));
  const contactOptions: FilterOption[] = (["allowed", "blocked", "unknown"] as const)
    .filter((k) => contactCounts.has(k))
    .map((k) => ({ value: k, label: CONTACT_LABEL[k], icon: k === "allowed" ? MailCheck : k === "blocked" ? MailX : undefined, count: contactCounts.get(k) }));
  const ratingOptions: FilterOption[] = (["relevant", "not_relevant", "unrated"] as const).map((k) => ({
    value: k,
    label: RATING_LABEL[k],
    icon: k === "relevant" ? ThumbsUp : k === "not_relevant" ? ThumbsDown : undefined,
    count: ratingCounts.get(k) ?? 0,
  }));

  const clientFiltered = !!(needle || fresh.length || contact.length || rated.length);
  const changeFilter = (v: string) => {
    if (v === filter) return;
    setMatches(null);
    setFilter(v);
  };
  const resetFilters = () => {
    setText("");
    setFresh([]);
    setContact([]);
    setRated([]);
    changeFilter("all");
  };

  const columns = useMemo<ColumnDef<MatchItem, unknown>[]>(
    () => [
      {
        id: "expand",
        size: 32,
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">Evidence</span>,
        cell: ({ row }) => (
          <ChevronRight
            aria-hidden
            className={cn("size-4 text-muted-foreground transition-transform", row.getIsExpanded() && "rotate-90")}
          />
        ),
      },
      {
        accessorKey: "rank",
        meta: { label: "Rank" },
        size: 64,
        enableHiding: false,
        header: sortable("Rank"),
        cell: ({ row }) => <span className="font-medium text-muted-foreground tabular-nums">#{row.original.rank}</span>,
      },
      {
        id: "candidate",
        accessorFn: (m) => m.profile.name || `Profile ${m.profile_id}`,
        meta: { label: "Candidate" },
        enableHiding: false,
        header: sortable("Candidate"),
        cell: ({ row }) => (
          <div className="max-w-64">
            <Person name={row.original.profile.name || `Profile ${row.original.profile_id}`} sub={roleLine(row.original.profile)} seed={row.original.profile_id} />
          </div>
        ),
      },
      {
        id: "ai_score",
        accessorFn: (m) => m.ai_score ?? undefined,
        sortUndefined: "last",
        meta: { label: "AI score" },
        header: sortable("AI score"),
        cell: ({ row }) =>
          row.original.ai_score == null ? (
            <span title={row.original.status_reason?.replace(/_/g, " ") ?? undefined}>
              <Pill tone="amber">not scored</Pill>
            </span>
          ) : (
            <ScoreBar value={row.original.ai_score} />
          ),
      },
      {
        id: "freshness",
        accessorFn: (m) => m.profile.verification_status,
        meta: { label: "Freshness" },
        header: sortable("Freshness"),
        cell: ({ row }) => <Pill>{row.original.profile.verification_status}</Pill>,
      },
      {
        accessorKey: "status",
        meta: { label: "Status" },
        header: sortable("Status"),
        cell: ({ row }) => <Pill>{row.original.status}</Pill>,
      },
      {
        id: "must_haves",
        accessorFn: (m) => {
          const t = mustHavesMet(m);
          return t ? t.met / t.total : undefined;
        },
        sortUndefined: "last",
        meta: { label: "Must-haves" },
        header: sortable("Must-haves"),
        cell: ({ row }) => <MustHavesBadge m={row.original} />,
      },
      {
        id: "contact",
        accessorFn: contactKey,
        meta: { label: "Contact" },
        header: sortable("Contact"),
        cell: ({ row }) => <ContactBadge m={row.original} />,
      },
      {
        id: "rating",
        accessorFn: (m) => m.recruiter_rating ?? "unrated",
        meta: { label: "Rating" },
        enableSorting: false,
        header: sortable("Rating"),
        cell: ({ row }) => <RatingCell m={row.original} />,
      },
      {
        id: "experience",
        accessorFn: (m) => m.profile.experience_years ?? undefined,
        sortUndefined: "last",
        meta: { label: "Experience" },
        header: sortable("Experience"),
        cell: ({ row }) =>
          row.original.profile.experience_years != null ? (
            <span className="tabular-nums">{row.original.profile.experience_years} yrs</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "notice",
        accessorFn: (m) => m.profile.notice_period_days ?? undefined,
        sortUndefined: "last",
        meta: { label: "Notice" },
        header: sortable("Notice"),
        cell: ({ row }) =>
          row.original.profile.notice_period_days != null ? (
            <span className="tabular-nums">{row.original.profile.notice_period_days} days</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "expected_ctc",
        accessorFn: (m) => m.profile.expected_ctc ?? undefined,
        sortUndefined: "last",
        meta: { label: "Expected CTC" },
        header: sortable("Expects"),
        cell: ({ row }) =>
          row.original.profile.expected_ctc != null ? (
            <span className="tabular-nums">{row.original.profile.expected_ctc} LPA</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "city",
        accessorFn: (m) => m.profile.city ?? "",
        meta: { label: "City" },
        header: sortable("City"),
        cell: ({ row }) => row.original.profile.city || <span className="text-muted-foreground">—</span>,
      },
      {
        id: "invited_at",
        accessorFn: (m) => m.invited_at ?? undefined,
        sortUndefined: "last",
        meta: { label: "Invited" },
        header: sortable("Invited"),
        cell: ({ row }) => <RelativeTime iso={row.original.invited_at} className="text-muted-foreground" />,
      },
      {
        id: "actions",
        size: 48,
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const m = row.original;
          const blocked = !!m.contact && !m.contact.allowed;
          const actions: RowAction[] = [];
          if (canInvite(m)) {
            actions.push({ label: blocked ? "Invite (can’t email)" : "Invite", icon: UserPlus, disabled: blocked, onSelect: () => invite(m) });
          }
          actions.push({ label: "Record consent", icon: ShieldCheck, onSelect: () => setConsentFor(m) });
          actions.push({
            label: row.getIsExpanded() ? "Hide evidence" : "Show evidence",
            icon: FileSearch,
            onSelect: () => row.toggleExpanded(),
          });
          actions.push({
            label: "Audit trail",
            icon: History,
            separatorBefore: true,
            onSelect: () => router.push(`/talent/audit?profile_id=${m.profile_id}`),
          });
          return <RowActions actions={actions} label={`Actions for ${m.profile.name || `profile ${m.profile_id}`}`} />;
        },
      },
    ],
    [invite, router],
  );

  if (!job) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

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

  const total = Object.values(job.matches ?? {}).reduce((a, b) => a + b, 0);
  const autopilot = job.settings.autonomy_mode === "autopilot";
  const skills = job.skills ?? [];

  const emptyState =
    matches && matches.length > 0 ? (
      <EmptyState
        icon={Search}
        title="Nothing matches these filters"
        description="Try another search or clear a filter."
        action={
          <Button variant="outline" className="h-8" onClick={resetFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={filter !== "all" ? Search : Users}
        title={filter !== "all" ? "No matches in this state" : running ? "Matching is running" : "No matches yet"}
        description={
          filter !== "all"
            ? "Pick another status above to see the rest."
            : running
              ? "Matches will appear here as soon as the run finishes."
              : "Run matching to rank the talent pool for this job."
        }
        action={
          filter === "all" && !running ? (
            <Button variant="primary" className="h-8" disabled={starting} onClick={run}>
              <Play /> Run matching
            </Button>
          ) : undefined
        }
      />
    );

  const toolbar = (table?: TanTable<MatchItem>) => (
    <Toolbar table={table} filtered={clientFiltered || filter !== "all"} onReset={resetFilters}>
      <SearchBox value={text} onChange={setText} placeholder="Search name, role, company…" />
      <FacetedFilter title="Freshness" options={freshOptions} selected={fresh} onChange={setFresh} />
      <FacetedFilter title="Contact" options={contactOptions} selected={contact} onChange={setContact} />
      <FacetedFilter title="Rating" options={ratingOptions} selected={rated} onChange={setRated} />
    </Toolbar>
  );

  const viewToggle = (
    <Tabs value={view} onValueChange={(v) => setView(v as View)}>
      <TabsList className="h-9">
        <TabsTrigger value="table" className="px-2.5" aria-label="Table view">
          <Table2 />
          <span className="hidden sm:inline">Table</span>
        </TabsTrigger>
        <TabsTrigger value="cards" className="px-2.5" aria-label="Cards view">
          <LayoutList />
          <span className="hidden sm:inline">Cards</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <div className="space-y-6">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="col-start-1 flex flex-wrap items-center gap-2 text-lg leading-tight">
            {job.title}
            <Pill tone={autopilot ? "blue" : "gray"}>{job.settings.autonomy_mode}</Pill>
            {job.status && <Pill>{job.status}</Pill>}
          </CardTitle>
          <CardDescription className="col-start-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden className="size-3.5" />
              {job.location || "Location not set"}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Briefcase aria-hidden className="size-3.5" />
              {job.experience_min ?? 0}-{job.experience_max ?? "?"} yrs
            </span>
            {job.department && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 aria-hidden className="size-3.5" />
                {job.department}
              </span>
            )}
          </CardDescription>
          <CardAction className={stackedAction}>
            <Button
              variant={showSettings ? "secondary" : "outline"}
              aria-expanded={showSettings}
              aria-controls="job-settings"
              onClick={() => setShowSettings(!showSettings)}
            >
              <SlidersHorizontal /> {showSettings ? "Hide settings" : "Settings"}
            </Button>
            <Button variant="outline" disabled={running} onClick={plan}>
              <Send /> {autopilot ? "Invite top matches" : "Prepare invites"}
            </Button>
            <Button variant="primary" disabled={running || starting} onClick={run}>
              {running || starting ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Matching…" : "Run matching"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Skills">
              {skills.slice(0, 12).map((s) => (
                <Badge key={s} variant="outline" className="font-normal">
                  {s}
                </Badge>
              ))}
              {skills.length > 12 && (
                <Badge variant="secondary" className="font-normal" title={skills.slice(12).join(", ")}>
                  +{skills.length - 12} more
                </Badge>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 aria-hidden className="size-3.5" />
              {job.settings.last_matched_at ? (
                <>
                  Last matched <RelativeTime iso={job.settings.last_matched_at} />
                </>
              ) : (
                "Not matched yet"
              )}
            </span>
            {total > 0 && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Sparkles aria-hidden className="size-3.5" />
                {total.toLocaleString()} ranked candidate{total === 1 ? "" : "s"}
              </span>
            )}
            {job.worker && (
              <span title={job.worker.last_seen_at ? `Last seen ${fmtDate(job.worker.last_seen_at, true)}` : "Never seen"}>
                <Pill tone={job.worker.ok ? "green" : "amber"}>{job.worker.ok ? "worker online" : "worker not checking in"}</Pill>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <MatchRunStatus job={job} />

      {showSettings && (
        <div id="job-settings">
          <SettingsForm job={job} onSaved={load} onClose={() => setShowSettings(false)} />
        </div>
      )}

      <ApprovalsPanel key={pending.map((p) => p.id).join()} items={pending} onDone={load} />

      {consentFor && (
        <ConsentDialog
          profileId={consentFor.profile_id}
          name={consentFor.profile.name || `profile #${consentFor.profile_id}`}
          open
          onOpenChange={(o) => !o && setConsentFor(null)}
          onSaved={load}
        />
      )}

      <ShortlistPanel jobRef={job.ref} />

      <Panel
        icon={Users}
        title="Ranked matches"
        description="Ordered by the evidence-based score; fresh profiles first on ties. Thumbs feed the precision@10 report."
        action={viewToggle}
      >
        <div className="space-y-3">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <Tabs value={filter} onValueChange={changeFilter}>
              <TabsList className="h-9 w-max" aria-label="Filter by status">
                {FILTERS.map((f) => {
                  const n = f.key === "all" ? total : job.matches[f.key];
                  return (
                    <TabsTrigger key={f.key} value={f.key} className="flex-none gap-1.5 px-3">
                      {f.label}
                      {n ? (
                        <Badge variant="secondary" className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">
                          {n.toLocaleString()}
                        </Badge>
                      ) : null}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>

          <RatingContext.Provider value={ratingCtx}>
            {view === "table" ? (
              <DataTable
                storageKey="job-matches"
                columns={columns}
                data={shown}
                getRowId={(m) => m.id}
                renderExpanded={(m) => <ExpandedMatch m={m} onInvite={invite} onConsent={setConsentFor} />}
                initialHidden={["must_haves", "experience", "notice", "expected_ctc", "city", "invited_at"]}
                empty={emptyState}
                toolbar={(table) => toolbar(table)}
              />
            ) : (
              <div className="space-y-3">
                {toolbar()}
                {shown === null ? (
                  <div className="space-y-3" role="status" aria-label="Loading">
                    <Skeleton className="h-44 w-full rounded-xl" />
                    <Skeleton className="h-44 w-full rounded-xl" />
                  </div>
                ) : shown.length === 0 ? (
                  <div className="rounded-lg border border-dashed">{emptyState}</div>
                ) : (
                  <>
                    {shown.slice(0, cardLimit).map((m) => (
                      <MatchCard
                        key={m.id}
                        m={{ ...m, recruiter_rating: ratingOf(m) }}
                        onRated={rate}
                        actions={canInvite(m) ? <InviteButton m={m} onInvite={invite} onConsent={setConsentFor} /> : null}
                      />
                    ))}
                    <div className="flex flex-col items-center gap-2 pt-1 text-sm text-muted-foreground">
                      <span className="tabular-nums">
                        Showing {Math.min(cardLimit, shown.length).toLocaleString()} of {shown.length.toLocaleString()}
                      </span>
                      {shown.length > cardLimit && (
                        <Button variant="outline" className="h-8" onClick={() => setCardLimit((c) => c + CARD_PAGE)}>
                          Show {Math.min(CARD_PAGE, shown.length - cardLimit)} more
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </RatingContext.Provider>
        </div>
      </Panel>
    </div>
  );
}

export default function JobMatchesView({ jobRef }: { jobRef: string }) {
  return (
    <TalentShell
      icon={Briefcase}
      title="Job matches"
      subtitle="Evidence for every requirement, quoted from the CV."
      actions={
        <Button variant="outline" asChild>
          <Link href="/talent/jobs">
            <ArrowLeft /> All jobs
          </Link>
        </Button>
      }
    >
      <JobBody jobRef={jobRef} />
    </TalentShell>
  );
}
