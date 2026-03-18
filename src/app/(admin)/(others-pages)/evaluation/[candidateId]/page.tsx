"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  CheckCircle,
  ExternalLink,
  FileText,
  MessageSquare,
  Mic,
  Shield,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Video,
  XCircle,
} from "lucide-react";
import VideoPlayer from "@/components/evaluation/VideoPlayer";
import { api, API_BASE } from "@/lib/api";

const API_STATIC = API_BASE.replace(/\/api$/, "");

interface TranscriptPair {
  question: string;
  answer: string;
  index: number;
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
  };
  resume: { path: string | null; url: string | null };
  fit_score: {
    level: string | null;
    reasoning: {
      summary?: string;
      fit_percentage?: number;
      percentage?: number;
      key_matching_skills?: string[];
      missing_skills?: string[];
      relevant_experience_summary?: string;
      missing_weak_areas?: string[];
      breakdown?: Record<string, { score: number; weight: number; contribution: number } | string>;
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
  evaluation: {
    recommendation: string | null;
    summary: string | null;
    strengths: string[];
    weaknesses: string[];
    detailed_feedback: string | null;
    meets_threshold: boolean;
  } | null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({ label, value, icon }: { label: string; value: number | null; icon?: React.ReactNode }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1 text-gray-600 font-medium">{icon} {label}</span>
        <span className="font-semibold text-gray-800">{value != null ? value.toFixed(1) : "N/A"}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        {pct != null && (
          <div
            className={`h-full rounded-full ${pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-400"}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

const FIT_CFG = {
  high:   { ring: "text-green-600",  track: "bg-green-100",  stroke: "#22c55e", label: "High Fit",   badge: "bg-green-100 text-green-700 border-green-300" },
  medium: { ring: "text-yellow-600", track: "bg-yellow-100", stroke: "#facc15", label: "Medium Fit", badge: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  low:    { ring: "text-red-600",    track: "bg-red-100",    stroke: "#ef4444", label: "Low Fit",    badge: "bg-red-100 text-red-700 border-red-300" },
};

function FitScoreCard({ level, percentage }: { level: string | null; percentage: number | null }) {
  const cfg = FIT_CFG[level as keyof typeof FIT_CFG] ?? null;
  if (!cfg) return (
    <div className="flex flex-col items-center justify-center w-24 h-24 border border-dashed border-gray-300 rounded-xl bg-gray-50">
      <span className="text-gray-400 text-xs text-center">Fit score<br />pending</span>
    </div>
  );
  const pct = percentage ?? 0;
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative w-20 h-20 rounded-full ${cfg.track} flex items-center justify-center`}>
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={cfg.stroke} strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round" />
        </svg>
        <span className={`relative text-xl font-bold ${cfg.ring}`}>{pct}%</span>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
    </div>
  );
}

const REC_BADGE: Record<string, string> = {
  "Strong Hire": "bg-green-100 text-green-700 border-green-300",
  "Hire":        "bg-blue-100 text-blue-700 border-blue-300",
  "Maybe":       "bg-yellow-100 text-yellow-700 border-yellow-300",
  "No Hire":     "bg-red-100 text-red-700 border-red-300",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EvaluationPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const router = useRouter();
  const { candidateId } = React.use(params);
  const [data, setData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetch_ = async () => {
      setLoading(true);
      try {
        setData(await api<EvaluationData>(`/candidates/${candidateId}/evaluation`));
      } catch (err: any) { setError(err.message); }
      finally { setLoading(false); }
    };
    fetch_();
  }, [candidateId]);

  if (loading) return (
    <div className="space-y-4 p-6 max-w-5xl mx-auto">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
  );

  if (error || !data) return (
    <div className="p-6 text-center text-red-500">
      <p>Failed to load evaluation: {error}</p>
      <Button variant="outline" onClick={() => router.back()} className="mt-4">Go Back</Button>
    </div>
  );

  const { candidate, resume, fit_score, scores, recording, transcript, evaluation } = data;

  const interviewDateStr = candidate.interview_date
    ? (() => {
        const tzMap: Record<string, string> = {
          "Asia/Calcutta": "Asia/Kolkata", "Asia/Kolkata": "Asia/Kolkata", IST: "Asia/Kolkata",
        };
        const tz = candidate.interview_timezone;
        const ianaZone = tz ? tzMap[tz] || tz : undefined;
        return new Date(candidate.interview_date).toLocaleString("en-US", {
          weekday: "short", year: "numeric", month: "short",
          day: "numeric", hour: "2-digit", minute: "2-digit",
          timeZone: ianaZone,
        }) + (tz ? ` (${tz})` : "");
      })()
    : null;

  const recordingHref = recording.link?.startsWith("/")
    ? `${API_STATIC}${recording.link}`
    : recording.link ?? undefined;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{candidate.name}</h1>
            <p className="text-gray-500 text-sm">
              {candidate.role || "—"} · {candidate.email} · {candidate.phone || "—"}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">{candidate.candidate_stage || "Candidates"}</Badge>
              <Badge variant="outline">{candidate.interview_status || "New"}</Badge>
              {evaluation?.recommendation && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${REC_BADGE[evaluation.recommendation] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}>
                  {evaluation.recommendation}
                </span>
              )}
            </div>
          </div>
          <FitScoreCard level={fit_score.level} percentage={(fit_score.reasoning as any)?.fit_percentage ?? (fit_score.reasoning as any)?.percentage ?? null} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Resume */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-red-500" /> Resume
            </h2>
            {resume.url ? (
              <a href={`${API_STATIC}${resume.url}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:underline text-sm">
                <ExternalLink className="w-4 h-4" /> View / Download Resume
              </a>
            ) : <p className="text-sm text-gray-400">No resume uploaded</p>}
          </div>

          {/* Fit Score Analysis */}
          <div className="border border-gray-200 rounded-lg p-5 space-y-5">
            <h2 className="font-semibold text-gray-800">Resume–JD Match Analysis</h2>
            {fit_score.level ? (() => {
              const r = fit_score.reasoning;
              const pct = r?.fit_percentage ?? r?.percentage ?? null;
              const barColor = pct != null ? pct >= 75 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-500" : "bg-gray-300";
              const pctColor = pct != null ? pct >= 75 ? "text-green-700" : pct >= 40 ? "text-yellow-700" : "text-red-700" : "text-gray-400";
              return (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">Match Percentage</span>
                      <span className={`text-2xl font-extrabold ${pctColor}`}>{pct != null ? `${pct}%` : "—"}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct ?? 0}%` }} />
                    </div>
                    {r?.summary && <p className="text-xs text-gray-500 pt-0.5">{r.summary}</p>}
                  </div>
                  {r?.key_matching_skills && r.key_matching_skills.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Key Matching Skills</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {r.key_matching_skills.map((s, i) => (
                          <Badge key={i} variant="outline" className="bg-green-50 text-green-700 border-green-200">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {r?.relevant_experience_summary && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Relevant Experience</h3>
                      <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">{r.relevant_experience_summary}</p>
                    </div>
                  )}
                  {((r?.missing_skills && r.missing_skills.length > 0) || (r?.missing_weak_areas && r.missing_weak_areas.length > 0)) && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Missing / Weak Areas</h3>
                      <ul className="space-y-1">
                        {(r.missing_skills ?? r.missing_weak_areas ?? []).map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-red-600">
                            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r?.breakdown && Object.keys(r.breakdown).length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Detailed Breakdown</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(r.breakdown).map(([k, v]) => {
                          if (!v) return null;
                          const isObj = typeof v === "object" && v !== null;
                          const score = isObj ? (v as { score: number }).score : null;
                          const label = k.replace(/_/g, " ");
                          return (
                            <div key={k} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</p>
                              {score !== null ? (
                                <div className="flex items-center gap-2">
                                  <Progress value={score} className="h-2 flex-1" />
                                  <span className="text-sm font-semibold text-gray-700">{score}%</span>
                                </div>
                              ) : (
                                <p className="text-sm text-gray-700">{String(v)}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <p className="text-sm text-gray-400">Fit score analysis not yet computed.</p>
            )}
          </div>

          {/* Interview Scores */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" /> Interview Scores
            </h2>
            {interviewDateStr && (
              <p className="text-sm text-gray-600 mb-4">
                Conducted: <span className="font-medium">{interviewDateStr}</span>
              </p>
            )}
            {candidate.interview_status === "Completed" ? (
              <div className="space-y-3">
                <ScoreBar label="Overall Score"   value={scores.overall}       icon={<Star className="w-4 h-4 text-yellow-500" />} />
                <ScoreBar label="Confidence"      value={scores.confidence}    icon={<Shield className="w-4 h-4 text-blue-500" />} />
                <ScoreBar label="Clarity"         value={scores.clarity}       icon={<Star className="w-4 h-4 text-indigo-500" />} />
                <ScoreBar label="Grammar"         value={scores.grammar}       icon={<FileText className="w-4 h-4 text-green-500" />} />
                <ScoreBar label="Enthusiasm"      value={scores.enthusiasm}    icon={<Star className="w-4 h-4 text-orange-500" />} />
                <ScoreBar label="Pronunciation"   value={scores.pronunciation} icon={<Mic className="w-4 h-4 text-purple-500" />} />
                <ScoreBar label="Conciseness"     value={scores.conciseness}   icon={<FileText className="w-4 h-4 text-pink-500" />} />
                <ScoreBar label="Trust Score"     value={scores.trust}         icon={<Shield className="w-4 h-4 text-teal-500" />} />
              </div>
            ) : (
              <p className="text-sm text-gray-400">Scores will appear here after the interview is completed.</p>
            )}
          </div>

          {/* AI Evaluation Summary */}
          {evaluation && (
            <div className="border border-gray-200 rounded-lg p-5 space-y-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" /> AI Evaluation
              </h2>

              {evaluation.summary && (
                <p className="text-sm text-gray-700 leading-relaxed bg-blue-50 rounded-lg p-3 border border-blue-100">
                  {evaluation.summary}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {evaluation.strengths.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <ThumbsUp className="w-3.5 h-3.5 text-green-500" /> Strengths
                    </h3>
                    <ul className="space-y-1">
                      {evaluation.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {evaluation.weaknesses.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <ThumbsDown className="w-3.5 h-3.5 text-red-500" /> Areas to Improve
                    </h3>
                    <ul className="space-y-1">
                      {evaluation.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {evaluation.detailed_feedback && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Detailed Feedback</h3>
                  <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {evaluation.detailed_feedback}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Q&A Transcript */}
          {transcript && transcript.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-5 space-y-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-500" /> Interview Transcript
              </h2>
              <div className="space-y-5">
                {transcript.map((pair, idx) => (
                  <div key={pair.index} className="space-y-2">
                    {idx > 0 && <div className="border-t border-gray-100" />}
                    <div className="flex items-start gap-3 pt-1">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                        Q{pair.index}
                      </span>
                      <p className="text-sm font-medium text-gray-800 leading-snug">{pair.question}</p>
                    </div>
                    <div className="flex items-start gap-3 ml-9">
                      <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 w-full">
                        {pair.answer}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Recording */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Video className="w-5 h-5 text-blue-500" /> Recording
            </h2>
            {recordingHref ? (
              <div className="space-y-3">
                <VideoPlayer src={recordingHref} />
                {recording.duration && (
                  <p className="text-xs text-gray-500">Duration: {recording.duration}</p>
                )}
                <a href={recordingHref} target="_blank" rel="noreferrer"
                  className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Open in new tab
                </a>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No recording available yet</p>
            )}
          </div>

          {/* Quick Stats */}
          <div className="border border-gray-200 rounded-lg p-5 space-y-3">
            <h2 className="font-semibold text-gray-800">Quick Stats</h2>
            {[
              { label: "Overall Score",  val: scores.overall },
              { label: "Trust Score",    val: scores.trust },
              { label: "AI Cheating",    val: scores.ai_cheating },
              { label: "Grammar",        val: scores.grammar },
              { label: "Confidence",     val: scores.confidence },
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-500">{label}</span>
                <span className={`font-semibold ${val != null ? val >= 70 ? "text-green-700" : val >= 40 ? "text-yellow-700" : "text-red-600" : "text-gray-400"}`}>
                  {val != null ? val.toFixed(1) : "N/A"}
                </span>
              </div>
            ))}
          </div>

          {/* Recommendation card */}
          {evaluation?.recommendation && (
            <div className={`border rounded-lg p-4 text-center ${REC_BADGE[evaluation.recommendation] ?? "bg-gray-50 border-gray-200"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1">AI Recommendation</p>
              <p className="text-lg font-bold">{evaluation.recommendation}</p>
              {evaluation.meets_threshold ? (
                <p className="text-xs mt-1 opacity-75">Meets hiring threshold</p>
              ) : (
                <p className="text-xs mt-1 opacity-75">Below hiring threshold</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
