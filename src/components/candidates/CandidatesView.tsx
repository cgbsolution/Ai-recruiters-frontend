"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Link,
  MoreVertical,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import FitScoreBadge from "./FitScoreBadge";
import AddCandidateModal from "./AddCandidateModal";
import UploadResumesModal from "./UploadResumesModal";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import MatchCandidatesModal from "./MatchCandidatesModal";
import { api, apiPost, ApiError, API_BASE } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ResumeFitScore = string | null;

interface Candidate {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  location: string;
  status: string;
  job_id: number | null;
  candidate_stage: string;
  interview_status: string;
  interview_date: string | null;
  interview_timezone: string | null;
  resume_fit_score: ResumeFitScore;
  fit_score_reasoning: string | null;
  fit_score_details: string | null;
  resume_path: string | null;
  score: number | null;
  trust_score: number | null;
  grammar_score: number | null;
  confidence_score: number | null;
  clarity_score: number | null;
  pronunciation_score: number | null;
  enthusiasm_score: number | null;
  conciseness_score: number | null;
  ai_cheating_score: number | null;
  recording_link: string | null;
  video_duration: string | null;
  mail_contact_history: boolean | null;
  added_by: string | null;
}

interface SkillOut {
  id: number;
  skill: string;
  skill_criteria: string;
}

interface ResponsibilityOut {
  id: number;
  description: string;
}

interface Job {
  id: number;
  title: string;
  department?: string;
  location?: string;
  job_type?: string;
  experience_min?: number;
  experience_max?: number;
  openings?: number;
  status?: string;
  manager_name?: string;
  manager_phone?: string;
  manager_email?: string;
  interview_link?: string;
  interview_token?: string;
  upload_jd?: string;
  summary?: string;
  responsibilities?: ResponsibilityOut[];
  skills?: SkillOut[];
}

// "Candidates" is the "All" tab; the rest are stage-specific
const STAGES = ["Candidates", "AI Round", "Panel Round", "Offer-Made", "Rejected"];
const PAGE_SIZE = 20;

const STATUS_COLORS: Record<string, string> = {
  Scheduled: "bg-blue-100 text-blue-700",
  New: "bg-pink-100 text-pink-700",
  Completed: "bg-green-100 text-green-700",
  Cancelled: "bg-gray-100 text-gray-500",
  "Ended by Candidate": "bg-amber-100 text-amber-700",
  "Terminated – Cheating Detected": "bg-red-100 text-red-700",
  "Disconnected – Network Issue": "bg-orange-100 text-orange-700",
  "Candidate Terminated Prematurely": "bg-yellow-100 text-yellow-700",
  "Terminated Prematurely": "bg-yellow-100 text-yellow-700",
};

const COMPLETED_STATUSES = new Set(["Completed", "Terminated Prematurely"]);

// Statuses where interview already happened — show "Interview Completed"
const TERMINAL_STATUSES = new Set([
  "Completed",
  "Terminated – Cheating Detected",
  "Ended by Candidate",
  "Candidate Terminated Prematurely",
  "Disconnected – Network Issue",
]);

// Statuses that allow (re)scheduling
const SCHEDULE_ALLOWED_STATUSES = new Set([
  "New",
  "Added from Database",
  "Cancelled",
]);

function formatSchedule(date: string | null, tz: string | null): string | null {
  if (!date) return null;
  // Map common timezone names to IANA identifiers
  const tzMap: Record<string, string> = {
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Kolkata": "Asia/Kolkata",
    IST: "Asia/Kolkata",
  };
  const ianaZone = tz ? tzMap[tz] || tz : undefined;
  const formatted = new Date(date).toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ianaZone,
  });
  return `Scheduled: ${formatted}${tz ? ` (${tz})` : ""}`;
}

function ScoreCell({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-gray-400">N/A</span>;
  return <span>{value.toFixed(1)}</span>;
}

export default function CandidatesView({ jobId }: { jobId: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const canSeeFitPercent = user?.role === "super_admin" || user?.allow_fit_score === true;

  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  // "Candidates" tab = show all stages; other tabs = filter by stage
  const [activeTab, setActiveTab] = useState("Candidates");

  // "Show All" — only on Candidates tab. When checked: show all stages. When unchecked: show only Candidates stage.
  const [showAll, setShowAll] = useState(true);

  // "Show Completed Interviews" — available on ALL tabs.
  // When checked: additionally show completed interviews (they are hidden by default).
  // When unchecked: hide completed interviews.
  const [showCompleted, setShowCompleted] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pageIndex, setPageIndex] = useState(0);
  const [scheduleCandidate, setScheduleCandidate] = useState<Candidate | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);

  // Email history popup
  const [emailHistoryCandidate, setEmailHistoryCandidate] = useState<{ id: number; name: string } | null>(null);
  const [emailHistory, setEmailHistory] = useState<{ id: number; subject: string; triggered_by: string; trigger_event: string; sent_at: string | null; status: string }[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(false);

  const openEmailHistory = useCallback(async (candidateId: number, candidateName: string) => {
    setEmailHistoryCandidate({ id: candidateId, name: candidateName });
    setEmailHistoryLoading(true);
    try {
      const res = await api<{ candidate_name: string; emails: typeof emailHistory }>(`/candidates/${candidateId}/email-history`);
      setEmailHistory(res.emails);
    } catch {
      setEmailHistory([]);
    } finally {
      setEmailHistoryLoading(false);
    }
  }, []);

  // Candidate quota pre-check
  const checkCandidateQuota = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api<{ allowed: boolean; message?: string }>(`/candidates/can-add?job_id=${jobId}`);
      if (!res.allowed) {
        notifyError(res.message || "You have exceeded the candidate limit for this job. Please upgrade your plan.");
        return false;
      }
      return true;
    } catch {
      return true; // Allow on network error
    }
  }, [jobId]);
  const [recomputingIds, setRecomputingIds] = useState<Set<number>>(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [interviewUrl, setInterviewUrl] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [showJdModal, setShowJdModal] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    try {
      const data = await api<any>(`/jobs/${jobId}`);
      setJob(data);
      if (data.interview_token) {
        setInterviewUrl(`${window.location.origin}/interview/${data.interview_token}`);
      }
    } catch {}
  }, [jobId]);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      // Always fetch all candidates for this job; filtering is done client-side
      const params = new URLSearchParams({ job_id: String(jobId) });
      const data = await api<Candidate[]>(`/candidates/?${params}`);
      setCandidates(data);
    } catch {}
    finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { fetchJob(); }, [fetchJob]);
  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  // Auto-refresh candidates every 15s if any have smart scoring (waiting for AI score)
  const hasSmartScoring = candidates.some((c) => {
    if (!c.fit_score_details) return false;
    try {
      const d = JSON.parse(c.fit_score_details);
      return d.source === "smart_scoring";
    } catch { return false; }
  });

  // Also refresh while any candidate is scheduled / mid-interview so the row
  // flips to "Completed" without the recruiter having to reload the page.
  const hasInFlightInterview = candidates.some(
    (c) => !TERMINAL_STATUSES.has(c.interview_status) && c.interview_status !== "New",
  );

  useEffect(() => {
    if ((!hasSmartScoring && !hasInFlightInterview) || !jobId) return;

    const interval = setInterval(() => {
      fetchCandidates();
    }, 15000);

    return () => clearInterval(interval);
  }, [hasSmartScoring, hasInFlightInterview, jobId, fetchCandidates]);

  // ── Tab change handler ────────────────────────────────────────────────────
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setShowAll(true);       // reset Show All when switching tabs
    setShowCompleted(false); // reset completed filter when switching tabs
    setPageIndex(0);
  }, []);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      // ── Stage filter ──────────────────────────────────────────────────────
      if (activeTab === "Candidates") {
        // "Show All" ticked (default) → every stage, every interview status
        // "Show All" unticked → only "Candidates" stage
        if (!showAll && c.candidate_stage !== "Candidates") return false;
      } else {
        // Stage-specific tabs always filter by that stage
        if (c.candidate_stage !== activeTab) return false;
      }

      // ── "Show Completed Interviews" filter — applies to ALL tabs ──────────
      // When ticked: show ONLY candidates who completed their interview
      // When unticked: show ALL candidates regardless of interview status
      if (showCompleted && !COMPLETED_STATUSES.has(c.interview_status)) return false;

      // ── Search ────────────────────────────────────────────────────────────
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q))
          return false;
      }

      return true;
    });
  }, [candidates, activeTab, showAll, showCompleted, search]);

  // Reset to page 0 whenever the filtered set changes
  useEffect(() => { setPageIndex(0); }, [filteredCandidates.length, activeTab]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalRows = filteredCandidates.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const pagedCandidates = filteredCandidates.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );
  const firstRow = totalRows === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const lastRow = Math.min((safePage + 1) * PAGE_SIZE, totalRows);

  // ── Tab counts — count by candidate_stage across ALL candidates ───────────
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES.forEach((s) => {
      if (s === "Candidates") {
        counts[s] = candidates.length; // total
      } else {
        counts[s] = candidates.filter((c) => c.candidate_stage === s).length;
      }
    });
    return counts;
  }, [candidates]);

  // ── Whether the current view is the "all" (Candidates) tab ───────────────
  const isCandidatesTab = activeTab === "Candidates";

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(pagedCandidates.map((c) => c.id)) : new Set());
    },
    [pagedCandidates],
  );

  const allPageSelected =
    pagedCandidates.length > 0 &&
    pagedCandidates.every((c) => selectedIds.has(c.id));

  // ── Action handlers ───────────────────────────────────────────────────────
  const handlePromote = useCallback(
    async (candidateId: number, stage: string) => {
      try {
        const updated = await apiPost<Candidate>(`/candidates/${candidateId}/promote`, { stage });
        setCandidates((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
      } catch {}
    },
    [],
  );

  const handleScheduled = useCallback((updated: Candidate) => {
    setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const handleCancelInterview = useCallback(
    async (candidateId: number) => {
      try {
        const updated = await apiPost<Candidate>(`/candidates/${candidateId}/cancel-interview`, { reason: "Cancelled by admin" });
        setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setCancelTarget(null);
        notifySuccess("Interview cancelled. Candidate has been notified.");
      } catch (err: any) {
        notifyError(err instanceof ApiError ? err.detail : "Failed to cancel interview");
      }
    },
    [],
  );

  const handleRemoveCandidate = useCallback(
    async (candidateId: number) => {
      try {
        await api(`/candidates/${candidateId}`, { method: "DELETE" });
        setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
        setRemoveTarget(null);
        notifySuccess("Candidate removed from job");
      } catch (err: any) {
        notifyError(err instanceof ApiError ? err.detail : "Failed to remove candidate");
      }
    },
    [],
  );

  const handleCandidateCreated = useCallback((c: Candidate) => {
    setCandidates((prev) => [c, ...prev]);
  }, []);

  const handleResumesUploaded = useCallback((newCandidates: Candidate[]) => {
    setCandidates((prev) => {
      const merged = [...prev];
      for (const nc of newCandidates) {
        const idx = merged.findIndex((c) => c.id === nc.id);
        if (idx >= 0) {
          merged[idx] = nc; // update existing
        } else {
          merged.unshift(nc); // add new at top
        }
      }
      return merged;
    });
  }, []);

  const handleRecomputeFit = useCallback(
    async (candidateId: number) => {
      setRecomputingIds((prev) => new Set([...prev, candidateId]));
      try {
        const updated = await apiPost<Candidate>(`/candidates/${candidateId}/compute-fit-score`, {});
        setCandidates((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
      } catch {}
      finally {
        setRecomputingIds((prev) => {
          const next = new Set(prev);
          next.delete(candidateId);
          return next;
        });
      }
    },
    [],
  );

  const handleRefreshAllFitScores = useCallback(async () => {
    if (!jobId) return;
    const toRefresh = candidates.filter((c) => c.job_id !== null);
    if (toRefresh.length === 0) return;
    setRefreshingAll(true);
    const allIds = new Set(toRefresh.map((c) => c.id));
    setRecomputingIds((prev) => new Set([...prev, ...allIds]));
    try {
      // Batch AI scoring — allow up to 5 min for large candidate lists
      await apiPost<any>(`/candidates/batch-recompute-scores?job_id=${jobId}`, {}, {
        timeout: 300_000,
      });
      // Reload all candidates to get updated scores
      const updated = await api<Candidate[]>(`/candidates/?job_id=${jobId}`);
      setCandidates(updated);
      setRecomputingIds(new Set());
      notifySuccess("All fit scores updated with AI analysis");
    } catch {
      notifyError("Score refresh timed out. Refresh the page to see updated scores.");
    } finally {
      setRefreshingAll(false);
      setRecomputingIds(new Set());
    }
  }, [candidates]);

  const copyLink = useCallback(() => {
    if (!interviewUrl) return;
    navigator.clipboard.writeText(interviewUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }, [interviewUrl]);

  // ── Export candidates to Excel (CSV) ──────────────────────────────────────
  const handleExportCandidates = useCallback(() => {
    if (candidates.length === 0) return;

    const staticBase = API_BASE.replace(/\/api$/, "");
    const headers = [
      "Name", "Email", "Phone", "Role", "Location", "Stage",
      "Interview Status", "Interview Date", "Score", "Trust Score",
      "AI Cheating Score", "Fit Score", "Resume Link", "Recording Link",
    ];

    const rows = candidates.map((c) => [
      c.name,
      c.email,
      c.phone || "",
      c.role || "",
      c.location || "",
      c.candidate_stage || "",
      c.interview_status || "",
      c.interview_date || "",
      c.score ?? "",
      c.trust_score ?? "",
      c.ai_cheating_score ?? "",
      c.resume_fit_score || "",
      c.resume_path ? `${staticBase}/${c.resume_path}` : "",
      c.recording_link ? `${staticBase}/${c.recording_link}` : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => {
          const str = String(cell);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job?.title || "Candidates"} - Candidates.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notifySuccess("Candidates exported successfully!");
  }, [candidates, job]);

  // ── Promote stage options — exclude current stage ─────────────────────────
  const getPromoteOptions = (currentStage: string) =>
    ["AI Round", "Panel Round", "Offer-Made", "Rejected"].filter(
      (s) => s !== currentStage,
    );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 min-w-0">

      {/* ── Job Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-800">
            {job?.title || "Loading…"}
          </h1>

          {interviewUrl && (
            <div className="flex items-center gap-2 mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 max-w-full sm:max-w-xl overflow-hidden">
              <Link className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-sm text-blue-700 truncate flex-1 font-mono">
                {interviewUrl}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={copyLink}
                title={urlCopied ? "Copied!" : "Copy link"}
                className="shrink-0 h-7 w-7 hover:bg-blue-100"
              >
                {urlCopied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4 text-blue-500" />
                )}
              </Button>
              <a
                href={interviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open interview link"
                className="shrink-0 p-1 rounded hover:bg-blue-100 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-blue-500" />
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button size="sm" onClick={async () => { if (await checkCandidateQuota()) setShowAddModal(true); }} className="gap-1">
            <Plus className="w-4 h-4" /> Add Candidate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500"
            onClick={async () => { if (await checkCandidateQuota()) setShowUploadModal(true); }}
          >
            <Upload className="w-4 h-4" /> Upload Resumes
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
            onClick={async () => { if (await checkCandidateQuota()) setShowMatchModal(true); }}
          >
            <Database className="w-4 h-4" /> Match From Database
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowJdModal(true)}>
                <Eye className="w-4 h-4 mr-2" /> View Job Description
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  window.open(`${API_BASE}/jobs/${jobId}/download-jd`, "_blank");
                }}
              >
                <Download className="w-4 h-4 mr-2" /> Download JD (Word)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCandidates}>
                <FileText className="w-4 h-4 mr-2" /> Export Candidates (Excel)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Stage Tabs ────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 overflow-x-auto -mx-1 px-1">
        <div className="flex items-center gap-0 min-w-max">
          {STAGES.map((stage) => (
            <Button
              key={stage}
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange(stage)}
              className={`rounded-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === stage
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              {stage === "Candidates" ? "CANDIDATES" : stage.toUpperCase()}
              <span className="ml-1 text-xs text-gray-400">
                ({tabCounts[stage] ?? 0})
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* ── Filters Row ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          {/* "Show All" — only on Candidates tab */}
          {isCandidatesTab && (
            <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
              <Checkbox
                checked={showAll}
                onCheckedChange={(v) => { setShowAll(v as boolean); setPageIndex(0); }}
              />
              Show All
            </label>
          )}
          {/* "Show Completed Interviews" — on ALL tabs */}
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <Checkbox
              checked={showCompleted}
              onCheckedChange={(v) => { setShowCompleted(v as boolean); setPageIndex(0); }}
            />
            Show Completed Interviews
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1">
            <Filter className="w-4 h-4" /> FILTERS
          </Button>
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full sm:w-44"
          />
        </div>
      </div>

      {/* ── Auto-match suggestion banner ────────────────────────────────── */}
      {!loading && candidates.length === 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Database className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <p className="text-sm text-blue-800 flex-1">
            No candidates yet. You can quickly find matching candidates from the resume database.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-100 gap-1 flex-shrink-0"
            onClick={() => setShowMatchModal(true)}
          >
            <Database className="w-4 h-4" /> Match From Database
          </Button>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto w-full glass-scrollbar">
          <Table className="min-w-max">

            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={(v) => toggleSelectAll(!!v)}
                    aria-label="Select all on page"
                  />
                </TableHead>

                {/* Extra columns shown only on Candidates (all) tab */}
                {isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">AI-CHEATING SCORE</TableHead>}
                {isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">PROMOTE</TableHead>}
                {isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">INTERVIEW DATE</TableHead>}

                <TableHead className="px-3 text-xs font-medium text-gray-600">NAME</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">SCORE</TableHead>

                {isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">TRUST SCORE</TableHead>}

                <TableHead className="px-3 text-xs font-medium text-gray-600">
                  <div className="flex items-center gap-1.5">
                    CANDIDATE FIT SCORE
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRefreshAllFitScores}
                      disabled={refreshingAll}
                      title="Refresh all fit scores"
                      className="h-5 w-5 p-0.5 hover:bg-gray-200 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingAll ? "animate-spin text-brand-500" : "text-gray-500 hover:text-gray-700"}`} />
                    </Button>
                  </div>
                </TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">INTERVIEW STATUS</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">VIEW REPORT</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">RESUME</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">INTERVIEW SCHEDULE</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">RECORDING</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">VIDEO DURATION</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">ADDED BY</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600">MAIL CONTACT HISTORY</TableHead>
                <TableHead className="px-3 text-xs font-medium text-gray-600 w-16"></TableHead>

                {/* Detail score columns shown only on stage-specific tabs */}
                {!isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">PRONUNCIATION</TableHead>}
                {!isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">ENTHUSIASM</TableHead>}
                {!isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">GRAMMAR</TableHead>}
                {!isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">CONCISENESS</TableHead>}
                {!isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">CLARITY</TableHead>}
                {!isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">CONFIDENCE</TableHead>}
                {!isCandidatesTab && <TableHead className="px-3 text-xs font-medium text-gray-600">INITIAL AUDIO</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j} className="px-3 py-4">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pagedCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={20} className="py-16 text-center text-gray-500">
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    {showCompleted
                      ? "No completed interviews found."
                      : "No candidates found. Add candidates or upload resumes."}
                  </TableCell>
                </TableRow>
              ) : (
                pagedCandidates.map((c) => {
                  const isScheduled = c.interview_status === "Scheduled";
                  // Only show schedule label when status is actually "Scheduled"
                  const scheduleLabel = isScheduled
                    ? formatSchedule(c.interview_date, c.interview_timezone)
                    : null;
                  // Promote options exclude the candidate's current stage
                  const promoteOptions = getPromoteOptions(c.candidate_stage);

                  return (
                    <TableRow key={c.id}>
                      {/* Checkbox */}
                      <TableCell className="px-3">
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={() => toggleSelect(c.id)}
                          aria-label={`Select ${c.name}`}
                        />
                      </TableCell>

                      {/* AI Cheating Score — Candidates tab only */}
                      {isCandidatesTab && (
                        <TableCell className="px-3">
                          {c.ai_cheating_score !== null ? (
                            <span className={c.ai_cheating_score > 0 ? "text-orange-500" : "text-green-600"}>
                              {c.ai_cheating_score > 0 ? "⚠ " : "✓ "}
                              {Math.round((100 - c.ai_cheating_score) / 10)}/10
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Promote — Candidates tab only */}
                      {isCandidatesTab && (
                        <TableCell className="px-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1 h-7 whitespace-nowrap">
                                Promote <ChevronDown className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem disabled className="text-xs text-gray-400">
                                -- Move To --
                              </DropdownMenuItem>
                              {promoteOptions.map((stage) => (
                                <DropdownMenuItem
                                  key={stage}
                                  onClick={() => handlePromote(c.id, stage)}
                                >
                                  {stage}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}

                      {/* Interview Date — Candidates tab only */}
                      {isCandidatesTab && (
                        <TableCell className="px-3 text-gray-600 whitespace-nowrap">
                          {c.interview_date ? (
                            new Date(c.interview_date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Name */}
                      <TableCell className="px-3">
                        <div className="min-w-[160px]">
                          <p className="font-medium text-gray-800">{c.name}</p>
                          {c.phone && (
                            <p className="text-xs text-gray-500">{c.phone}</p>
                          )}
                          <a
                            href={`mailto:${c.email}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {c.email}
                          </a>
                        </div>
                      </TableCell>

                      {/* Score */}
                      <TableCell className="px-3 text-gray-600">
                        <ScoreCell value={c.score} />
                      </TableCell>

                      {/* Trust Score — Candidates tab only */}
                      {isCandidatesTab && (
                        <TableCell className="px-3 text-gray-600">
                          <ScoreCell value={c.trust_score} />
                        </TableCell>
                      )}

                      {/* Candidate Fit Score */}
                      <TableCell className="px-3">
                        <FitScoreBadge
                          fitLevel={c.resume_fit_score}
                          reasoning={c.fit_score_reasoning}
                          details={c.fit_score_details}
                          onRecompute={
                            c.job_id !== null
                              ? () => handleRecomputeFit(c.id)
                              : undefined
                          }
                          recomputing={recomputingIds.has(c.id)}
                          showPercentage={canSeeFitPercent}
                        />
                      </TableCell>

                      {/* Interview Status */}
                      <TableCell className="px-3">
                        {scheduleLabel ? (
                          <div className="flex items-center gap-1 min-w-[200px]">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS["Scheduled"]}`}
                            >
                              {scheduleLabel}
                            </span>
                            {isScheduled && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-gray-400 hover:text-red-500"
                                title="Cancel scheduled interview"
                                onClick={() => setCancelTarget(c.id)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                              STATUS_COLORS[c.interview_status] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {c.interview_status || "New"}
                          </span>
                        )}
                      </TableCell>

                      {/* View Report */}
                      <TableCell className="px-3">
                        <button
                          onClick={() => router.push(`/evaluation/${c.id}`)}
                          title="View Report"
                          className="w-9 h-9 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
                        >
                          <ChevronRight className="w-5 h-5 text-blue-600" />
                        </button>
                      </TableCell>

                      {/* Resume */}
                      <TableCell className="px-3">
                        {c.resume_path ? (
                          <a
                            href={
                              c.resume_path.startsWith("http")
                                ? c.resume_path
                                : `${API_BASE.replace(/\/api$/, "")}${c.resume_path.startsWith("/") ? "" : "/"}${c.resume_path}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            title="View Resume"
                          >
                            <Button variant="ghost" size="icon">
                              <FileText className="w-5 h-5 text-red-500" />
                            </Button>
                          </a>
                        ) : (
                          <Button variant="ghost" size="icon" disabled title="No Resume">
                            <FileText className="w-5 h-5 text-gray-300" />
                          </Button>
                        )}
                      </TableCell>

                      {/* Interview Schedule */}
                      <TableCell className="px-3">
                        <div className="flex items-center gap-1 min-w-[200px]">
                          {TERMINAL_STATUSES.has(c.interview_status) ? (
                            <span className="text-gray-400 text-xs">Interview Completed</span>
                          ) : isScheduled ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-yellow-500 hover:bg-yellow-600 text-white gap-1 whitespace-nowrap"
                                onClick={() => setScheduleCandidate(c)}
                              >
                                <CalendarDays className="w-3 h-3" /> Reschedule
                              </Button>
                              {interviewUrl && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white gap-1 whitespace-nowrap"
                                  onClick={() => {
                                    const candidateLink = `${interviewUrl}?candidate=${encodeURIComponent(c.email)}`;
                                    navigator.clipboard.writeText(candidateLink);
                                    notifySuccess("Interview link copied (no registration required)!");
                                  }}
                                >
                                  <Link className="w-3 h-3" /> Share Link
                                </Button>
                              )}
                            </>
                          ) : SCHEDULE_ALLOWED_STATUSES.has(c.interview_status) || !c.interview_status ? (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1 whitespace-nowrap"
                              onClick={() => setScheduleCandidate(c)}
                            >
                              <CalendarDays className="w-3 h-3" /> Schedule
                            </Button>
                          ) : (
                            <span className="text-gray-400 text-xs">N/A</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Recording */}
                      <TableCell className="px-3">
                        {c.recording_link ? (
                          <a
                            href={
                              c.recording_link.startsWith("/")
                                ? `${API_BASE.replace(/\/api$/, "")}${c.recording_link}`
                                : c.recording_link
                            }
                            target="_blank"
                            rel="noreferrer"
                            title="Play Recording"
                          >
                            <div className="w-9 h-9 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors">
                              <Play className="w-4 h-4 text-blue-600 fill-current" />
                            </div>
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs whitespace-nowrap">
                            {c.interview_status === "Scheduled"
                              ? "Meeting has not started"
                              : "Not started"}
                          </span>
                        )}
                      </TableCell>

                      {/* Video Duration */}
                      <TableCell className="px-3 text-gray-600 text-xs">
                        {c.video_duration ?? <span className="text-gray-400">N/A</span>}
                      </TableCell>

                      {/* Added By */}
                      <TableCell className="px-3 text-gray-600 text-xs">
                        {c.added_by || <span className="text-gray-400">N/A</span>}
                      </TableCell>

                      {/* Mail Contact History */}
                      <TableCell className="px-3">
                        <button
                          onClick={() => openEmailHistory(c.id, c.name)}
                          title="View Mail Contact History"
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                            c.mail_contact_history
                              ? "bg-blue-100 hover:bg-blue-200 text-blue-600"
                              : "bg-gray-100 hover:bg-gray-200 text-gray-400"
                          }`}
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                      </TableCell>

                      {/* Remove from job */}
                      <TableCell className="px-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRemoveTarget(c.id)}
                          className="h-7 w-7 text-gray-400 hover:text-red-600"
                          title="Remove candidate from job"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>

                      {/* Detail scores — stage-specific tabs only */}
                      {!isCandidatesTab && (
                        <>
                          <TableCell className="px-3"><ScoreCell value={c.pronunciation_score} /></TableCell>
                          <TableCell className="px-3"><ScoreCell value={c.enthusiasm_score} /></TableCell>
                          <TableCell className="px-3"><ScoreCell value={c.grammar_score} /></TableCell>
                          <TableCell className="px-3"><ScoreCell value={c.conciseness_score} /></TableCell>
                          <TableCell className="px-3"><ScoreCell value={c.clarity_score} /></TableCell>
                          <TableCell className="px-3"><ScoreCell value={c.confidence_score} /></TableCell>
                          <TableCell className="px-3 text-gray-400 text-xs">No Audio</TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Pagination footer ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-500">
            {totalRows === 0
              ? "No results"
              : `Showing ${firstRow}–${lastRow} of ${totalRows} candidate${totalRows !== 1 ? "s" : ""}`}
          </p>

          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={safePage > 0 ? () => setPageIndex(safePage - 1) : undefined}
                  aria-disabled={safePage === 0}
                  className={safePage === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>

              <PaginationItem>
                <span className="flex h-9 min-w-[72px] items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium tabular-nums">
                  {safePage + 1} / {totalPages}
                </span>
              </PaginationItem>

              <PaginationItem>
                <PaginationNext
                  onClick={
                    safePage < totalPages - 1
                      ? () => setPageIndex(safePage + 1)
                      : undefined
                  }
                  aria-disabled={safePage >= totalPages - 1}
                  className={
                    safePage >= totalPages - 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <AddCandidateModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        jobId={jobId}
        onCreated={handleCandidateCreated}
      />
      <UploadResumesModal
        open={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          fetchCandidates(); // Full refresh from server after modal closes
        }}
        jobId={jobId}
        onUploaded={handleResumesUploaded}
      />
      <MatchCandidatesModal
        open={showMatchModal}
        onClose={() => setShowMatchModal(false)}
        jobId={jobId}
        onAdded={fetchCandidates}
      />
      {scheduleCandidate && (
        <ScheduleInterviewModal
          open={!!scheduleCandidate}
          onClose={() => setScheduleCandidate(null)}
          candidateId={scheduleCandidate.id}
          candidateName={scheduleCandidate.name}
          jobTitle={job?.title || ""}
          contactInfo={
            job?.manager_name
              ? `You may also reach your HR/Recruiter - ${job.manager_name} at ${
                  job.manager_phone || ""
                } or via email ${job.manager_email || ""}`
              : undefined
          }
          interviewUrl={interviewUrl || undefined}
          onScheduled={handleScheduled}
        />
      )}

      {/* ── JD Viewer Modal ──────────────────────────────────────────────── */}
      <Dialog open={showJdModal} onOpenChange={setShowJdModal}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              Job Description
            </DialogTitle>
          </DialogHeader>
          {job ? (
            <div className="overflow-y-auto flex-1 pr-1 space-y-6">
              {/* Title & Meta */}
              <div>
                <h2 className="text-xl font-bold text-gray-900">{job.title}</h2>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                  {job.department && <span>{job.department}</span>}
                  {job.location && <span>• {job.location}</span>}
                  {job.job_type && <span>• {job.job_type}</span>}
                  {(job.experience_min != null || job.experience_max != null) && (
                    <span>• {job.experience_min ?? 0}–{job.experience_max ?? "?"} yrs experience</span>
                  )}
                  {job.openings != null && <span>• {job.openings} opening(s)</span>}
                </div>
              </div>

              {/* Summary */}
              {job.summary && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Job Summary</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{job.summary}</p>
                </div>
              )}

              {/* Skills */}
              {job.skills && job.skills.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Required Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {job.skills.map((s) => (
                      <span
                        key={s.id}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          s.skill_criteria === "All Mandatory"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : s.skill_criteria === "At Least One"
                            ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                            : "bg-gray-50 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {s.skill}
                        {s.skill_criteria === "All Mandatory" && (
                          <span className="ml-1 text-[10px] opacity-60">mandatory</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Responsibilities */}
              {job.responsibilities && job.responsibilities.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Responsibilities</h3>
                  <ul className="space-y-1.5">
                    {job.responsibilities.map((r) => (
                      <li key={r.id} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        {r.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Manager Info */}
              {(job.manager_name || job.manager_email || job.manager_phone) && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Hiring Manager</h3>
                  <div className="text-sm text-gray-600 space-y-0.5">
                    {job.manager_name && <p>{job.manager_name}</p>}
                    {job.manager_email && <p className="text-blue-600">{job.manager_email}</p>}
                    {job.manager_phone && <p>{job.manager_phone}</p>}
                  </div>
                </div>
              )}

              {/* Download JD */}
              {job.upload_jd && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      window.open(`${API_BASE}/jobs/${jobId}/download-jd`, "_blank");
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Download Original JD File
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-gray-400">
              Loading...
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Interview Confirmation */}
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        title="Cancel Interview"
        description="Are you sure you want to cancel this interview? The candidate will be notified."
        confirmLabel="Cancel Interview"
        variant="warning"
        onConfirm={() => { if (cancelTarget !== null) handleCancelInterview(cancelTarget); }}
      />

      {/* Remove Candidate Confirmation */}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title="Remove Candidate"
        description="Are you sure you want to remove this candidate from this job? This action cannot be undone."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => { if (removeTarget !== null) handleRemoveCandidate(removeTarget); }}
      />
      {/* ── Email Contact History Dialog ── */}
      <Dialog open={!!emailHistoryCandidate} onOpenChange={() => setEmailHistoryCandidate(null)}>
        <DialogContent className="max-w-md max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Contact History for {emailHistoryCandidate?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {emailHistoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : emailHistory.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No mail history available.</p>
            ) : (
              emailHistory.map((email) => (
                <div key={email.id} className="border border-gray-200 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium text-gray-800">Subject: {email.subject}</p>
                  <p className="text-xs text-gray-500">Triggered by: <span className="font-medium">{email.triggered_by}</span></p>
                  <p className="text-xs text-gray-500">Triggered via: <span className="font-medium">{email.trigger_event}</span></p>
                  <p className="text-xs text-green-600">
                    Sent At : {email.sent_at ? new Date(email.sent_at.endsWith("Z") ? email.sent_at : email.sent_at + "Z").toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) : "N/A"}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}