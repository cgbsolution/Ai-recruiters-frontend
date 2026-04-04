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
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  ImageIcon,
  Mail,
  MessageSquare,
  Mic,
  Monitor,
  Phone,
  Shield,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import VideoPlayer from "@/components/evaluation/VideoPlayer";
import { api, API_BASE } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";

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
        setData(await api<EvaluationData>(`/candidates/${candidateId}/evaluation`));
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

      // Convert all cross-origin images to inline base64 to avoid tainted canvas
      const images = element.querySelectorAll("img");
      const origSrcs: { el: HTMLImageElement; src: string }[] = [];
      await Promise.all(
        Array.from(images).map(async (img) => {
          try {
            if (!img.src || img.src.startsWith("data:")) return;
            origSrcs.push({ el: img, src: img.src });
            // Try fetching with credentials and CORS mode first, then fall
            // back to no-cors. This handles same-origin and cross-origin photos.
            let blob: Blob | null = null;
            try {
              const resp = await fetch(img.src, { credentials: "include" });
              blob = await resp.blob();
            } catch {
              try {
                const resp = await fetch(img.src, { mode: "no-cors" });
                blob = await resp.blob();
              } catch {
                // Give up
              }
            }
            if (blob && blob.size > 0) {
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob!);
              });
              img.src = dataUrl;
            } else {
              img.style.visibility = "hidden";
            }
          } catch {
            // If fetch fails, hide the image so it doesn't taint the canvas
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

  return (
    <div ref={contentRef} className="max-w-7xl mx-auto pb-12 min-w-0">

      {/* ══════════════════════════════════════════════════════════════════════
          CANDIDATE HEADER
         ══════════════════════════════════════════════════════════════════════ */}
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">{candidate.name}</h1>
              <p className="text-base font-semibold text-gray-700 mt-0.5">
                {candidate.role || job?.title || "—"}
              </p>

              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <p>{candidate.email}</p>
                {candidate.phone && <p>Phone: {candidate.phone}</p>}
                {interviewDateStr && <p>Interview Date: {interviewDateStr}</p>}
                {interviewEndStr && <p>Interview Ended: {interviewEndStr}</p>}
                {expRange && <p>Experience Range: {expRange}</p>}
                {durationStr && <p>Interview Duration: {durationStr}</p>}
              </div>

              {/* AI Cheating Score */}
              {cheatingDisplay && (
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-sm text-gray-700">
                    AI-Cheating Score: <strong>{cheatingDisplay}</strong>
                  </span>
                  {violations.length > 0 && !generatingPdf && (
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white"
                      onClick={() => setShowViolations(true)}
                    >
                      View Reasons
                    </Button>
                  )}
                </div>
              )}

              {recordingHref && (
                generatingPdf ? (
                  <p className="text-brand-500 text-sm mt-2 break-all">
                    Recording: {`${API_STATIC}${recording.link}`}
                  </p>
                ) : (
                  <button
                    onClick={copyRecordingUrl}
                    className="text-brand-500 hover:underline text-sm flex items-center gap-1 mt-2"
                  >
                    Copy recording URL
                  </button>
                )
              )}
            </div>

            {/* Candidate Photo */}
            <div className="shrink-0 flex items-start justify-center sm:justify-end">
              {candidate.image ? (
                <img
                  src={candidate.image.startsWith("/") ? `${API_STATIC}${candidate.image}` : candidate.image}
                  alt={candidate.name}
                  crossOrigin="anonymous"
                  className="w-36 h-44 object-cover rounded-lg border border-gray-200 shadow-sm"
                />
              ) : (
                <div className="w-36 h-44 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                  <User className="w-12 h-12 text-gray-300" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          TABS
         ══════════════════════════════════════════════════════════════════════ */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        {!generatingPdf && (
        <div className="border-b border-gray-200 overflow-x-auto flex items-center">
          <TabsList className="bg-transparent h-auto p-0 gap-0 rounded-none flex-1">
            {[
              { value: "evaluation", label: "Evaluation" },
              { value: "recording", label: "Recording" },
              { value: "transcript", label: "Interview Transcript" },
              { value: "face-detection", label: "Face Detection Frames" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-brand-500 data-[state=active]:text-brand-500 data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Download Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs mx-2 shrink-0">
                <Download className="w-3.5 h-3.5" />
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadPdf} disabled={generatingPdf}>
                <FileText className="w-4 h-4 mr-2" /> {generatingPdf ? "Generating PDF…" : "Download Evaluation Pdf"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`${API_BASE}/candidates/${candidateId}/evaluation/download-docx`, "_blank")}>
                <FileText className="w-4 h-4 mr-2" /> Download Evaluation as Docx
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`${API_BASE}/candidates/${candidateId}/evaluation/download-transcript`, "_blank")}>
                <MessageSquare className="w-4 h-4 mr-2" /> Download Interview Transcript
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        )}

        {/* ═══════════════════════ TAB: EVALUATION ═══════════════════════════ */}
        <TabsContent value="evaluation" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── LEFT: Questions and Evaluations ──────────────────────────── */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Questions and Evaluations</h2>

              {transcript.length > 0 ? transcript.map((pair) => {
                const pq = pqMap.get(pair.index);
                const isExpanded = expandedQA.has(pair.index);
                const answerText = pair.answer;
                const isSkipped = answerText === "[No answer provided — skipped]";
                const showToggle = !isSkipped && answerText.length > 250;
                const displayAnswer = isExpanded ? answerText : showToggle ? answerText.slice(0, 250) + "..." : answerText;

                return (
                  <Card key={pair.index} className="border border-gray-200">
                    <CardContent className="p-5 space-y-3">
                      <p className="font-bold text-gray-800">Question {pair.index}:</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{pair.question}</p>

                      <div>
                        <p className="text-sm font-semibold text-gray-700">Candidate&apos;s Answer:</p>
                        <p className={`text-sm leading-relaxed mt-1 ${isSkipped ? "italic text-gray-400" : "text-gray-600"}`}>
                          {displayAnswer}
                          {showToggle && (
                            <button onClick={() => toggleQA(pair.index)}
                              className="text-brand-500 hover:underline ml-1 font-medium">
                              {isExpanded ? "Show less" : "Read more"}
                            </button>
                          )}
                        </p>
                      </div>

                      {/* Per-question evaluation */}
                      {pq && (
                        <>
                          <div className="pt-2 border-t border-gray-100">
                            <p className="text-sm font-semibold text-gray-700">Score:</p>
                            <p className="text-sm text-gray-800">{pq.score}%</p>
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-gray-700">Evaluation</p>

                            {pq.positives.length > 0 && (
                              <div className="mt-1">
                                <p className="text-sm font-semibold text-gray-700">Positives</p>
                                <ul className="list-disc list-inside space-y-0.5 mt-1">
                                  {pq.positives.map((p, i) => (
                                    <li key={i} className="text-sm text-gray-600">{p}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {pq.negatives.length > 0 && (
                              <div className="mt-2">
                                <p className="text-sm font-semibold text-gray-700">Negatives</p>
                                <ul className="list-disc list-inside space-y-0.5 mt-1">
                                  {pq.negatives.map((n, i) => (
                                    <li key={i} className="text-sm text-gray-600">{n}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              }) : (
                <Card className="border border-gray-200">
                  <CardContent className="p-8 text-center text-gray-400">
                    <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No interview questions available yet.</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── RIGHT: Overall Summary ───────────────────────────────────── */}
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Overall Summary</h2>

              {/* Score + Summary */}
              <Card className="border border-gray-200">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-600">Score:</span>
                    <ScoreCircle value={scores.overall} />
                  </div>

                  {evaluation?.summary && (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-700 leading-relaxed">
                        <span className="font-bold">Interview Summary: </span>
                        {evaluation.summary}
                      </p>

                      {evaluation.strengths.length > 0 && (
                        <div>
                          <p className="text-sm font-bold text-gray-800">Strengths</p>
                          <ul className="list-disc list-inside space-y-1 mt-1">
                            {evaluation.strengths.map((s, i) => (
                              <li key={i} className="text-sm text-gray-700">
                                <strong>{s.split(":")[0]}{s.includes(":") ? ":" : ""}</strong>
                                {s.includes(":") ? s.split(":").slice(1).join(":") : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {evaluation.weaknesses.length > 0 && (
                        <div>
                          <p className="text-sm font-bold text-gray-800">Weaknesses</p>
                          <ul className="list-disc list-inside space-y-1 mt-1">
                            {evaluation.weaknesses.map((w, i) => (
                              <li key={i} className="text-sm text-gray-700">
                                <strong>{w.split(":")[0]}{w.includes(":") ? ":" : ""}</strong>
                                {w.includes(":") ? w.split(":").slice(1).join(":") : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {evaluation.detailed_feedback && (
                        <div className="pt-3 border-t border-gray-100">
                          <p className="text-sm text-gray-700 leading-relaxed">
                            <span className="font-bold">Overall Verdict: </span>
                            {evaluation.detailed_feedback}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {!evaluation && (
                    <div className="text-center py-6 space-y-4">
                      <div className="w-12 h-12 rounded-full bg-yellow-50 border border-yellow-100 flex items-center justify-center mx-auto">
                        <TrendingUp className="w-6 h-6 text-yellow-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {session?.status === "completed" || session?.status === "terminated"
                            ? "Evaluation report was not generated"
                            : "Evaluation will appear after the interview is completed."}
                        </p>
                        {(session?.status === "completed" || session?.status === "terminated") && (
                          <p className="text-xs text-gray-400 mt-1">
                            Click below to regenerate it. This may take 1–3 minutes.
                          </p>
                        )}
                      </div>
                      {session?.id && (session?.status === "completed" || session?.status === "terminated") && (
                        <Button
                          onClick={generateEvaluation}
                          disabled={generatingEval}
                          className="gap-2"
                        >
                          {generatingEval ? (
                            <>
                              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                              Generating… (up to 3 min)
                            </>
                          ) : (
                            <>
                              <TrendingUp className="w-4 h-4" />
                              Generate Evaluation Report
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Skills Rating */}
              {evaluation?.skills_ratings && evaluation.skills_ratings.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Skills Rating</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {evaluation.skills_ratings.map((sr, idx) => (
                      <Card key={idx} className="border border-gray-200">
                        <CardContent className="p-4 space-y-2">
                          <p className="text-sm font-bold text-gray-800">{sr.skill}</p>
                          <div className="flex items-center gap-0.5">
                            <span className="text-sm text-gray-600 mr-1">Rating:</span>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`w-4 h-4 ${i < sr.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                            ))}
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed">
                            <span className="font-semibold">Evaluation: </span>
                            {sr.evaluation}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════ TAB: RECORDING ═══════════════════════════ */}
        <TabsContent value="recording" className="mt-6">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              {recordingHref ? (
                <div className="space-y-4">
                  <div className="max-w-4xl mx-auto">
                    <VideoPlayer src={recordingHref} />
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={copyRecordingUrl} className="gap-1">
                        <Copy className="w-3.5 h-3.5" /> Copy Recording URL
                      </Button>
                      <a href={recordingHref} download target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm" className="gap-1">
                          <Download className="w-3.5 h-3.5" /> Download video
                        </Button>
                      </a>
                    </div>
                    {recording.duration && (
                      <p className="text-sm text-gray-500">Duration: {recording.duration}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center text-gray-400">
                  <Video className="w-16 h-16 mx-auto mb-3 opacity-40" />
                  <p className="text-lg font-medium">No recording available</p>
                  <p className="text-sm mt-1">The recording will appear here after the interview is completed.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════ TAB: TRANSCRIPT ═══════════════════════════ */}
        <TabsContent value="transcript" className="mt-6">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Interview Transcript</h2>

              {full_transcript.length > 0 ? (
                <div className="max-w-3xl mx-auto space-y-4">
                  {full_transcript.map((msg, idx) => {
                    const isAI = msg.role === "ai";
                    const time = msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                      : null;

                    return (
                      <div key={idx} className={`flex gap-3 ${isAI ? "justify-start" : "justify-end"}`}>
                        {isAI && (
                          <div className="shrink-0 w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-brand-500" />
                          </div>
                        )}
                        <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                          isAI
                            ? "bg-gray-100 text-gray-800 rounded-tl-sm"
                            : "bg-brand-500 text-white rounded-tr-sm"
                        }`}>
                          <p className="text-xs font-semibold mb-1 opacity-70">
                            {isAI ? "AI Interviewer" : "Candidate"}{time && ` · ${time}`}
                          </p>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                        {!isAI && (
                          <div className="shrink-0 w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-brand-600" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : transcript.length > 0 ? (
                <div className="max-w-3xl mx-auto space-y-4">
                  {transcript.map((pair) => (
                    <React.Fragment key={pair.index}>
                      <div className="flex gap-3 justify-start">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-brand-500" />
                        </div>
                        <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-gray-100 text-gray-800 px-4 py-3">
                          <p className="text-xs font-semibold mb-1 opacity-70">AI Interviewer · Q{pair.index}</p>
                          <p className="text-sm leading-relaxed">{pair.question}</p>
                        </div>
                      </div>
                      <div className="flex gap-3 justify-end">
                        <div className={`max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-3 ${
                          pair.answer === "[No answer provided — skipped]"
                            ? "bg-gray-200 text-gray-500"
                            : "bg-brand-500 text-white"
                        }`}>
                          <p className="text-xs font-semibold mb-1 opacity-70">Candidate</p>
                          <p className={`text-sm leading-relaxed ${pair.answer === "[No answer provided — skipped]" ? "italic" : ""}`}>{pair.answer}</p>
                        </div>
                        <div className="shrink-0 w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-brand-600" />
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center text-gray-400">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-lg font-medium">No transcript available</p>
                  <p className="text-sm mt-1">The transcript will appear here after the interview is completed.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════ TAB: FACE DETECTION ═════════════════════ */}
        <TabsContent value="face-detection" className="mt-6">
          <FaceDetectionTab screenshots={screenshots} timezone={tz} />
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

// ── Face Detection Tab ───────────────────────────────────────────────────────

function FaceDetectionTab({ screenshots, timezone }: { screenshots: { file_path: string; captured_at: string | null; face_count?: number | null }[]; timezone: string }) {
  const [subTab, setSubTab] = useState("single");

  // Classify screenshots by face_count from Python model
  const classified = useMemo(() => {
    const single: typeof screenshots = [];
    const multiple: typeof screenshots = [];
    const none: typeof screenshots = [];

    for (const ss of screenshots) {
      const fc = ss.face_count;
      if (fc === null || fc === undefined || fc === 1) {
        single.push(ss);
      } else if (fc === 0) {
        none.push(ss);
      } else {
        multiple.push(ss);
      }
    }
    return { single, multiple, none };
  }, [screenshots]);

  const formatTs = (captured_at: string | null) => {
    if (!captured_at) return "";
    return new Date(captured_at).toLocaleString("en-IN", {
      timeZone: timezone,
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: true,
    });
  };

  const renderGrid = (items: typeof screenshots, emptyMsg: string) => {
    if (items.length === 0) {
      return (
        <div className="py-16 text-center text-gray-400">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">{emptyMsg}</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((ss, idx) => (
          <div key={idx} className="relative bg-gray-100 rounded-lg border border-gray-200 overflow-hidden aspect-video">
            <img
              src={`${API_STATIC}${ss.file_path}`}
              alt={`Frame ${idx + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {ss.captured_at && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 text-center">
                {formatTs(ss.captured_at)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardContent className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Face Detection Frames</h2>

        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="single" className="text-xs sm:text-sm">
              Single Face Detected ({classified.single.length})
            </TabsTrigger>
            <TabsTrigger value="multiple" className="text-xs sm:text-sm">
              Multiple Faces ({classified.multiple.length})
            </TabsTrigger>
            <TabsTrigger value="none" className="text-xs sm:text-sm">
              No Face ({classified.none.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            {renderGrid(classified.single, "No single-face frames available")}
          </TabsContent>
          <TabsContent value="multiple">
            {renderGrid(classified.multiple, "No multiple face events detected")}
          </TabsContent>
          <TabsContent value="none">
            {renderGrid(classified.none, "No missing face events detected")}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
