"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  Briefcase,
  Video,
  Send,
  Trophy,
  XCircle,
  UserCheck,
  ArrowRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, mediaUrl } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";

// ── Types ───────────────────────────────────────────────────────────────────

type CandidateStatus = "Applied" | "Interview" | "Offered" | "Selected" | "Hired" | "Rejected";

type Candidate = {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  applied_date: string;
  status: CandidateStatus;
  /** Signed, expiring photo URL (API-relative) or null. */
  image_url: string | null;
  job_id: number | null;
  job_title: string | null;
  candidate_stage: string | null;
  interview_status: string | null;
  score: number | null;
};

type JobItem = {
  id: number;
  title: string;
  department: string;
  status: string;
};

type FilterTab = "All Candidates" | CandidateStatus;

const TABS: FilterTab[] = [
  "All Candidates",
  "Applied",
  "Interview",
  "Offered",
  "Selected",
  "Hired",
  "Rejected",
];

// ── Visual tokens ───────────────────────────────────────────────────────────

const STATUS_THEME: Record<
  CandidateStatus,
  { bar: string; chip: string; dot: string }
> = {
  Applied: {
    bar: "bg-gradient-to-r from-amber-400 to-orange-500",
    chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    dot: "bg-amber-500",
  },
  Interview: {
    bar: "bg-gradient-to-r from-sky-400 to-indigo-500",
    chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
    dot: "bg-sky-500",
  },
  Offered: {
    bar: "bg-gradient-to-r from-violet-400 to-purple-500",
    chip: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
    dot: "bg-violet-500",
  },
  Selected: {
    bar: "bg-gradient-to-r from-teal-400 to-emerald-500",
    chip: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30",
    dot: "bg-teal-500",
  },
  Hired: {
    bar: "bg-gradient-to-r from-emerald-400 to-green-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    dot: "bg-emerald-500",
  },
  Rejected: {
    bar: "bg-gradient-to-r from-rose-400 to-red-500",
    chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
    dot: "bg-rose-500",
  },
};

// Avatar gradient palette (deterministic by id)
const AVATAR_PALETTE = [
  "from-indigo-500 to-blue-500",
  "from-orange-500 to-amber-500",
  "from-emerald-500 to-teal-500",
  "from-pink-500 to-rose-500",
  "from-purple-500 to-fuchsia-500",
  "from-sky-500 to-cyan-500",
];

const getInitials = (name?: string) =>
  !name
    ? "?"
    : name
        .split(" ")
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();

const formatDate = (iso: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

// ── StatTile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon: Icon,
  iconWrap,
  topBar,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  iconWrap: string;
  topBar: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900/40",
        active
          ? "border-indigo-300 shadow-sm ring-1 ring-indigo-200 dark:border-indigo-500/40 dark:ring-indigo-500/20"
          : "border-gray-200 dark:border-white/10",
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1", topBar)} />
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1", iconWrap)}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
        {value.toLocaleString()}
      </p>
    </button>
  );
}

// ── CandidateCard ────────────────────────────────────────────────────────────

function CandidateCard({
  c,
  onAction,
  onHire,
}: {
  c: Candidate;
  onAction: (id: number, newStatus: CandidateStatus) => void;
  onHire: (c: Candidate) => void;
}) {
  const theme = STATUS_THEME[c.status];
  const avatarGradient = AVATAR_PALETTE[c.id % AVATAR_PALETTE.length];
  // Signed photo URL from the API; null (no photo / placeholder) → initials.
  const resolvedImage = mediaUrl(c.image_url) ?? null;
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = resolvedImage && !imageFailed;
  const initials = getInitials(c.name);
  const showEmail = c.email && !c.email.endsWith("@resume.local");

  const actionRow = (() => {
    switch (c.status) {
      case "Applied":
        return (
          <Button
            size="sm"
            onClick={() => onAction(c.id, "Interview")}
            className="h-9 w-full gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm hover:from-indigo-600 hover:to-purple-600 hover:shadow-indigo-500/25"
          >
            <Video className="h-3.5 w-3.5" /> Move to Interview
            <ArrowRight className="ml-auto h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
          </Button>
        );
      case "Interview":
        return (
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              onClick={() => onAction(c.id, "Offered")}
              className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm hover:from-indigo-600 hover:to-purple-600"
            >
              <Send className="h-3.5 w-3.5" /> Send Offer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction(c.id, "Rejected")}
              className="h-9 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              Reject
            </Button>
          </div>
        );
      case "Offered":
        return (
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              onClick={() => onAction(c.id, "Selected")}
              className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm hover:from-teal-600 hover:to-emerald-600"
            >
              <UserCheck className="h-3.5 w-3.5" /> Select
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction(c.id, "Rejected")}
              className="h-9 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              Reject
            </Button>
          </div>
        );
      case "Selected":
        return (
          <Button
            size="sm"
            onClick={() => onHire(c)}
            className="h-9 w-full gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-sm hover:from-emerald-600 hover:to-green-600"
          >
            <Trophy className="h-3.5 w-3.5" /> Mark as Hired
          </Button>
        );
      case "Hired":
        return (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              <Trophy className="h-3.5 w-3.5" /> Hired
            </div>
            {c.job_title && (
              <p className="mt-0.5 text-[11px] text-emerald-600/80 dark:text-emerald-300/80">for {c.job_title}</p>
            )}
          </div>
        );
      case "Rejected":
        return (
          <div className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-sm font-medium text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <XCircle className="h-3.5 w-3.5" /> Rejected
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="group/card relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-gray-900/40">
      {/* Top status accent */}
      <div className={cn("h-1 w-full", theme.bar)} />

      <div className="flex flex-col gap-4 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Avatar — real image when available, gradient+initials as fallback (and on load failure) */}
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvedImage!}
                alt={c.name}
                onError={() => setImageFailed(true)}
                className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm dark:ring-gray-900"
              />
            ) : (
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm ring-2 ring-white dark:ring-gray-900",
                  avatarGradient,
                )}
              >
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{c.name}</h4>
              {c.role && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{c.role}</p>}
            </div>
          </div>

          {/* Status chip */}
          <span
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
              theme.chip,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
            {c.status}
          </span>
        </div>

        {/* Job badge */}
        <div>
          {c.job_title ? (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
              <Briefcase className="h-3 w-3 shrink-0" />
              <span className="truncate">{c.job_title}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-400 ring-1 ring-gray-100 dark:bg-white/5 dark:text-gray-500 dark:ring-white/10">
              <Briefcase className="h-3 w-3 shrink-0" />
              No job linked
            </span>
          )}
        </div>

        {/* Contact details */}
        <div className="space-y-1.5 text-[13px] text-gray-600 dark:text-gray-300">
          {showEmail && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{c.email}</span>
            </div>
          )}
          {c.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{c.phone}</span>
            </div>
          )}
          {c.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{c.location}</span>
            </div>
          )}
          {c.applied_date && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span>Applied: {formatDate(c.applied_date)}</span>
            </div>
          )}
          {c.score != null && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                Score · {c.score.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="mt-1">{actionRow}</div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

const CandidateCards = () => {
  const [filter, setFilter] = useState<FilterTab>("All Candidates");
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Hire flow
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [hireCandidate, setHireCandidate] = useState<Candidate | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [hireLoading, setHireLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Always fetch the full list so we can render accurate counts on the tabs
  useEffect(() => {
    let cancelled = false;
    const fetchCandidates = async () => {
      setLoading(true);
      try {
        const data = await api<Candidate[]>("/candidates/");
        if (!cancelled) setAllCandidates(data);
      } catch (err) {
        if (!cancelled) console.error("Error fetching candidates:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCandidates();
    return () => {
      cancelled = true;
    };
  }, []);

  // Counts per status
  const counts = useMemo(() => {
    const base: Record<FilterTab, number> = {
      "All Candidates": allCandidates.length,
      Applied: 0,
      Interview: 0,
      Offered: 0,
      Selected: 0,
      Hired: 0,
      Rejected: 0,
    };
    for (const c of allCandidates) {
      if (c.status in base) base[c.status as FilterTab] += 1;
    }
    return base;
  }, [allCandidates]);

  // Filtered list
  const candidates = useMemo(
    () =>
      filter === "All Candidates"
        ? allCandidates
        : allCandidates.filter((c) => c.status === filter),
    [allCandidates, filter],
  );

  const handleStatusChange = useCallback(
    async (candidateId: number, newStatus: CandidateStatus) => {
      try {
        const updated = await api<Candidate>(`/candidates/${candidateId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        setAllCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId
              ? {
                  ...c,
                  status: (updated.status || newStatus) as CandidateStatus,
                  candidate_stage: updated.candidate_stage ?? c.candidate_stage,
                  interview_status: updated.interview_status ?? c.interview_status,
                }
              : c,
          ),
        );
        notifySuccess(`Candidate marked as ${newStatus}`);
      } catch {
        notifyError("Failed to update candidate status");
      }
    },
    [],
  );

  const initiateHire = useCallback(async (candidate: Candidate) => {
    if (candidate.job_id) {
      try {
        const res = await api<{ job_title: string }>(`/candidates/${candidate.id}/hire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: candidate.job_id }),
        });
        setAllCandidates((prev) =>
          prev.map((c) =>
            c.id === candidate.id ? { ...c, status: "Hired" as const, job_title: res.job_title || c.job_title } : c,
          ),
        );
        notifySuccess(`${candidate.name} hired for ${res.job_title || "the job"}`);
      } catch {
        notifyError("Failed to hire candidate");
      }
      return;
    }

    try {
      const assoc = await api<{ jobs: { job_id: number; job_title: string }[] }>(
        `/candidates/${candidate.id}/job-associations`,
      );
      if (assoc.jobs.length > 0) {
        const firstJob = assoc.jobs[0];
        const res = await api<{ job_title: string }>(`/candidates/${candidate.id}/hire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: firstJob.job_id }),
        });
        setAllCandidates((prev) =>
          prev.map((c) =>
            c.id === candidate.id ? { ...c, status: "Hired" as const, job_title: res.job_title || firstJob.job_title } : c,
          ),
        );
        notifySuccess(`${candidate.name} hired for ${firstJob.job_title}`);
      } else {
        setHireCandidate(candidate);
        setSelectedJobId(null);
        setHireModalOpen(true);
        setJobsLoading(true);
        try {
          const jobList = await api<JobItem[]>("/jobs/");
          setJobs(jobList);
        } catch {
          notifyError("Failed to load jobs");
        } finally {
          setJobsLoading(false);
        }
      }
    } catch {
      notifyError("Failed to check job associations");
    }
  }, []);

  const confirmHire = useCallback(async () => {
    if (!hireCandidate || !selectedJobId) return;
    setHireLoading(true);
    try {
      const res = await api<{ job_title: string }>(`/candidates/${hireCandidate.id}/hire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: selectedJobId }),
      });
      setAllCandidates((prev) =>
        prev.map((c) =>
          c.id === hireCandidate.id
            ? { ...c, status: "Hired" as const, job_id: selectedJobId, job_title: res.job_title }
            : c,
        ),
      );
      notifySuccess(`${hireCandidate.name} hired for ${res.job_title}`);
      setHireModalOpen(false);
      setHireCandidate(null);
    } catch {
      notifyError("Failed to hire candidate");
    } finally {
      setHireLoading(false);
    }
  }, [hireCandidate, selectedJobId]);

  return (
    <div className="space-y-5">
      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-5 sm:p-6 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-white/10">
            <Users className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-900/80 dark:text-indigo-300 dark:ring-indigo-500/20">
              <Sparkles className="h-3 w-3" /> Talent
            </span>
            <h1 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">Candidates</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Track every applicant across the hiring funnel — from application through offer and hire.
            </p>
          </div>
        </div>
      </div>

      {/* ── Stat tiles ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Total"
          value={counts["All Candidates"]}
          icon={Users}
          iconWrap="bg-indigo-50 text-indigo-500 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20"
          topBar="bg-gradient-to-r from-indigo-400 to-indigo-500"
          active={filter === "All Candidates"}
          onClick={() => setFilter("All Candidates")}
        />
        <StatTile
          label="In Interview"
          value={counts.Interview}
          icon={Video}
          iconWrap="bg-sky-50 text-sky-500 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20"
          topBar="bg-gradient-to-r from-sky-400 to-cyan-500"
          active={filter === "Interview"}
          onClick={() => setFilter("Interview")}
        />
        <StatTile
          label="Offered"
          value={counts.Offered}
          icon={Send}
          iconWrap="bg-amber-50 text-amber-500 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20"
          topBar="bg-gradient-to-r from-amber-400 to-orange-500"
          active={filter === "Offered"}
          onClick={() => setFilter("Offered")}
        />
        <StatTile
          label="Hired"
          value={counts.Hired}
          icon={Trophy}
          iconWrap="bg-emerald-50 text-emerald-500 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
          topBar="bg-gradient-to-r from-emerald-400 to-green-500"
          active={filter === "Hired"}
          onClick={() => setFilter("Hired")}
        />
        <StatTile
          label="Rejected"
          value={counts.Rejected}
          icon={XCircle}
          iconWrap="bg-rose-50 text-rose-500 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20"
          topBar="bg-gradient-to-r from-rose-400 to-red-500"
          active={filter === "Rejected"}
          onClick={() => setFilter("Rejected")}
        />
      </div>

      {/* ── Pill tabs (with counts) ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-0.5">
        {TABS.map((tab) => {
          const isActive = filter === tab;
          const count = counts[tab];
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-900/40 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/5",
              )}
            >
              <span>{tab}</span>
              <span
                className={cn(
                  "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Cards grid ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900/40">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mb-4 h-6 w-40 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="mt-5 h-9 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center dark:border-white/10 dark:bg-gray-900/40">
          <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-base font-medium text-gray-600 dark:text-gray-300">No candidates found</p>
          <p className="mt-1 text-sm text-gray-400">
            {filter === "All Candidates"
              ? "No candidates have been added yet."
              : `No candidates with status "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {candidates.map((c) => (
            <CandidateCard key={c.id} c={c} onAction={handleStatusChange} onHire={initiateHire} />
          ))}
        </div>
      )}

      {/* ── Hire Job Picker Modal ───────────────────────────────────────── */}
      <Dialog open={hireModalOpen} onOpenChange={setHireModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-500" />
              Select Job for Hire
            </DialogTitle>
          </DialogHeader>

          {hireCandidate && (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm",
                  AVATAR_PALETTE[hireCandidate.id % AVATAR_PALETTE.length],
                )}
              >
                {getInitials(hireCandidate.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900 dark:text-white">{hireCandidate.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{hireCandidate.email}</p>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600 dark:text-gray-300">
            This candidate isn&apos;t linked to a job yet. Pick a job to hire them for:
          </p>

          {jobsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400 dark:border-white/10">
              No jobs available
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {jobs.map((job) => {
                const selected = selectedJobId === job.id;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-colors",
                      selected
                        ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:ring-indigo-500/30"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Briefcase className={cn("h-4 w-4", selected ? "text-indigo-500" : "text-gray-400")} />
                      <p className={cn("text-sm font-medium", selected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-900 dark:text-white")}>
                        {job.title}
                      </p>
                    </div>
                    {job.department && (
                      <p className="mt-0.5 ml-6 text-xs text-gray-500 dark:text-gray-400">{job.department}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setHireModalOpen(false);
                setHireCandidate(null);
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedJobId || hireLoading}
              onClick={confirmHire}
              className="gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-600 hover:to-green-600 disabled:opacity-50"
            >
              <Trophy className="h-3.5 w-3.5" />
              {hireLoading ? "Hiring…" : "Confirm Hire"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CandidateCards;
