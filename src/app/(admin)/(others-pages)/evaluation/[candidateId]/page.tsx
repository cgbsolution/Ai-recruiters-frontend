"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  ImageIcon,
  Mail,
  MessageSquare,
  Monitor,
  Phone,
  Shield,
  Star,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Video,
  XCircle,
  Briefcase,
  Calendar,
  CalendarClock,
  CalendarCheck,
  Sparkles,
  ThumbsUp,
  Clipboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import VideoPlayer from "@/components/evaluation/VideoPlayer";
import { api, API_BASE } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";
import { FIT_LEVEL_HIGH, FIT_LEVEL_MEDIUM } from "@/lib/fitScore";

const API_STATIC = API_BASE.replace(/\/api$/, "");

// ── Types ───────────────────────────────────────────────────────────────────

interface TranscriptPair {
  question: string;
  answer: string;
  index: number;
}

interface FullTranscriptMessage {
  role: "ai" | "candidate";
  content: string;
  question_index: number | null;
  timestamp: string | null;
}

interface ViolationEntry {
  type: string;
  details: string | null;
  occurred_at: string | null;
}

interface PerQuestionEval {
  index: number;
  score: number;
  positives: string[];
  negatives: string[];
}

interface SkillRating {
  skill: string;
  rating: number;
  evaluation: string;
}

interface CodingTestResult {
  test_index: number;
  description: string;
  input: string;
  expected_output: string;
  actual_output: string;
  passed: boolean;
  stderr?: string;
  error?: string | null;
}

interface CodingSubmission {
  id: number;
  question_index: number | null;
  title: string | null;
  description: string | null;
  difficulty: string | null;
  language: string;
  code: string;
  test_cases_total: number;
  test_cases_passed: number;
  test_results: CodingTestResult[];
  execution_time_ms: number | null;
  submitted_at: string | null;
}

interface EvaluationData {
  candidate: {
    id: number;
    name: string;
    email: string;
    phone: string;
    location: string;
    role: string;
    candidate_stage: string;
    interview_status: string;
    interview_date: string | null;
    interview_timezone: string | null;
    image: string | null;
  };
  job: { title: string; experience_min: number; experience_max: number } | null;
  resume: { path: string | null; url: string | null };
  fit_score: {
    level: string | null;
    reasoning: {
      summary?: string;
      fit_percentage?: number;
      percentage?: number;
    } | null;
    details: string[] | null;
  };
  scores: {
    overall: number | null;
    trust: number | null;
    grammar: number | null;
    confidence: number | null;
    clarity: number | null;
    pronunciation: number | null;
    enthusiasm: number | null;
    conciseness: number | null;
    ai_cheating: number | null;
  };
  recording: { link: string | null; duration: string | null };
  transcript: TranscriptPair[];
  full_transcript: FullTranscriptMessage[];
  evaluation: {
    recommendation: string | null;
    summary: string | null;
    strengths: string[];
    weaknesses: string[];
    detailed_feedback: string | null;
    meets_threshold: boolean;
    technical_score: number | null;
    communication_score: number | null;
    problem_solving_score: number | null;
    confidence_score: number | null;
    coding_score: number | null;
    overall_score: number | null;
    per_question_evaluations: PerQuestionEval[];
    skills_ratings: SkillRating[];
  } | null;
  violations: ViolationEntry[];
  screenshots: { file_path: string; captured_at: string | null; face_count?: number | null }[];
  session: {
    id: number;
    started_at: string | null;
    completed_at: string | null;
    violation_count: number;
    status: string;
  } | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: "Tab Switch Detected",
  fullscreen_exit: "Fullscreen Exit",
  face_not_detected: "Face Not Detected",
  multiple_faces: "Multiple Faces Detected",
};

const VIOLATION_ICONS: Record<string, React.ReactNode> = {
  tab_switch: <Monitor className="w-4 h-4" />,
  fullscreen_exit: <Monitor className="w-4 h-4" />,
  face_not_detected: <UserCheck className="w-4 h-4" />,
  multiple_faces: <Users className="w-4 h-4" />,
};

function formatDateTime(iso: string | null, tz?: string | null) {
  if (!iso) return null;
  const tzMap: Record<string, string> = {
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Kolkata": "Asia/Kolkata",
    IST: "Asia/Kolkata",
  };
  const ianaZone = tz ? tzMap[tz] || tz : undefined;
  return new Date(iso).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ianaZone,
  });
}

function computeDuration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} hours ${m} minutes`;
}

// ── Score Circle ────────────────────────────────────────────────────────────

function ScoreCircle({ value, size = 64 }: { value: number | null; size?: number }) {
  const pct = value ?? 0;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const color = pct >= 70 ? "#f59e0b" : pct >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="inline-flex items-center gap-1">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round"
            className="transition-all duration-700" />
        </svg>
        <span className="relative text-lg font-bold text-gray-800">{value != null ? Math.round(pct) : "—"}</span>
      </div>
      <span className="text-lg font-bold text-gray-700">%</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EvaluationPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const router = useRouter();
  const { candidateId } = React.use(params);
  const [data, setData] = useState<EvaluationData | null>(null);
  const [codingSubmissions, setCodingSubmissions] = useState<CodingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("evaluation");
  const [showViolations, setShowViolations] = useState(false);
  const [expandedQA, setExpandedQA] = useState<Set<number>>(new Set());
  const [generatingEval, setGeneratingEval] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const evalData = await api<EvaluationData>(`/candidates/${candidateId}/evaluation`);
        setData(evalData);
        // Fetch coding submissions if a session exists. Failure is non-fatal —
        // an interview without coding will simply hide the tab.
        if (evalData.session?.id) {
          try {
            const sub = await api<{ submissions: CodingSubmission[]; count: number }>(
              `/interview/sessions/${evalData.session.id}/coding-submissions`,
            );
            setCodingSubmissions(sub.submissions || []);
          } catch (subErr) {
            console.warn("[evaluation] coding submissions fetch failed:", subErr);
            setCodingSubmissions([]);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [candidateId]);

  const toggleQA = useCallback((idx: number) => {
    setExpandedQA((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  const generateEvaluation = useCallback(async () => {
    setGeneratingEval(true);
    try {
      // Use regenerate endpoint which deletes old evaluation and re-triggers background task
      await api(`/candidates/${candidateId}/regenerate-evaluation`, { method: "POST" });

      // Poll /candidates/{id}/evaluation until evaluation data appears (max 3 min)
      const MAX_POLLS = 45;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          const fresh = await api<EvaluationData>(`/candidates/${candidateId}/evaluation`);
          if (fresh.evaluation) {
            setData(fresh);
            notifySuccess("Evaluation generated successfully!");
            return;
          }
        } catch {
          // not ready yet
        }
      }
      notifyError("Evaluation is taking longer than expected. Please check back in a few minutes.");
    } catch (err: any) {
      notifyError(err.message || "Failed to generate evaluation");
    } finally {
      setGeneratingEval(false);
    }
  }, [candidateId]);

  const copyRecordingUrl = useCallback(() => {
    if (!data?.recording.link) return;
    const url = data.recording.link.startsWith("/")
      ? `${API_STATIC}${data.recording.link}`
      : data.recording.link;
    navigator.clipboard.writeText(url);
    notifySuccess("Recording URL copied!");
  }, [data]);

  const downloadPdf = useCallback(async () => {
    if (!contentRef.current || !data) return;
    setGeneratingPdf(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      // Expand all collapsed answers before capturing
      const allIndices = new Set(data.transcript.map((t) => t.index));
      setExpandedQA(allIndices);

      // Wait for React to re-render with expanded answers + hidden elements
      await new Promise((r) => setTimeout(r, 400));

      const element = contentRef.current;

      // Convert all images to inline base64 to avoid tainted canvas / CORS issues
      const images = element.querySelectorAll("img");
      const origSrcs: { el: HTMLImageElement; src: string }[] = [];
      await Promise.all(
        Array.from(images).map(async (img) => {
          try {
            if (!img.src || img.src.startsWith("data:")) return;
            origSrcs.push({ el: img, src: img.src });

            // For images served from our API backend, proxy through the API
            // to ensure proper CORS headers
            let fetchUrl = img.src;
            if (img.src.includes("/uploads/")) {
              // Extract the path after the domain and use API_BASE to proxy
              const uploadPath = img.src.substring(img.src.indexOf("/uploads/"));
              fetchUrl = `${API_BASE.replace(/\/api$/, "")}${uploadPath}`;
            }

            // Convert to base64 using canvas (avoids CORS fetch issues entirely)
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const tempImg = new Image();
              tempImg.crossOrigin = "anonymous";
              tempImg.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = tempImg.naturalWidth;
                canvas.height = tempImg.naturalHeight;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.drawImage(tempImg, 0, 0);
                  resolve(canvas.toDataURL("image/jpeg", 0.8));
                } else {
                  reject(new Error("No canvas context"));
                }
              };
              tempImg.onerror = reject;
              tempImg.src = fetchUrl;
            });
            img.src = dataUrl;
          } catch {
            // If image conversion fails, try direct fetch as fallback
            try {
              const resp = await fetch(img.src, { credentials: "include" });
              if (resp.ok) {
                const blob = await resp.blob();
                if (blob.size > 0) {
                  const dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                  img.src = dataUrl;
                  return;
                }
              }
            } catch {}
            img.style.visibility = "hidden";
          }
        })
      );

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      // Restore original image sources
      for (const { el, src } of origSrcs) {
        el.src = src;
        el.style.visibility = "";
      }

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // A4 dimensions in points
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 20;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const scaleFactor = usableWidth / imgWidth;
      const scaledHeight = imgHeight * scaleFactor;

      const pdf = new jsPDF("p", "pt", "a4");
      let position = 0;

      while (position < scaledHeight) {
        if (position > 0) pdf.addPage();

        // Calculate source crop for this page
        const srcY = position / scaleFactor;
        const srcH = Math.min(usableHeight / scaleFactor, imgHeight - srcY);
        const destH = srcH * scaleFactor;

        // Create a canvas for this page slice
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = imgWidth;
        pageCanvas.height = Math.ceil(srcH);
        const ctx = pageCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH);
          const pageImg = pageCanvas.toDataURL("image/jpeg", 0.95);
          pdf.addImage(pageImg, "JPEG", margin, margin, usableWidth, destH);
        }

        position += usableHeight;
      }

      const safeName = (data.candidate.name || "candidate").replace(/\s+/g, "_");
      pdf.save(`${safeName}_Evaluation.pdf`);
      notifySuccess("Evaluation PDF downloaded successfully!");
    } catch (err) {
      console.error("PDF generation failed:", err);
      notifyError("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPdf(false);
    }
  }, [data]);

  // Per-question evaluation map — must be before any early returns
  const pqMap = useMemo(() => {
    const m = new Map<number, PerQuestionEval>();
    if (data?.evaluation?.per_question_evaluations) {
      for (const pq of data.evaluation.per_question_evaluations) m.set(pq.index, pq);
    }
    return m;
  }, [data?.evaluation]);

  if (loading) return (
    <div className="space-y-4 p-6 max-w-7xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="p-6 text-center text-red-500">
      <p>Failed to load evaluation: {error}</p>
      <Button variant="outline" onClick={() => router.back()} className="mt-4">Go Back</Button>
    </div>
  );

  const { candidate, job, scores, recording, transcript, full_transcript, evaluation, violations, screenshots, session } = data;

  const recordingHref = recording.link?.startsWith("/")
    ? `${API_STATIC}${recording.link}` : recording.link ?? undefined;

  const tz = candidate.interview_timezone ?? "Asia/Kolkata";
  const interviewDateStr = session?.started_at
    ? formatDateTime(session.started_at, tz)
    : formatDateTime(candidate.interview_date, tz);
  const interviewEndStr = formatDateTime(session?.completed_at ?? null, tz);
  const durationStr = session?.started_at && session?.completed_at
    ? computeDuration(session.started_at, session.completed_at)
    : recording.duration ?? null;
  const expRange = job?.experience_min != null && job?.experience_max != null
    ? `${job.experience_min}-${job.experience_max} years` : null;

  const cheatingScore = scores.ai_cheating;
  // ai_cheating_score: 0 = no cheating, 100 = max cheating.
  // Display as X/10 inverted: 10/10 = clean, 0/10 = max violations
  const cheatingDisplay = cheatingScore != null
    ? `${Math.round((100 - cheatingScore) / 10)} / 10` : null;

  // ── Derived values for stat cards ────────────────────────────────────────
  const fitPct = (() => {
    const r = data.fit_score.reasoning;
    const raw = r?.fit_percentage ?? r?.percentage;
    if (typeof raw === "number" && raw > 0) return Math.round(raw);
    return null;
  })();
  const fitTagline =
    fitPct === null
      ? "No fit data"
      : fitPct >= FIT_LEVEL_HIGH
      ? "Strong match"
      : fitPct >= FIT_LEVEL_MEDIUM
      ? "Partial match"
      : "Weak match";

  const trustOutOfTen = scores.trust != null ? (scores.trust / 10).toFixed(1) : null;
  const trustTagline =
    scores.trust == null
      ? "Not scored"
      : scores.trust >= 70
      ? "High trust"
      : scores.trust >= 40
      ? "Moderate trust"
      : "Low trust";

  const aiRoundPct = scores.overall != null ? Math.round(scores.overall) : null;
  const aiRoundTagline =
    aiRoundPct === null
      ? "Pending"
      : aiRoundPct >= 70
      ? "Strong performance"
      : aiRoundPct >= 40
      ? "Fair performance"
      : "Weak performance";

  // When evaluation generation FAILS, the backend stores a placeholder row whose
  // summary explains the failure — so `evaluation` is truthy even though no real
  // report exists. Detect that so we (a) don't render the error as a "summary"
  // and (b) still show the Re-generate button (which was gated on `!evaluation`,
  // so it never appeared in the failed state).
  const evalFailed =
    !!evaluation &&
    (!evaluation.summary ||
      /could not be generated|last error|unrepairable json|evaluation failed|jsondecodeerror/i.test(
        evaluation.summary || "",
      ));

  const cleanCheating = cheatingScore != null ? Math.round((100 - cheatingScore) / 10) : null;
  const cheatingTagline =
    cleanCheating === null
      ? "Not scored"
      : cleanCheating >= 9
      ? "Clean session"
      : cleanCheating >= 6
      ? "Minor flags"
      : "Multiple flags";

  return (
    <div ref={contentRef} className="max-w-7xl mx-auto px-4 sm:px-6 pb-12 pt-4 min-w-0 space-y-5">

      {/* ══════════════════════════════════════════════════════════════════════
          MODERN CANDIDATE HERO
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-5 sm:p-6 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="shrink-0">
            {candidate.image ? (
              <img
                src={candidate.image.startsWith("/") ? `${API_STATIC}${candidate.image}` : candidate.image}
                alt={candidate.name}
                crossOrigin="anonymous"
                className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl object-cover shadow-md ring-4 ring-white dark:ring-white/10"
              />
            ) : (
              <div className="flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-2xl bg-white shadow-md ring-4 ring-white dark:bg-gray-900 dark:ring-white/10">
                <User className="h-10 w-10 text-gray-300" />
              </div>
            )}
          </div>

          {/* Identity + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-900/80 dark:text-indigo-300 dark:ring-indigo-500/20">
                <User className="h-3 w-3" />
                Candidate
              </span>
              {cheatingDisplay && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-sm ring-1",
                    (cleanCheating ?? 10) >= 9
                      ? "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
                      : (cleanCheating ?? 10) >= 6
                      ? "bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30"
                      : "bg-rose-50 text-rose-600 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    (cleanCheating ?? 10) >= 9 ? "bg-emerald-500" : (cleanCheating ?? 10) >= 6 ? "bg-amber-500" : "bg-rose-500"
                  )} />
                  AI-Cheating {cheatingDisplay}
                </span>
              )}
              {violations.length > 0 && !generatingPdf && (
                <button
                  onClick={() => setShowViolations(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {violations.length} flag{violations.length !== 1 ? "s" : ""}
                </button>
              )}
            </div>

            <h1 className="mt-2 truncate text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl dark:text-white">
              {candidate.name}
            </h1>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              {candidate.role || job?.title || "—"}
            </p>

            {/* Contact + session meta — two columns */}
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-gray-600 sm:grid-cols-2 dark:text-gray-300">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-gray-400" />
                <span className="truncate">{candidate.email}</span>
              </div>
              {candidate.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  <span>+91({candidate.phone})</span>
                </div>
              )}
              {expRange && (
                <div className="flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                  <span>Experience: {expRange}</span>
                </div>
              )}
              {durationStr && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span>Duration: {durationStr}</span>
                </div>
              )}
              {interviewDateStr && (
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Started: {interviewDateStr}</span>
                </div>
              )}
              {interviewEndStr && (
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Ended: {interviewEndStr}</span>
                </div>
              )}
            </div>

            {recordingHref && (
              <div className="mt-4">
                {generatingPdf ? (
                  <p className="break-all text-xs text-indigo-600">
                    Recording: {`${API_STATIC}${recording.link}`}
                  </p>
                ) : (
                  <Button variant="outline" size="sm" onClick={copyRecordingUrl} className="gap-1.5 rounded-xl bg-white/80 backdrop-blur dark:bg-gray-900/60">
                    <Clipboard className="h-3.5 w-3.5" />
                    Copy recording URL
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          STAT CARDS
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Fit Score"
          value={fitPct !== null ? `${fitPct}%` : "—"}
          tagline={fitTagline}
          icon={<TrendingUp className="h-4 w-4" />}
          iconWrap="bg-emerald-50 text-emerald-500 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
          topBar="bg-gradient-to-r from-emerald-400 to-green-500"
        />
        <StatCard
          label="Trust Score"
          value={trustOutOfTen != null ? `${trustOutOfTen}/10` : "—"}
          tagline={trustTagline}
          icon={<Shield className="h-4 w-4" />}
          iconWrap="bg-indigo-50 text-indigo-500 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20"
          topBar="bg-gradient-to-r from-indigo-400 to-violet-500"
        />
        <StatCard
          label="AI Round Score"
          value={aiRoundPct !== null ? `${aiRoundPct}%` : "—"}
          tagline={aiRoundTagline}
          icon={<Briefcase className="h-4 w-4" />}
          iconWrap="bg-sky-50 text-sky-500 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20"
          topBar="bg-gradient-to-r from-sky-400 to-cyan-500"
        />
        <StatCard
          label="Cheating Flags"
          value={cleanCheating !== null ? `${cleanCheating}/10` : "—"}
          tagline={cheatingTagline}
          icon={<AlertTriangle className="h-4 w-4" />}
          iconWrap={cn(
            "ring-1",
            (cleanCheating ?? 10) >= 9
              ? "bg-emerald-50 text-emerald-500 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
              : (cleanCheating ?? 10) >= 6
              ? "bg-amber-50 text-amber-500 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20"
              : "bg-rose-50 text-rose-500 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20"
          )}
          topBar={cn(
            (cleanCheating ?? 10) >= 9
              ? "bg-gradient-to-r from-emerald-400 to-green-500"
              : (cleanCheating ?? 10) >= 6
              ? "bg-gradient-to-r from-amber-400 to-orange-500"
              : "bg-gradient-to-r from-rose-400 to-red-500"
          )}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODERN PILL TABS
         ══════════════════════════════════════════════════════════════════════ */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {!generatingPdf && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="h-auto gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/5">
            {[
              { value: "evaluation", label: "Overview", icon: <Star className="h-3.5 w-3.5" /> },
              { value: "recording", label: "Interview Recording", icon: <Video className="h-3.5 w-3.5" /> },
              ...(codingSubmissions.length > 0
                ? [{ value: "coding", label: `Coding (${codingSubmissions.length})`, icon: <FileText className="h-3.5 w-3.5" /> }]
                : []),
              { value: "resume", label: "Resume & Portfolio", icon: <FileText className="h-3.5 w-3.5" /> },
              { value: "activity", label: "Activity", icon: <Clock className="h-3.5 w-3.5" /> },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-gray-600 transition-all data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-gray-200 dark:text-gray-300 dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-white dark:data-[state=active]:ring-white/10"
              >
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadPdf} disabled={generatingPdf}>
                <FileText className="mr-2 h-4 w-4" /> {generatingPdf ? "Generating PDF…" : "Download Evaluation PDF"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`${API_BASE}/candidates/${candidateId}/evaluation/download-docx`, "_blank")}>
                <FileText className="mr-2 h-4 w-4" /> Download Evaluation as Docx
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`${API_BASE}/candidates/${candidateId}/evaluation/download-transcript`, "_blank")}>
                <MessageSquare className="mr-2 h-4 w-4" /> Download Interview Transcript
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        )}

        {/* ═══════════════════════ TAB: EVALUATION ═══════════════════════════ */}
        <TabsContent value="evaluation" className="mt-5 space-y-6">
          {/* ── Recommendation / Verdict card ─────────────────────────────── */}
          {evaluation?.recommendation && (
            <div className={cn(
              "relative overflow-hidden rounded-2xl border p-5 sm:p-6",
              evaluation.meets_threshold
                ? "border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent"
                : "border-amber-100 bg-gradient-to-br from-amber-50/70 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent"
            )}>
              <div className="flex items-start gap-4">
                <span className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1",
                  evaluation.meets_threshold
                    ? "bg-emerald-100 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30"
                    : "bg-amber-100 text-amber-600 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30"
                )}>
                  <ThumbsUp className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                      evaluation.meets_threshold
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    )}>
                      {evaluation.meets_threshold ? "Recommended" : "Review"}
                    </span>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {evaluation.recommendation}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                    Justification for Recommendation
                  </h3>
                  {evaluation.detailed_feedback && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                      {evaluation.detailed_feedback}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

            {/* ── LEFT: Questions and Evaluations ──────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Questions &amp; Evaluations</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Per-question scoring with AI feedback</p>
                </div>
              </div>

              {transcript.length > 0 ? transcript.map((pair) => {
                const pq = pqMap.get(pair.index);
                const isExpanded = expandedQA.has(pair.index);
                const answerText = pair.answer;
                const isSkipped = answerText === "[No answer provided — skipped]";
                const showToggle = !isSkipped && answerText.length > 250;
                const displayAnswer = isExpanded ? answerText : showToggle ? answerText.slice(0, 250) + "..." : answerText;
                const scoreColor = pq
                  ? pq.score >= 70
                    ? "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
                    : pq.score >= 40
                    ? "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30"
                    : "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
                  : "";

                return (
                  <div
                    key={pair.index}
                    className="rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-indigo-200 hover:shadow-sm dark:border-white/10 dark:bg-gray-900/40"
                  >
                    {/* Q header */}
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                        Q{pair.index}
                        <span className="opacity-80">Question</span>
                      </span>
                      {pq && (
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", scoreColor)}>
                          {pq.score}%
                        </span>
                      )}
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                      {pair.question}
                    </p>

                    {/* Candidate's Answer */}
                    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-white/10 dark:bg-white/5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Candidate&apos;s Answer
                      </p>
                      <p className={cn(
                        "mt-1 text-sm leading-relaxed",
                        isSkipped ? "italic text-gray-400" : "text-gray-700 dark:text-gray-200"
                      )}>
                        {displayAnswer}
                        {showToggle && (
                          <button
                            onClick={() => toggleQA(pair.index)}
                            className="ml-1 font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                          >
                            {isExpanded ? "Show less" : "Read more"}
                          </button>
                        )}
                      </p>
                    </div>

                    {/* Per-question positives + concerns */}
                    {pq && (pq.positives.length > 0 || pq.negatives.length > 0) && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {pq.positives.length > 0 && (
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                              <ThumbsUp className="h-3 w-3" /> Positives
                            </p>
                            <ul className="space-y-1">
                              {pq.positives.map((p, i) => (
                                <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                                  <span>{p}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {pq.negatives.length > 0 && (
                          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
                            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-300">
                              <AlertTriangle className="h-3 w-3" /> Concerns
                            </p>
                            <ul className="space-y-1">
                              {pq.negatives.map((n, i) => (
                                <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-rose-500" />
                                  <span>{n}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center text-gray-400 dark:border-white/10 dark:bg-gray-900/40">
                  <MessageSquare className="mx-auto mb-2 h-10 w-10 opacity-50" />
                  <p className="text-sm">No interview questions available yet.</p>
                </div>
              )}
            </div>

            {/* ── RIGHT: Overall Summary ───────────────────────────────────── */}
            <div className="space-y-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-500 ring-1 ring-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/20">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Overall Summary</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">AI-generated verdict and insights</p>
                </div>
              </div>

              {/* Score + Summary */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900/40">
                <div className="flex items-center gap-4">
                  <ScoreCircle value={scores.overall} />
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Overall Score</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white">
                      {aiRoundTagline} candidate
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Based on {transcript.length} {transcript.length === 1 ? "question" : "questions"}
                    </p>
                  </div>
                </div>

                {evaluation?.summary && !evalFailed && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Interview Summary</p>
                      <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                        {evaluation.summary}
                      </p>
                    </div>

                    {evaluation.strengths.length > 0 && (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                          <ThumbsUp className="h-3 w-3" /> Strengths
                        </p>
                        <ul className="space-y-1.5">
                          {evaluation.strengths.map((s, i) => (
                            <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                              <span>
                                <strong className="text-gray-900 dark:text-white">
                                  {s.split(":")[0]}{s.includes(":") ? ":" : ""}
                                </strong>
                                {s.includes(":") ? s.split(":").slice(1).join(":") : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {evaluation.weaknesses.length > 0 && (
                      <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> Weaknesses
                        </p>
                        <ul className="space-y-1.5">
                          {evaluation.weaknesses.map((w, i) => (
                            <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                              <span>
                                <strong className="text-gray-900 dark:text-white">
                                  {w.split(":")[0]}{w.includes(":") ? ":" : ""}
                                </strong>
                                {w.includes(":") ? w.split(":").slice(1).join(":") : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {(!evaluation || evalFailed) && (
                  <div className="space-y-4 py-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-100">
                      <TrendingUp className="h-6 w-6 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        {evalFailed
                          ? "Evaluation couldn't be generated"
                          : session?.status === "completed" || session?.status === "terminated"
                          ? "Evaluation report was not generated"
                          : "Evaluation will appear after the interview is completed."}
                      </p>
                      {(evalFailed || session?.status === "completed" || session?.status === "terminated") && (
                        <p className="mt-1 text-xs text-gray-400">
                          Click below to {evalFailed ? "re-generate" : "generate"} it. This may take 1–3 minutes.
                        </p>
                      )}
                    </div>
                    {session?.id && (evalFailed || session?.status === "completed" || session?.status === "terminated") && (
                      <Button onClick={generateEvaluation} disabled={generatingEval} className="gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600">
                        {generatingEval ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Generating… (up to 3 min)
                          </>
                        ) : (
                          <>
                            <TrendingUp className="h-4 w-4" />
                            {evalFailed ? "Re-generate Report" : "Generate Evaluation Report"}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Skills Rating */}
              {evaluation?.skills_ratings && evaluation.skills_ratings.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-500 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20">
                      <Star className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Skills Rating</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Breakdown by evaluated competency</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {evaluation.skills_ratings.map((sr, idx) => (
                      <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-indigo-200 hover:shadow-sm dark:border-white/10 dark:bg-gray-900/40">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{sr.skill}</p>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                            {sr.rating}/5
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "h-3.5 w-3.5",
                                i < sr.rating ? "fill-amber-400 text-amber-400" : "text-gray-200 dark:text-white/10"
                              )}
                            />
                          ))}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                          {sr.evaluation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════ TAB: RECORDING + TRANSCRIPT ═════════════ */}
        <TabsContent value="recording" className="mt-5 space-y-5">
          {/* Recording card */}
          <div className="overflow-hidden rounded-2xl border border-gray-900 bg-gray-950 text-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
                  <Video className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Interview Recording</p>
                  {recording.duration && (
                    <p className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" /> {recording.duration}
                    </p>
                  )}
                </div>
              </div>
              {recordingHref && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyRecordingUrl}
                    className="h-8 gap-1.5 rounded-lg border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy URL
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const recFile = recording.link?.split("/").pop() || "recording.webm";
                      const downloadUrl = `${API_STATIC}/recordings/${recFile}/download?format=original`;
                      window.open(downloadUrl, "_blank");
                    }}
                    className="h-8 gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              )}
            </div>
            <div className="p-5">
              {recordingHref ? (
                <div className="mx-auto max-w-4xl overflow-hidden rounded-xl bg-black">
                  <VideoPlayer src={recordingHref} />
                </div>
              ) : (
                <div className="py-16 text-center text-gray-400">
                  <Video className="mx-auto mb-3 h-16 w-16 opacity-40" />
                  <p className="text-lg font-medium">No recording available</p>
                  <p className="mt-1 text-sm">The recording will appear here after the interview is completed.</p>
                </div>
              )}
            </div>
          </div>

          {/* Transcript — always shown under the recording */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900/40">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white px-5 py-3 dark:border-white/10 dark:from-indigo-500/5 dark:to-transparent">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Interview Transcript</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Full conversation between AI interviewer and candidate</p>
                </div>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                {full_transcript.length > 0 ? full_transcript.length : transcript.length * 2} messages
              </span>
            </div>
            <div className="p-5">
              {full_transcript.length > 0 ? (
                <div className="mx-auto max-w-3xl space-y-4">
                  {full_transcript.map((msg, idx) => {
                    const isAI = msg.role === "ai";
                    const time = msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                      : null;
                    return (
                      <div key={idx} className={cn("flex gap-3", isAI ? "justify-start" : "justify-end")}>
                        {isAI && (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/15">
                            <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                          </div>
                        )}
                        <div className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2.5",
                          isAI
                            ? "rounded-tl-sm bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-gray-100"
                            : "rounded-tr-sm bg-gradient-to-br from-indigo-500 to-indigo-600 text-white"
                        )}>
                          <p className="mb-1 text-[11px] font-semibold opacity-70">
                            {isAI ? "AI Interviewer" : "Candidate"}{time && ` · ${time}`}
                          </p>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                        {!isAI && (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-500/15">
                            <User className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : transcript.length > 0 ? (
                <div className="mx-auto max-w-3xl space-y-4">
                  {transcript.map((pair) => (
                    <React.Fragment key={pair.index}>
                      <div className="flex justify-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/15">
                          <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                        </div>
                        <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5 text-gray-800 dark:bg-white/5 dark:text-gray-100">
                          <p className="mb-1 text-[11px] font-semibold opacity-70">AI Interviewer · Q{pair.index}</p>
                          <p className="text-sm leading-relaxed">{pair.question}</p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <div className={cn(
                          "max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-2.5",
                          pair.answer === "[No answer provided — skipped]"
                            ? "bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                            : "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white"
                        )}>
                          <p className="mb-1 text-[11px] font-semibold opacity-70">Candidate</p>
                          <p className={cn("text-sm leading-relaxed", pair.answer === "[No answer provided — skipped]" && "italic")}>
                            {pair.answer}
                          </p>
                        </div>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-500/15">
                          <User className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-gray-400">
                  <MessageSquare className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  <p className="text-sm">No transcript available yet.</p>
                </div>
              )}
            </div>
          </div>

        </TabsContent>

        {/* ═══════════════════════ TAB: CODING ══════════════════════════════ */}
        {codingSubmissions.length > 0 && (
          <TabsContent value="coding" className="mt-5">
            <CodingTab
              submissions={codingSubmissions}
              codingScore={data?.evaluation?.coding_score ?? null}
            />
          </TabsContent>
        )}

        {/* ═══════════════════════ TAB: RESUME & PORTFOLIO ═════════════════ */}
        <TabsContent value="resume" className="mt-5">
          <ResumePortfolioTab
            candidate={candidate}
            job={job}
            resumeUrl={data.resume.url}
            resumePath={data.resume.path}
            fitPct={fitPct}
            fitSummary={data.fit_score.reasoning?.summary ?? null}
          />
        </TabsContent>

        {/* ═══════════════════════ TAB: ACTIVITY ════════════════════════════ */}
        <TabsContent value="activity" className="mt-5">
          <ActivityTab
            candidate={candidate}
            job={job}
            session={session}
            screenshots={screenshots}
            violations={violations}
            fitPct={fitPct}
            evaluationStatus={evaluation?.recommendation ?? null}
            timezone={tz}
          />
        </TabsContent>
      </Tabs>

      {/* ── Violations Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showViolations} onOpenChange={setShowViolations}>
        <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              AI Cheating Detection — Violation Report
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            {violations.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  <strong>{violations.length} violation{violations.length !== 1 ? "s" : ""}</strong> detected during the interview.
                </p>
                {violations.map((v, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="shrink-0 mt-0.5 text-red-500">
                      {VIOLATION_ICONS[v.type] ?? <AlertTriangle className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-red-700">{VIOLATION_LABELS[v.type] ?? v.type}</p>
                      {v.details && <p className="text-xs text-red-600 mt-0.5">{v.details}</p>}
                      {v.occurred_at && (
                        <p className="text-xs text-gray-500 mt-1">{new Date(v.occurred_at).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No violations detected.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Resume & Portfolio Tab ──────────────────────────────────────────────────

function ResumePortfolioTab({
  candidate,
  job,
  resumeUrl,
  resumePath,
  fitPct,
  fitSummary,
}: {
  candidate: EvaluationData["candidate"];
  job: EvaluationData["job"];
  resumeUrl: string | null;
  resumePath: string | null;
  fitPct: number | null;
  fitSummary: string | null;
}) {
  const resumeHref = resumeUrl
    ? resumeUrl.startsWith("http")
      ? resumeUrl
      : `${API_STATIC}${resumeUrl.startsWith("/") ? "" : "/"}${resumeUrl}`
    : resumePath
    ? resumePath.startsWith("http")
      ? resumePath
      : `${API_STATIC}${resumePath.startsWith("/") ? "" : "/"}${resumePath}`
    : null;

  const fitTheme =
    fitPct === null
      ? { bar: "bg-gray-300", ring: "ring-gray-200", label: "Not scored", text: "text-gray-500", bg: "from-gray-50 to-white border-gray-200" }
      : fitPct >= FIT_LEVEL_HIGH
      ? { bar: "bg-emerald-500", ring: "ring-emerald-200", label: "Strong match", text: "text-emerald-600", bg: "from-emerald-50 to-white border-emerald-200" }
      : fitPct >= FIT_LEVEL_MEDIUM
      ? { bar: "bg-amber-500", ring: "ring-amber-200", label: "Partial match", text: "text-amber-600", bg: "from-amber-50 to-white border-amber-200" }
      : { bar: "bg-rose-500", ring: "ring-rose-200", label: "Weak match", text: "text-rose-600", bg: "from-rose-50 to-white border-rose-200" };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Left: Resume Preview (spans 2 cols on desktop) */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900/40 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white px-5 py-3 dark:border-white/10 dark:from-indigo-500/5 dark:to-transparent">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
              <FileText className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Resume Preview</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Candidate&apos;s submitted resume document</p>
            </div>
          </div>
          {resumeHref && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg" onClick={() => window.open(resumeHref, "_blank")}>
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </Button>
              <Button size="sm" className="h-8 gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600" asChild>
                <a href={resumeHref} download>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
            </div>
          )}
        </div>
        <div className="bg-gray-100 p-0 dark:bg-gray-950/40">
          {resumeHref ? (
            <iframe
              src={resumeHref}
              className="h-[720px] w-full rounded-b-2xl border-0"
              title="Resume preview"
            />
          ) : (
            <div className="py-16 text-center text-gray-400">
              <FileText className="mx-auto mb-3 h-12 w-12 opacity-40" />
              <p className="text-base font-medium">No resume uploaded</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Fit score + Candidate details */}
      <div className="space-y-4">
        {/* Overall Fit Score card */}
        <div className={cn("overflow-hidden rounded-2xl border bg-gradient-to-br p-5", fitTheme.bg)}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Overall Fit Score</p>
          <p className={cn("mt-1 text-4xl font-bold leading-none", fitTheme.text)}>
            {fitPct !== null ? `${fitPct}` : "—"}
            <span className="ml-0.5 text-xl">%</span>
          </p>
          <p className={cn("mt-1 text-sm font-semibold", fitTheme.text)}>{fitTheme.label}</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/60 ring-1 ring-gray-200/50">
            <div className={cn("h-full rounded-full transition-all", fitTheme.bar)} style={{ width: `${fitPct ?? 0}%` }} />
          </div>
          {fitSummary && (
            <p className="mt-3 text-xs leading-relaxed text-gray-700 dark:text-gray-200">
              {fitSummary}
            </p>
          )}
        </div>

        {/* Candidate Details card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900/40">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Candidate Details</p>
          <dl className="mt-3 space-y-2.5 text-sm">
            <DetailRow label="Applied for" value={job?.title ?? "—"} />
            <DetailRow
              label="Experience required"
              value={
                job?.experience_min != null && job?.experience_max != null
                  ? `${job.experience_min}-${job.experience_max} years`
                  : "—"
              }
            />
            <DetailRow label="Location" value={candidate.location || "—"} />
            <DetailRow label="Email" value={candidate.email} />
            {candidate.phone && <DetailRow label="Phone" value={candidate.phone} />}
            <DetailRow label="Stage" value={candidate.candidate_stage || "—"} />
          </dl>
          {resumeHref && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full gap-1.5 rounded-lg"
              onClick={() => window.open(resumeHref, "_blank")}
            >
              <Eye className="h-3.5 w-3.5" /> View resume PDF
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="max-w-[60%] text-right font-semibold text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}

// ── Activity Tab (Timeline + Session Summary + Face Frames) ─────────────────

function ActivityTab({
  candidate,
  job,
  session,
  screenshots,
  violations,
  fitPct,
  evaluationStatus,
  timezone,
}: {
  candidate: EvaluationData["candidate"];
  job: EvaluationData["job"];
  session: EvaluationData["session"];
  screenshots: EvaluationData["screenshots"];
  violations: EvaluationData["violations"];
  fitPct: number | null;
  evaluationStatus: string | null;
  timezone: string;
}) {
  const formatTs = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
      timeZone: timezone,
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Build timeline events from the available data
  const timeline: { icon: React.ReactNode; title: string; detail: string; timestamp: string | null }[] = [];

  if (candidate.interview_date || session?.started_at) {
    timeline.push({
      icon: <User className="h-3.5 w-3.5" />,
      title: "Application received",
      detail: `Applied for ${job?.title ?? "role"}`,
      timestamp: candidate.interview_date ?? session?.started_at ?? null,
    });
  }
  if (candidate.interview_date) {
    timeline.push({
      icon: <Calendar className="h-3.5 w-3.5" />,
      title: "Interview scheduled",
      detail: "AI round scheduled with candidate",
      timestamp: candidate.interview_date,
    });
  }
  if (session?.started_at) {
    timeline.push({
      icon: <Video className="h-3.5 w-3.5" />,
      title: "AI interview started",
      detail: "Interview session began",
      timestamp: session.started_at,
    });
  }
  if (session?.completed_at) {
    timeline.push({
      icon: <CheckCircle className="h-3.5 w-3.5" />,
      title: "AI interview completed",
      detail: `Status: ${session.status}`,
      timestamp: session.completed_at,
    });
  }
  if (fitPct !== null) {
    timeline.push({
      icon: <FileText className="h-3.5 w-3.5" />,
      title: "Resume screened",
      detail: `${fitPct}% fit score calculated`,
      timestamp: null,
    });
  }
  if (evaluationStatus) {
    timeline.push({
      icon: <Star className="h-3.5 w-3.5" />,
      title: "Evaluation generated",
      detail: evaluationStatus,
      timestamp: session?.completed_at ?? null,
    });
  }

  const frameFormat = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const singleFaceCount = screenshots.filter((s) => s.face_count === null || s.face_count === undefined || s.face_count === 1).length;

  return (
    <div className="space-y-5">
      {/* Timeline + Session Summary row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Activity Timeline */}
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900/40 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white px-5 py-3 dark:border-white/10 dark:from-indigo-500/5 dark:to-transparent">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
                <Clock className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Activity Timeline</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">All events from application through evaluation</p>
              </div>
            </div>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              {timeline.length} events
            </span>
          </div>
          <div className="p-5">
            {timeline.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No activity recorded yet.</div>
            ) : (
              <ol className="relative space-y-5">
                {timeline.map((evt, idx) => {
                  const isLast = idx === timeline.length - 1;
                  return (
                    <li key={idx} className="relative flex gap-3">
                      {/* Connector line — drawn from the center of this icon down to the next icon */}
                      {!isLast && (
                        <span
                          aria-hidden
                          className="absolute left-[17px] top-9 h-[calc(100%-12px)] w-px bg-emerald-400/70 dark:bg-emerald-500/50"
                        />
                      )}
                      {/* Solid green icon node */}
                      <span className="relative z-10 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-4 ring-emerald-50 dark:ring-emerald-500/10">
                        {evt.icon}
                      </span>
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{evt.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{evt.detail}</p>
                        {evt.timestamp && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                            <Clock className="h-3 w-3" />
                            {formatTs(evt.timestamp)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {/* Session Summary */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900/40">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Session Summary</p>
          <dl className="mt-3 space-y-2.5 text-sm">
            <DetailRow label="Status" value={session?.status ?? "—"} />
            <DetailRow
              label="Violations"
              value={violations.length > 0 ? String(violations.length) : "0"}
            />
            <DetailRow label="Frames captured" value={String(screenshots.length)} />
            <DetailRow label="Started" value={formatTs(session?.started_at ?? null)} />
            <DetailRow label="Completed" value={formatTs(session?.completed_at ?? null)} />
          </dl>
        </div>
      </div>

      {/* Face Detection Frames (Single Face only — simplified) */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900/40">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white px-5 py-3 dark:border-white/10 dark:from-indigo-500/5 dark:to-transparent">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20">
              <UserCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Face Detection Frames</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Proctoring snapshots captured during the interview</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            {screenshots.length} total
          </span>
        </div>

        <div className="p-5">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10">
            <User className="h-3 w-3" />
            Single Face
            <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              {singleFaceCount}
            </span>
          </div>

          {screenshots.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <ImageIcon className="mx-auto mb-3 h-12 w-12 opacity-40" />
              <p className="text-base font-medium">No frames captured</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {screenshots.map((ss, idx) => (
                <div
                  key={idx}
                  className="group relative aspect-video overflow-hidden rounded-xl border border-gray-200 bg-gray-100 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5"
                >
                  <img
                    src={`${API_STATIC}${ss.file_path}`}
                    alt={`Frame ${idx + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {ss.face_count ?? 1} Face
                  </span>
                  {ss.captured_at && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-center text-[10px] text-white">
                      {frameFormat(ss.captured_at)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Coding Tab ──────────────────────────────────────────────────────────────

function CodingTab({
  submissions,
  codingScore,
}: {
  submissions: CodingSubmission[];
  codingScore: number | null;
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (submissions.length === 0) {
    return (
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-10 text-center text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">No coding submissions</p>
          <p className="text-sm mt-1">
            The candidate did not submit any code during this interview.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalPassed = submissions.reduce((s, x) => s + x.test_cases_passed, 0);
  const totalTests = submissions.reduce((s, x) => s + x.test_cases_total, 0);
  const overallPct = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
  const current = submissions[activeIdx] ?? submissions[0];

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                Coding Score
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {codingScore != null ? `${Math.round(codingScore)}%` : "—"}
              </p>
            </div>
            <div className="h-10 w-px bg-gray-200" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                Submissions
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{submissions.length}</p>
            </div>
            <div className="h-10 w-px bg-gray-200" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                Tests Passed
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {totalPassed}/{totalTests}{" "}
                <span className="text-base text-gray-500">({overallPct}%)</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submission picker */}
      {submissions.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {submissions.map((s, i) => {
            const passed = s.test_cases_total > 0
              ? Math.round((s.test_cases_passed / s.test_cases_total) * 100)
              : 0;
            const isActive = i === activeIdx;
            return (
              <button
                key={s.id}
                onClick={() => setActiveIdx(i)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  isActive
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                }`}
              >
                #{i + 1} · {s.title || s.language} · {passed}%
              </button>
            );
          })}
        </div>
      )}

      {/* Current submission detail */}
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {current.title || "Coding Challenge"}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  {current.language}
                </Badge>
                {current.difficulty && (
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      current.difficulty === "easy"
                        ? "bg-green-100 text-green-700"
                        : current.difficulty === "hard"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {current.difficulty}
                  </Badge>
                )}
                <Badge
                  variant="secondary"
                  className={`text-xs ${
                    current.test_cases_passed === current.test_cases_total
                      ? "bg-green-100 text-green-700"
                      : current.test_cases_passed > 0
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {current.test_cases_passed}/{current.test_cases_total} tests passed
                </Badge>
                {current.execution_time_ms != null && (
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {current.execution_time_ms} ms
                  </Badge>
                )}
                {current.submitted_at && (
                  <span className="text-xs text-gray-500">
                    Submitted {new Date(current.submitted_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {current.description && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
                Problem
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {current.description}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Candidate&apos;s Code
            </p>
            <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto leading-relaxed">
              <code>{current.code}</code>
            </pre>
          </div>

          {current.test_results.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
                Test Results
              </p>
              <div className="space-y-2">
                {current.test_results.map((tr, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 ${
                      tr.passed
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {tr.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium text-gray-800">
                          Test {i + 1}
                          {tr.description ? ` — ${tr.description}` : ""}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          tr.passed
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {tr.passed ? "Passed" : "Failed"}
                      </Badge>
                    </div>
                    {!tr.passed && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs">
                        <div>
                          <p className="text-gray-500 font-semibold mb-1">Input</p>
                          <pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto">
                            {tr.input || "(empty)"}
                          </pre>
                        </div>
                        <div>
                          <p className="text-gray-500 font-semibold mb-1">Expected</p>
                          <pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto">
                            {tr.expected_output || "(empty)"}
                          </pre>
                        </div>
                        <div>
                          <p className="text-gray-500 font-semibold mb-1">Got</p>
                          <pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto">
                            {tr.actual_output || "(empty)"}
                          </pre>
                        </div>
                      </div>
                    )}
                    {tr.stderr && (
                      <div className="mt-2 text-xs">
                        <p className="text-gray-500 font-semibold mb-1">Stderr</p>
                        <pre className="bg-white border border-red-200 rounded p-2 overflow-x-auto text-red-700">
                          {tr.stderr}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── StatCard ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tagline,
  icon,
  iconWrap,
  topBar,
}: {
  label: string;
  value: string;
  tagline: string;
  icon: React.ReactNode;
  iconWrap: string;
  topBar: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-gray-900/40">
      <div className={cn("absolute inset-x-0 top-0 h-1", topBar)} />
      <div className="flex items-start justify-between">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1", iconWrap)}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{tagline}</p>
    </div>
  );
}
