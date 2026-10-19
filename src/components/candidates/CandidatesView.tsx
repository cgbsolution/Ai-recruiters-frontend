"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { hasRealEmail } from "@/lib/candidateEmail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TalentMatchCards, TalentMatchRows, useTalentMatches } from "./TalentMatchesPanel";
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
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  Link,
  MoreVertical,
  Mail,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Users,
  X,
  Briefcase,
  Bot,
  UserSquare2,
  Trophy,
  UserX,
  List as ListIcon,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import FitScoreBadge, { FitScoreTooltipContent } from "./FitScoreBadge";
import AddCandidateModal from "./AddCandidateModal";
import UploadResumesModal from "./UploadResumesModal";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import EditCandidateModal from "./EditCandidateModal";
import RetakeInterviewModal from "./RetakeInterviewModal";
import MatchCandidatesModal from "./MatchCandidatesModal";
import ObserverLinkButton from "./ObserverLinkButton";
import { api, apiPost, apiUpload, apiDownload, saveBlob, mediaUrl, ApiError } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ResumeFitScore = string | null;

interface Candidate {
  id: number;
  resume_metadata_id?: number | null;
  /** Opaque id used in page URLs (e.g. /evaluation/{ref}) instead of `id`. */
  ref: string;
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
  /** Signed, expiring API-relative resume URL (null when there is no file). */
  resume_url: string | null;
  score: number | null;
  trust_score: number | null;
  grammar_score: number | null;
  confidence_score: number | null;
  clarity_score: number | null;
  pronunciation_score: number | null;
  enthusiasm_score: number | null;
  conciseness_score: number | null;
  ai_cheating_score: number | null;
  /** Signed, expiring API-relative recording URL (null when there is none). */
  recording_url: string | null;
  /** Personal invite URL once scheduled (older rows: the job link or null). */
  interview_link: string | null;
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
  // Backend stores interview_date as NAIVE UTC (TIMESTAMP WITHOUT TIME ZONE)
  // and FastAPI serializes it without a trailing "Z". Browsers interpret an
  // ISO string without an offset as *local* time, which shifts the displayed
  // moment by the local↔UTC offset. Force UTC interpretation here so the
  // dashboard matches the email + the time the recruiter actually picked.
  const hasTzSuffix = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(date);
  const utcIso = hasTzSuffix ? date : date + "Z";
  const formatted = new Date(utcIso).toLocaleString("en-US", {
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

/** Link a recruiter copies for a scheduled candidate: the personal invite link
 *  once the backend has minted one, otherwise the legacy `?candidate=<email>`
 *  link (candidates scheduled before personal invites existed). */
function candidateInterviewLink(c: Candidate, interviewUrl: string | null): string | null {
  if (c.interview_link && c.interview_link.includes("invite=")) return c.interview_link;
  return interviewUrl ? `${interviewUrl}?candidate=${encodeURIComponent(c.email)}` : null;
}

/** `jobId` is the job's opaque ref (validated by the page); it is passed as-is
 *  wherever the API expects a job id. */
export default function CandidatesView({ jobId }: { jobId: string }) {
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
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pageIndex, setPageIndex] = useState(0);
  const [scheduleCandidate, setScheduleCandidate] = useState<Candidate | null>(null);
  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null);
  const [retakeCandidate, setRetakeCandidate] = useState<Candidate | null>(null);
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
  const [uploadingResumeIds, setUploadingResumeIds] = useState<Set<number>>(new Set());
  const resumeUploadInputRef = useRef<HTMLInputElement | null>(null);
  const resumeUploadCandidateRef = useRef<number | null>(null);
  const [interviewUrl, setInterviewUrl] = useState<string | null>(null);
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

  const fetchCandidates = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      // Always fetch all candidates for this job; filtering is done client-side
      const params = new URLSearchParams({ job_id: jobId });
      const data = await api<Candidate[]>(`/candidates/?${params}`);
      // Background polls write a fresh array every 15s even when nothing
      // meaningful changed, which forces a full re-render of the table and
      // any downstream memoization. Short-circuit when the payload is
      // byte-equal to what we already have.
      setCandidates((prev) => {
        if (silent && prev.length === data.length) {
          try {
            if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          } catch {}
        }
        return data;
      });
    } catch {}
    finally { if (!silent) setLoading(false); }
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

    // Poll silently — never toggle the page-wide `loading` spinner for a
    // background refresh. The old behaviour caused the table to flash into
    // a loading state every 15s, which read as "refreshing continuously".
    const interval = setInterval(() => {
      fetchCandidates({ silent: true });
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

  // The Talent Agent's ranked matches who aren't candidates on this job yet.
  // Listed on the Candidates tab only (they have no stage), read-only.
  const candidateProfileIds = useMemo(
    () => new Set(candidates.map((c) => c.resume_metadata_id).filter((id): id is number => id != null)),
    [candidates],
  );
  const agentMatches = useTalentMatches(jobId, candidateProfileIds);
  const agentShown = useMemo(() => {
    if (!isCandidatesTab || showCompleted) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return agentMatches;
    return agentMatches.filter((m) => (m.profile.name ?? "").toLowerCase().includes(needle));
  }, [agentMatches, isCandidatesTab, showCompleted, search]);

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

  const handleCandidateUpdated = useCallback((updated: Candidate) => {
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

  const triggerResumeUpload = useCallback((candidateId: number) => {
    resumeUploadCandidateRef.current = candidateId;
    if (resumeUploadInputRef.current) {
      resumeUploadInputRef.current.value = "";
      resumeUploadInputRef.current.click();
    }
  }, []);

  const handleResumeUploadFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      const candidateId = resumeUploadCandidateRef.current;
      event.target.value = "";
      resumeUploadCandidateRef.current = null;
      if (!file || candidateId === null) return;

      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowedTypes.includes(file.type)) {
        notifyError("Unsupported file type. Only PDF, DOC and DOCX are accepted.");
        return;
      }

      setUploadingResumeIds((prev) => new Set([...prev, candidateId]));
      try {
        const formData = new FormData();
        formData.append("file", file);
        const updated = await apiUpload<Candidate>(
          `/candidates/${candidateId}/replace-resume`,
          formData,
          { timeout: 300_000 },
        );
        setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        notifySuccess("Resume uploaded successfully.");
      } catch (err: any) {
        notifyError(
          err instanceof ApiError
            ? err.detail
            : err?.message || "Failed to upload resume",
        );
      } finally {
        setUploadingResumeIds((prev) => {
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


  // ── Export candidates to Excel (CSV) ──────────────────────────────────────
  const handleExportCandidates = useCallback(() => {
    if (candidates.length === 0) return;

    // Resume / recording columns link to the admin evaluation page: media URLs
    // are signed and expire, while the page re-checks access and signs fresh ones.
    const reportLink = (c: Candidate) => `${window.location.origin}/evaluation/${c.ref}`;
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
      c.resume_url ? reportLink(c) : "",
      c.recording_url ? reportLink(c) : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => {
          let str = String(cell);
          // Formula injection: an applicant can name themselves
          // `=HYPERLINK(...)` through the public apply form, and Excel runs
          // any cell starting with = + - @ as a formula. Negative numbers
          // (scores) are left alone.
          if (/^[=+\-@\t\r]/.test(str) && !/^-\d+(\.\d+)?$/.test(str)) str = `'${str}`;
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

  // ── Download JD (Word) — needs the Bearer token, so fetch it as a Blob
  //    instead of window.open (which can't send auth headers). ──────────────
  const handleDownloadJd = useCallback(async () => {
    try {
      const blob = await apiDownload(`/jobs/${jobId}/download-jd`);
      const safeTitle = (job?.title || "").replace(/[\\/:*?"<>|]+/g, "").trim() || "JD";
      saveBlob(blob, `${safeTitle} - Job Description.docx`);
    } catch (err: any) {
      notifyError(err instanceof ApiError ? err.detail : "Failed to download the job description");
    }
  }, [jobId, job]);

  // ── Stage move options — any stage except the current one. "Candidates" is
  //    included so a candidate can be moved BACK to the initial stage (e.g. a
  //    retaken candidate, or correcting a mistaken promotion). ────────────────
  const getPromoteOptions = (currentStage: string) =>
    ["Candidates", "AI Round", "Panel Round", "Offer-Made", "Rejected"].filter(
      (s) => s !== currentStage,
    );

  // ── Scheduled (in-flight) count for header meta ──────────────────────────
  const scheduledCount = useMemo(
    () => candidates.filter((c) => c.interview_status === "Scheduled").length,
    [candidates],
  );

  // ── Stat cards config ────────────────────────────────────────────────────
  const STAT_CARDS: {
    stage: string;
    label: string;
    icon: React.ReactNode;
    topBar: string;
    iconWrap: string;
  }[] = [
    {
      stage: "Candidates",
      label: "Total Candidates",
      icon: <Users className="h-4 w-4" />,
      topBar: "bg-gradient-to-r from-indigo-400 to-indigo-500",
      iconWrap: "bg-indigo-50 text-indigo-500 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20",
    },
    {
      stage: "AI Round",
      label: "AI Round",
      icon: <Bot className="h-4 w-4" />,
      topBar: "bg-gradient-to-r from-sky-400 to-cyan-500",
      iconWrap: "bg-sky-50 text-sky-500 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20",
    },
    {
      stage: "Panel Round",
      label: "Panel Round",
      icon: <UserSquare2 className="h-4 w-4" />,
      topBar: "bg-gradient-to-r from-amber-400 to-orange-500",
      iconWrap: "bg-amber-50 text-amber-500 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20",
    },
    {
      stage: "Offer-Made",
      label: "Offer Made",
      icon: <Trophy className="h-4 w-4" />,
      topBar: "bg-gradient-to-r from-emerald-400 to-green-500",
      iconWrap: "bg-emerald-50 text-emerald-500 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20",
    },
    {
      stage: "Rejected",
      label: "Rejected",
      icon: <UserX className="h-4 w-4" />,
      topBar: "bg-gradient-to-r from-rose-400 to-red-500",
      iconWrap: "bg-rose-50 text-rose-500 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20",
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* Hidden single-resume upload input (per-candidate replace-resume) */}
      <input
        ref={resumeUploadInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleResumeUploadFile}
      />

      {/* ===== Modern Job Header (gradient hero) ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-5 sm:p-6 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-900/80 dark:text-indigo-300 dark:ring-indigo-500/20">
              <Briefcase className="h-3 w-3" />
              Job Opening
            </span>

            <h1 className="mt-2 truncate text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">
              {job?.title || "Loading…"}
            </h1>

            {/* Meta row */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
              {job?.location && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  {job.location}
                </span>
              )}
              {job?.job_type && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                  {job.job_type}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"}
              </span>
              {scheduledCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {scheduledCount} scheduled
                </span>
              )}
            </div>

          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={async () => { if (await checkCandidateQuota()) setShowAddModal(true); }}
              className="gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-sm hover:from-indigo-600 hover:to-indigo-700"
            >
              <Plus className="h-4 w-4" /> Add Candidate
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-sm hover:from-amber-500 hover:to-orange-600"
              onClick={async () => { if (await checkCandidateQuota()) setShowUploadModal(true); }}
            >
              <Upload className="h-4 w-4" /> Upload Resumes
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm hover:from-fuchsia-600 hover:to-purple-700"
              onClick={async () => { if (await checkCandidateQuota()) setShowMatchModal(true); }}
            >
              <Database className="h-4 w-4" /> Match From Database
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl bg-white/80 backdrop-blur hover:bg-white dark:bg-gray-900/60 dark:hover:bg-gray-900">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowJdModal(true)}>
                  <Eye className="mr-2 h-4 w-4" /> View Job Description
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadJd}>
                  <Download className="mr-2 h-4 w-4" /> Download JD (Word)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCandidates}>
                  <FileText className="mr-2 h-4 w-4" /> Export Candidates (Excel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ===== Stage Stat Cards ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STAT_CARDS.map((c) => {
          const isActive = activeTab === c.stage;
          return (
            <button
              key={c.stage}
              type="button"
              onClick={() => handleTabChange(c.stage)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900/40",
                isActive
                  ? "border-indigo-300 shadow-sm ring-1 ring-indigo-200 dark:border-indigo-500/40 dark:ring-indigo-500/20"
                  : "border-gray-200 dark:border-white/10"
              )}
            >
              <div className={cn("absolute inset-x-0 top-0 h-1", c.topBar)} />
              <div className="flex items-start justify-between">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1", c.iconWrap)}>
                  {c.icon}
                </span>
                {isActive && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-4 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                {tabCounts[c.stage] ?? 0}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
            </button>
          );
        })}
      </div>

      {/* ===== Pill Tabs ===== */}
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
        {STAGES.map((stage) => {
          const isActive = activeTab === stage;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => handleTabChange(stage)}
              className={cn(
                "group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-900/40 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/5"
              )}
            >
              <span>{stage === "Offer-Made" ? "Offer Made" : stage}</span>
              <span
                className={cn(
                  "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                )}
              >
                {tabCounts[stage] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* ===== Filters Bar ===== */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-gray-900/40">
        <div className="flex flex-wrap items-center gap-2">
          {isCandidatesTab && (
            <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-indigo-200 has-[[data-state=checked]]:border-indigo-300 has-[[data-state=checked]]:bg-indigo-50/60 has-[[data-state=checked]]:text-indigo-700 dark:border-white/10 dark:bg-gray-900/40 dark:has-[[data-state=checked]]:border-indigo-500/40 dark:has-[[data-state=checked]]:bg-indigo-500/10 dark:has-[[data-state=checked]]:text-indigo-300">
              <Checkbox
                checked={showAll}
                onCheckedChange={(v) => { setShowAll(v as boolean); setPageIndex(0); }}
              />
              Show All
            </label>
          )}
          <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-indigo-200 has-[[data-state=checked]]:border-indigo-300 has-[[data-state=checked]]:bg-indigo-50/60 has-[[data-state=checked]]:text-indigo-700 dark:border-white/10 dark:bg-gray-900/40 dark:has-[[data-state=checked]]:border-indigo-500/40 dark:has-[[data-state=checked]]:bg-indigo-500/10 dark:has-[[data-state=checked]]:text-indigo-300">
            <Checkbox
              checked={showCompleted}
              onCheckedChange={(v) => { setShowCompleted(v as boolean); setPageIndex(0); }}
            />
            Show Completed Interviews
          </label>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle (List / Grid) */}
          <div className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 p-0.5 dark:border-white/10 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view"
              aria-pressed={viewMode === "list"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all",
                viewMode === "list"
                  ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-white dark:ring-white/10"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              aria-pressed={viewMode === "grid"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all",
                viewMode === "grid"
                  ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-white dark:ring-white/10"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </button>
          </div>

          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
            <Filter className="h-4 w-4" /> Filters
          </Button>
          <SearchInput
            size="sm"
            shortcut="/"
            placeholder="Search candidates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
            wrapperClassName="w-full sm:w-64"
          />

        </div>
      </div>

      {/* ── Auto-match suggestion banner ────────────────────────────────── */}
      {!loading && candidates.length === 0 && agentShown.length === 0 && (
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

      {/* ── List View (table) ───────────────────────────────────────────── */}
      {viewMode === "list" && (
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
              ) : pagedCandidates.length === 0 && agentShown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={20} className="py-16 text-center text-gray-500">
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    {showCompleted
                      ? "No completed interviews found."
                      : "No candidates found. Add candidates or upload resumes."}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                {pagedCandidates.map((c) => {
                  const isScheduled = c.interview_status === "Scheduled";
                  // Only show schedule label when status is actually "Scheduled"
                  const scheduleLabel = isScheduled
                    ? formatSchedule(c.interview_date, c.interview_timezone)
                    : null;
                  // Promote options exclude the candidate's current stage
                  const promoteOptions = getPromoteOptions(c.candidate_stage);
                  const shareLink = candidateInterviewLink(c, interviewUrl);

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
                          {hasRealEmail(c.email) ? (
                            <a
                              href={`mailto:${c.email}`}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {c.email}
                            </a>
                          ) : (
                            <p className="text-xs italic text-amber-600">No email — add one</p>
                          )}
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
                          onClick={() => router.push(`/evaluation/${c.ref}`)}
                          title="View Report"
                          className="w-9 h-9 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
                        >
                          <ChevronRight className="w-5 h-5 text-blue-600" />
                        </button>
                      </TableCell>

                      {/* Resume */}
                      <TableCell className="px-3">
                        {c.resume_url ? (
                          <a
                            href={mediaUrl(c.resume_url)}
                            target="_blank"
                            rel="noreferrer"
                            title="View Resume"
                          >
                            <Button variant="ghost" size="icon">
                              <FileText className="w-5 h-5 text-red-500" />
                            </Button>
                          </a>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => triggerResumeUpload(c.id)}
                            disabled={uploadingResumeIds.has(c.id)}
                            title={uploadingResumeIds.has(c.id) ? "Uploading…" : "Upload resume"}
                            className="text-amber-500 hover:text-amber-600"
                          >
                            {uploadingResumeIds.has(c.id) ? (
                              <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                              <Upload className="w-5 h-5" />
                            )}
                          </Button>
                        )}
                      </TableCell>

                      {/* Interview Schedule */}
                      <TableCell className="px-3">
                        <div className="flex items-center gap-1 min-w-[200px]">
                          {TERMINAL_STATUSES.has(c.interview_status) ? (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-xs">Interview Completed</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 whitespace-nowrap"
                                onClick={() => setRetakeCandidate(c)}
                                title="Download the interview, then reset so the candidate can retake it"
                              >
                                <RotateCcw className="w-3 h-3" /> Retake
                              </Button>
                            </div>
                          ) : !hasRealEmail(c.email) ? (
                            // No real email — block scheduling until one is added.
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white gap-1 whitespace-nowrap"
                              onClick={() => setEditCandidate(c)}
                              title="This candidate has no email. Add one before scheduling."
                            >
                              <Pencil className="w-3 h-3" /> Add email to schedule
                            </Button>
                          ) : isScheduled ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-yellow-500 hover:bg-yellow-600 text-white gap-1 whitespace-nowrap"
                                onClick={() => setScheduleCandidate(c)}
                              >
                                <CalendarDays className="w-3 h-3" /> Reschedule
                              </Button>
                              {shareLink && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white gap-1 whitespace-nowrap"
                                  onClick={() => {
                                    navigator.clipboard.writeText(shareLink);
                                    notifySuccess("Interview link copied (no registration required)!");
                                  }}
                                >
                                  <Link className="w-3 h-3" /> Share Link
                                </Button>
                              )}
                              <ObserverLinkButton candidateId={c.id} candidateName={c.name} />
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
                        {c.recording_url ? (
                          <a
                            href={mediaUrl(c.recording_url)}
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

                      {/* Edit + Remove */}
                      <TableCell className="px-3">
                        <div className="flex items-center gap-1">
                          {!TERMINAL_STATUSES.has(c.interview_status) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditCandidate(c)}
                              className="h-7 w-7 text-gray-400 hover:text-indigo-600"
                              title="Edit candidate details"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRemoveTarget(c.id)}
                            className="h-7 w-7 text-gray-400 hover:text-red-600"
                            title="Remove candidate from job"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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
                })}
                <TalentMatchRows matches={agentShown} jobId={jobId} />
                </>
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
      )}

      {/* ── Grid View ─────────────────────────────────────────────────── */}
      {viewMode === "grid" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-gray-900/40">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-72 w-full rounded-2xl" />
              ))}
            </div>
          ) : pagedCandidates.length === 0 && agentShown.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <Users className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              {showCompleted
                ? "No completed interviews found."
                : "No candidates found. Add candidates or upload resumes."}
            </div>
          ) : (
            <>
              {pagedCandidates.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pagedCandidates.map((c) => (
                  <CandidateGridCard
                    key={c.id}
                    candidate={c}
                    interviewUrl={interviewUrl}
                    onSchedule={() => setScheduleCandidate(c)}
                    onEdit={() => setEditCandidate(c)}
                    onRetake={() => setRetakeCandidate(c)}
                    onCancelSchedule={() => setCancelTarget(c.id)}
                    onRemove={() => setRemoveTarget(c.id)}
                    onOpenMailHistory={() => openEmailHistory(c.id, c.name)}
                    onViewReport={() => router.push(`/evaluation/${c.ref}`)}
                    onRecomputeFit={
                      c.job_id !== null ? () => handleRecomputeFit(c.id) : undefined
                    }
                    recomputing={recomputingIds.has(c.id)}
                    showFitPercentage={canSeeFitPercent}
                    onPromote={(stage) => handlePromote(c.id, stage)}
                    promoteOptions={getPromoteOptions(c.candidate_stage)}
                    onUploadResume={() => triggerResumeUpload(c.id)}
                    uploadingResume={uploadingResumeIds.has(c.id)}
                  />
                ))}
              </div>
              )}

              <TalentMatchCards matches={agentShown} jobId={jobId} />

              {/* Pagination for grid view */}
              <div className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-gray-100 pt-4 sm:flex-row dark:border-white/10">
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
                        onClick={safePage < totalPages - 1 ? () => setPageIndex(safePage + 1) : undefined}
                        aria-disabled={safePage >= totalPages - 1}
                        className={safePage >= totalPages - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </div>
      )}

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

      <EditCandidateModal
        open={!!editCandidate}
        onClose={() => setEditCandidate(null)}
        candidate={editCandidate}
        onUpdated={handleCandidateUpdated}
      />

      <RetakeInterviewModal
        open={!!retakeCandidate}
        onClose={() => setRetakeCandidate(null)}
        candidate={retakeCandidate}
        onReset={handleCandidateUpdated}
      />

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
                    onClick={handleDownloadJd}
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

/* =============================================================================
   CandidateGridCard — modern grid-view tile
   ========================================================================== */

interface CandidateGridCardProps {
  candidate: Candidate;
  interviewUrl: string | null;
  onSchedule: () => void;
  onEdit: () => void;
  onRetake: () => void;
  onCancelSchedule: () => void;
  onRemove: () => void;
  onOpenMailHistory: () => void;
  onViewReport: () => void;
  onRecomputeFit?: () => void;
  recomputing?: boolean;
  showFitPercentage?: boolean;
  onPromote: (stage: string) => void;
  promoteOptions: string[];
  onUploadResume?: () => void;
  uploadingResume?: boolean;
}

const AVATAR_PALETTE = [
  "from-indigo-500 to-blue-500",
  "from-orange-500 to-amber-500",
  "from-emerald-500 to-teal-500",
  "from-pink-500 to-rose-500",
  "from-purple-500 to-fuchsia-500",
  "from-sky-500 to-cyan-500",
];

function fitPercentAndLevel(c: Candidate): {
  pct: number | null;
  level: "high" | "medium" | "low" | null;
} {
  let parsedPct: number | null = null;
  if (c.fit_score_reasoning) {
    try {
      const r = JSON.parse(c.fit_score_reasoning);
      const raw = r?.fit_percentage ?? r?.percentage;
      if (typeof raw === "number" && raw > 0) parsedPct = raw;
    } catch {}
  }
  if (parsedPct === null && c.fit_score_details) {
    try {
      const d = JSON.parse(c.fit_score_details);
      const raw = d?.fit_percentage ?? d?.percentage;
      if (typeof raw === "number" && raw > 0) parsedPct = raw;
    } catch {}
  }
  if (parsedPct === null && c.resume_fit_score && c.resume_fit_score.endsWith("%")) {
    const n = parseInt(c.resume_fit_score.replace("%", ""), 10);
    if (!Number.isNaN(n)) parsedPct = n;
  }

  let level: "high" | "medium" | "low" | null = null;
  if (parsedPct !== null) {
    if (parsedPct >= 70) level = "high";
    else if (parsedPct >= 40) level = "medium";
    else level = "low";
  } else if (c.resume_fit_score === "high" || c.resume_fit_score === "medium" || c.resume_fit_score === "low") {
    level = c.resume_fit_score;
  }

  return { pct: parsedPct, level };
}

function CandidateGridCard({
  candidate: c,
  interviewUrl,
  onSchedule,
  onEdit,
  onRetake,
  onCancelSchedule,
  onRemove,
  onOpenMailHistory,
  onViewReport,
  onRecomputeFit,
  recomputing,
  showFitPercentage,
  onPromote,
  promoteOptions,
  onUploadResume,
  uploadingResume,
}: CandidateGridCardProps) {
  const initials = c.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  // Deterministic avatar color by id
  const avatarGradient = AVATAR_PALETTE[c.id % AVATAR_PALETTE.length];

  const { pct: fitPct, level: fitLevel } = fitPercentAndLevel(c);

  // Fit level color mapping
  const fitTheme = (() => {
    switch (fitLevel) {
      case "high":
        return {
          bar: "bg-gradient-to-r from-emerald-400 to-green-500",
          ring: "text-emerald-500",
          text: "text-emerald-600 dark:text-emerald-300",
          label: "High fit — strong match",
          sub: "Recommended",
        };
      case "medium":
        return {
          bar: "bg-gradient-to-r from-amber-400 to-orange-500",
          ring: "text-amber-500",
          text: "text-amber-600 dark:text-amber-300",
          label: "Medium fit — partial match",
          sub: "Review required",
        };
      case "low":
        return {
          bar: "bg-gradient-to-r from-rose-400 to-red-500",
          ring: "text-rose-500",
          text: "text-rose-600 dark:text-rose-300",
          label: "Low fit — weak match",
          sub: "Not recommended",
        };
      default:
        return {
          bar: "bg-gradient-to-r from-gray-300 to-gray-400",
          ring: "text-gray-400",
          text: "text-gray-500",
          label: "Fit score pending",
          sub: "Run AI analysis",
        };
    }
  })();

  const isScheduled = c.interview_status === "Scheduled";
  const isTerminal = TERMINAL_STATUSES.has(c.interview_status);
  const canSchedule =
    !isTerminal &&
    (isScheduled ||
      SCHEDULE_ALLOWED_STATUSES.has(c.interview_status) ||
      !c.interview_status);

  const scheduleLabel = isScheduled
    ? formatSchedule(c.interview_date, c.interview_timezone)
    : null;

  const statusClass =
    STATUS_COLORS[c.interview_status] || "bg-gray-100 text-gray-600";

  const resumeHref = mediaUrl(c.resume_url) ?? null;
  const shareLink = candidateInterviewLink(c, interviewUrl);

  const resumeButton = resumeHref ? (
    <a href={resumeHref} target="_blank" rel="noreferrer" className="contents">
      <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl">
        <FileText className="h-4 w-4" />
        Resume
      </Button>
    </a>
  ) : onUploadResume ? (
    <Button
      size="sm"
      variant="outline"
      onClick={onUploadResume}
      disabled={uploadingResume}
      className="h-9 gap-1.5 rounded-xl border-amber-300 text-amber-600 hover:bg-amber-50"
    >
      {uploadingResume ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          Uploading…
        </>
      ) : (
        <>
          <Upload className="h-4 w-4" />
          Upload Resume
        </>
      )}
    </Button>
  ) : (
    <Button size="sm" variant="outline" disabled className="h-9 gap-1.5 rounded-xl">
      <FileText className="h-4 w-4" />
      Resume
    </Button>
  );

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-gray-900/60">
      {/* Top accent strip */}
      <div className={cn("h-1.5 w-full", fitTheme.bar)} />

      <div className="flex flex-col gap-3 p-4">
        {/* Header row: avatar · name/email · kebab */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm",
              avatarGradient
            )}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {c.name}
            </p>
            {hasRealEmail(c.email) ? (
              <a
                href={`mailto:${c.email}`}
                className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300"
              >
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.email}</span>
              </a>
            ) : (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs italic text-amber-600">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">No email — add one</span>
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isTerminal && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit details
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onViewReport}>
                <Eye className="mr-2 h-4 w-4" /> View Report
              </DropdownMenuItem>
              {isTerminal && (
                <DropdownMenuItem onClick={onRetake}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Retake interview
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onOpenMailHistory}>
                <Mail className="mr-2 h-4 w-4" /> Email History
              </DropdownMenuItem>
              {onRecomputeFit && (
                <DropdownMenuItem
                  onClick={onRecomputeFit}
                  disabled={recomputing}
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", recomputing && "animate-spin")} />
                  {recomputing ? "Refreshing…" : "Refresh Fit Score"}
                </DropdownMenuItem>
              )}
              {isScheduled && shareLink && (
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                    notifySuccess("Interview link copied!");
                  }}
                >
                  <Link className="mr-2 h-4 w-4" /> Copy Candidate Link
                </DropdownMenuItem>
              )}
              {promoteOptions.length > 0 && (
                <>
                  <DropdownMenuItem disabled className="text-xs text-gray-400">
                    — Move to —
                  </DropdownMenuItem>
                  {promoteOptions.map((stage) => (
                    <DropdownMenuItem key={stage} onClick={() => onPromote(stage)}>
                      <ChevronRight className="mr-2 h-4 w-4" /> {stage}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {isScheduled && (
                <DropdownMenuItem onClick={onCancelSchedule}>
                  <X className="mr-2 h-4 w-4" /> Cancel Interview
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onRemove} className="text-red-600 focus:text-red-600">
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Fit score inset card — hover shows detailed tooltip */}
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <div className="flex cursor-help items-center gap-3 rounded-xl bg-gray-50 p-3 transition-colors hover:bg-gray-100 dark:bg-white/5 dark:hover:bg-white/10">
              <FitScoreRing
                pct={fitPct}
                level={fitLevel}
                className={fitTheme.ring}
                showPct={showFitPercentage !== false}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Fit Score
                </p>
                <p className={cn("truncate text-sm font-semibold", fitTheme.text)}>
                  {fitTheme.label}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {fitTheme.sub}
                </p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            align="center"
            sideOffset={12}
            collisionPadding={16}
            className="p-0 border-0 rounded-lg shadow-2xl backdrop-blur-xl bg-gray-900/90 ring-1 ring-white/10 overflow-hidden [&>span:last-child]:hidden"
          >
            <FitScoreTooltipContent
              fitLevel={c.resume_fit_score}
              reasoning={c.fit_score_reasoning}
              details={c.fit_score_details}
              showPercentage={showFitPercentage !== false}
            />
          </TooltipContent>
        </Tooltip>

        {/* Status pill */}
        <div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              statusClass
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isScheduled
                  ? "bg-blue-500"
                  : c.interview_status === "Completed"
                  ? "bg-green-500"
                  : c.interview_status === "New" || !c.interview_status
                  ? "bg-pink-500"
                  : "bg-gray-400"
              )}
            />
            {c.interview_status || "New"}
          </span>
        </div>

        {/* Date row — always shown. Shows scheduled/interviewed/not-scheduled. */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
          <span className="truncate">
            {(() => {
              if (scheduleLabel) return scheduleLabel;
              const formatted = c.interview_date
                ? formatSchedule(c.interview_date, c.interview_timezone)?.replace(/^Scheduled:\s*/, "")
                : null;
              if (isTerminal && formatted) return `Interviewed: ${formatted}`;
              if (isTerminal) return "Interview completed";
              if (formatted) return formatted;
              return "Not scheduled yet";
            })()}
          </span>
        </div>

        {/* Action buttons */}
        <div className="mt-1 grid grid-cols-2 gap-2">
          {isTerminal ? (
            <>
              <Button
                size="sm"
                onClick={onViewReport}
                className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-sm hover:from-indigo-600 hover:to-indigo-700"
              >
                <Eye className="h-4 w-4" />
                View Report
              </Button>
              {resumeButton}
            </>
          ) : canSchedule ? (
            <>
              {hasRealEmail(c.email) ? (
                <Button
                  size="sm"
                  onClick={onSchedule}
                  className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-sm hover:from-indigo-600 hover:to-indigo-700"
                >
                  <CalendarDays className="h-4 w-4" />
                  {isScheduled ? "Reschedule" : "Schedule"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={onEdit}
                  title="This candidate has no email. Add one before scheduling."
                  className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm hover:from-amber-600 hover:to-amber-700"
                >
                  <Pencil className="h-4 w-4" />
                  Add email
                </Button>
              )}
              {resumeButton}
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={onViewReport}
                className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-sm hover:from-indigo-600 hover:to-indigo-700"
              >
                <Eye className="h-4 w-4" />
                View Report
              </Button>
              {resumeButton}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

/* Circular ring for fit score */
function FitScoreRing({
  pct,
  level,
  className,
  showPct,
}: {
  pct: number | null;
  level: "high" | "medium" | "low" | null;
  className?: string;
  showPct?: boolean;
}) {
  const size = 56;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = pct !== null ? Math.max(0, Math.min(100, pct)) : 0;
  const dashOffset = circumference - (value / 100) * circumference;

  const display = pct !== null ? `${Math.round(pct)}%` : (level ? level[0].toUpperCase() : "—");

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-gray-200 dark:text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={pct === null ? circumference : dashOffset}
          className={cn("transition-all duration-500", className)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-sm font-bold text-gray-800 dark:text-white", !showPct && pct !== null && "opacity-0")}>
          {showPct === false && pct !== null ? (level ? level[0].toUpperCase() : "—") : display}
        </span>
      </div>
    </div>
  );
}

