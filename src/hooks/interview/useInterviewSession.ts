"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiPost, apiUpload, ApiError, getSessionToken, setSessionToken } from "@/lib/api";
import {
  updateMeta as updateRecordingMeta,
  deleteRecording as deleteStoredRecording,
  assembleBlob as assembleStoredRecording,
} from "@/lib/recordingStorage";
import { reportClientEvent } from "@/lib/clientTelemetry";

export interface CodingQuestion {
  title: string;
  description: string;
  test_cases: { input: string; expected_output: string; description: string }[];
  time_limit: number;
  difficulty: "easy" | "medium" | "hard";
}

export interface Message {
  role: "ai" | "candidate";
  /** For AI turns: the question (or closing line) alone. */
  content: string;
  /** AI turns only: Nira's reaction to the previous answer. Spoken first, then
   *  a short pause, then `content` — shown as its own chat bubble. */
  feedback?: string;
  questionIndex?: number;
  codingQuestion?: CodingQuestion;
  /** True for AI messages fabricated locally when the backend was unreachable.
   *  They reuse the current question index (never invent a new one) so the
   *  progress counter and per-question timer stay in sync with the server. */
  isLocalFallback?: boolean;
}

export interface QuestionState {
  index: number;
  status: "active" | "answered" | "skipped";
  aiMessage: string;
  candidateAnswer?: string;
}

export interface JobConfig {
  job_id: number;
  title: string;
  department: string;
  location: string;
  experience_level?: string;
  experience_min: number;
  experience_max: number;
  max_questions: number;              // verbal-only
  max_coding_questions?: number;      // coding turns appended after verbal
  mode: string;
  virtual_avatar: boolean;
  webcam_required: boolean;
  face_match: boolean;
  resume_based: boolean;
  code_editor_required: boolean;
  allow_mobile: boolean;
  secondary_cam: boolean;
  manual_interview: boolean;
  special_instructions?: string;
  auto_skip_timeout: number;
  skills: string[];
  organization_name?: string;
  manager_name?: string;
  manager_email?: string;
}

export interface EvaluationResult {
  id: number;
  session_id: number;
  candidate_id: number;
  technical_score?: number;
  communication_score?: number;
  problem_solving_score?: number;
  confidence_score?: number;
  overall_score?: number;
  recommendation?: string;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  detailed_feedback?: string;
  meets_threshold: boolean;
}

export interface MeetingSlot {
  id: number;
  start_time: string;
  end_time: string;
  is_booked: boolean;
}

export type EvaluationStatus = "idle" | "processing" | "completed" | "failed";

/** verify-access outcomes, plus "error" when the request itself failed
 *  (network / timeout / server error) — `message` then says what to do. */
export type AccessOutcome =
  | "granted"
  | "apply"
  | "completed"
  | "terminated"
  | "invite_required"
  | "invalid_invite"
  | "error";

interface InterviewSessionHook {
  sessionId: number | null;
  candidateId: number | null;
  messages: Message[];
  questionStates: QuestionState[];
  isAiThinking: boolean;
  isInterviewComplete: boolean;
  canResume: boolean;
  sessionStatus: string | null;
  evaluation: EvaluationResult | null;
  evaluationStatus: EvaluationStatus;
  jobConfig: JobConfig | null;
  error: string | null;
  retryEvaluation: () => Promise<void>;
  loadJobConfig: (token: string) => Promise<{ config: JobConfig } | { error: string }>;
  /** Personal invite link → `{ invite }`; email form / legacy ?candidate= link → `{ email }`. */
  verifyAccess: (token: string, credentials: { invite?: string; email?: string }) => Promise<{
    access: AccessOutcome;
    candidateName?: string;
    canResume: boolean;
    message: string;
    interviewDate?: string;
    interviewTimezone?: string;
    joiningFlexibility?: string;
    allowJoiningEarly?: boolean;
  }>;
  applyForJob: (token: string, name: string, email: string, phone: string | undefined, resumePath: string) => Promise<{ success: boolean; message: string }>;
  resumeSession: () => Promise<boolean>;
  startInterview: (language?: string) => Promise<void>;
  sendMessage: (text: string) => Promise<boolean>;
  skipQuestion: () => Promise<boolean>;
  completeInterview: (earlyTermination?: boolean, terminationReason?: string) => Promise<void>;
  uploadRecording: (
    blob: Blob,
    sessionId: number,
    duration: string,
    recordingId?: string,
  ) => Promise<boolean>;
  loadMeetingSlots: () => Promise<MeetingSlot[]>;
  scheduleMeeting: (slotId: number) => Promise<boolean>;
}

export function useInterviewSession(): InterviewSessionHook {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isInterviewComplete, setIsInterviewComplete] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus>("idle");
  const [jobConfig, setJobConfig] = useState<JobConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Guard: prevent double sendMessage calls while one is in-flight */
  const isSendingRef = useRef(false);
  /** Track consecutive frontend fallbacks to vary messages */
  const consecutiveFallbacksRef = useRef(0);
  /** Ref to latest messages for use in callbacks without stale closures */
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Stop background loops (evaluation polling) once the hook unmounts */
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);
  /** Guard: only one evaluation poll loop at a time (retry could stack a second) */
  const isPollingRef = useRef(false);

  const loadJobConfig = useCallback(async (token: string): Promise<{ config: JobConfig } | { error: string }> => {
    // Retry once on timeout/network errors — mobile networks are flaky
    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Interview] Loading job config (attempt ${attempt}/${MAX_RETRIES}) for token: ${token.slice(0, 8)}...`);
        const data = await api<JobConfig>(`/interview/${token}`, { timeout: 45_000 }); // 45s for slow mobile
        console.log("[Interview] Job config loaded successfully:", data.title);
        setJobConfig(data);
        return { config: data };
      } catch (e: any) {
        const status = e instanceof ApiError ? e.status : 0;
        const msg = e instanceof ApiError ? e.detail : e.message;
        console.error(`[Interview] loadJobConfig attempt ${attempt} failed:`, { status, message: msg, error: e });

        // Only retry on timeout (408) or network errors (status 0) — not on 404/410/500
        if (attempt < MAX_RETRIES && (status === 408 || status === 0)) {
          console.log("[Interview] Retrying after network/timeout error...");
          await new Promise((r) => setTimeout(r, 2000)); // wait 2s before retry
          continue;
        }

        setError(msg);
        return { error: msg };
      }
    }
    // Should never reach here, but satisfy TypeScript
    return { error: "Unknown error" };
  }, []);

  const verifyAccess = useCallback(
    async (token: string, credentials: { invite?: string; email?: string }) => {
      // Send exactly one credential: the invite wins when the link carries one.
      const body = credentials.invite ? { invite: credentials.invite } : { email: credentials.email };
      // Never log the invite secret itself.
      const via = credentials.invite ? "personal invite link" : credentials.email;
      try {
        console.log(`[Interview] Verifying access via: ${via}, token: ${token.slice(0, 8)}...`);
        const data = await apiPost<any>(`/interview/${token}/verify-access`, body, { timeout: 45_000 });
        console.log("[Interview] Access result:", { access: data.access, canResume: data.can_resume, sessionId: data.session_id, message: data.message });
        if (data.session_id) setSessionId(data.session_id);
        if (data.candidate_id) setCandidateId(data.candidate_id);
        if (data.session_token) setSessionToken(data.session_token);
        setCanResume(data.can_resume ?? false);
        setSessionStatus(data.session_status ?? null);
        return {
          access: data.access as AccessOutcome,
          candidateName: data.candidate_name ?? undefined,
          canResume: data.can_resume ?? false,
          message: data.message ?? "",
          interviewDate: data.interview_date ?? undefined,
          interviewTimezone: data.interview_timezone ?? undefined,
          joiningFlexibility: data.joining_flexibility ?? undefined,
          allowJoiningEarly: data.allow_joining_early ?? undefined,
        };
      } catch (e: any) {
        const status = e instanceof ApiError ? e.status : 0;
        const msg = e instanceof ApiError ? e.detail : e.message;
        console.error("[Interview] verifyAccess failed:", { status, message: msg, via, error: e });
        setError(msg);
        // "error", not "apply": a failed request says nothing about whether the
        // candidate was invited, so callers show a retryable message instead.
        const message =
          status === 0
            ? "Network error — please check your internet connection and try again."
            : typeof msg === "string" && msg
              ? msg
              : "Verification failed. Please try again.";
        return { access: "error" as const, canResume: false, message };
      }
    },
    []
  );

  const applyForJob = useCallback(
    async (token: string, name: string, email: string, phone: string | undefined, resumePath: string) => {
      try {
        const data = await apiPost<any>(`/interview/${token}/apply`, {
          name,
          email,
          phone,
          resume_path: resumePath,
        });
        return { success: data.success, message: data.message };
      } catch (e: any) {
        return { success: false, message: e instanceof ApiError ? e.detail : (e.message || "Application failed") };
      }
    },
    []
  );

  const resumeSession = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;
    try {
      const data = await api<any>(`/interview/sessions/${sessionId}/resume`);
      // Restore messages
      const restored: Message[] = data.messages.map((m: any) => ({
        role: m.role as "ai" | "candidate",
        content: m.content,
        feedback: m.feedback || undefined,
        questionIndex: m.question_index,
      }));
      setMessages(restored);
      // Restore question states from messages
      const qStates: QuestionState[] = [];
      for (const m of restored) {
        if (m.role === "ai" && m.questionIndex !== undefined) {
          const existing = qStates.find((q) => q.index === m.questionIndex);
          if (!existing) {
            qStates.push({ index: m.questionIndex, status: "active", aiMessage: m.content });
          }
        } else if (m.role === "candidate") {
          const active = qStates.find((q) => q.status === "active");
          if (active) {
            active.candidateAnswer = m.content;
            active.status = "answered";
          }
        }
      }
      // The last AI question should be active
      const lastAi = qStates[qStates.length - 1];
      if (lastAi && lastAi.status === "answered") {
        // All answered — next question will come from startInterview or sendMessage
      } else if (lastAi) {
        lastAi.status = "active";
      }
      setQuestionStates(qStates);
      return true;
    } catch (e: any) {
      setError(e instanceof ApiError ? e.detail : e.message);
      return false;
    }
  }, [sessionId]);

  const updateQuestionStates = useCallback(
    (aiMessage: string, questionIndex: number, isComplete: boolean) => {
      if (isComplete) {
        // Interview ended — mark ALL remaining active questions as answered
        // so the question counter reflects the true completed count
        setQuestionStates((prev) =>
          prev.map((q) =>
            q.status === "active" ? { ...q, status: "answered" as const } : q
          )
        );
        return;
      }
      setQuestionStates((prev) => {
        const existing = prev.find((q) => q.index === questionIndex);
        if (!existing) {
          // Mark any previous active questions as answered (AI moved on)
          const updated = prev.map((q) =>
            q.status === "active" ? { ...q, status: "answered" as const } : q
          );
          return [...updated, { index: questionIndex, status: "active" as const, aiMessage }];
        }
        // Follow-up on same index — update message, keep status active
        return prev.map((q) =>
          q.index === questionIndex ? { ...q, aiMessage, status: "active" as const } : q
        );
      });
    },
    []
  );

  const startInterview = useCallback(async (language?: string) => {
    if (!sessionId) return;
    setIsAiThinking(true);
    try {
      const langParam = language ? `?language=${language}` : "";
      const data = await api<any>(`/interview/sessions/${sessionId}/start${langParam}`, {
        method: "POST",
        timeout: 60_000,
      });
      const aiMsg: Message = { role: "ai", content: data.message, feedback: data.feedback || undefined, questionIndex: data.question_index, codingQuestion: data.coding_question || undefined };
      setMessages([aiMsg]);
      updateQuestionStates(data.message, data.question_index, data.is_complete);
      if (data.is_complete) setIsInterviewComplete(true);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 408) {
        setError("Interview start timed out — please refresh and try again");
      } else {
        setError(e instanceof ApiError ? e.detail : e.message);
      }
    } finally {
      setIsAiThinking(false);
    }
  }, [sessionId, updateQuestionStates]);

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      if (!sessionId || !text.trim()) return false;

      // Prevent double-send — if a message is already in-flight, reject
      if (isSendingRef.current) {
        console.warn("[sendMessage] Already sending — ignoring duplicate call");
        return false;
      }
      isSendingRef.current = true;

      // Mark current active question with the candidate's answer
      setQuestionStates((prev) =>
        prev.map((q) =>
          q.status === "active" ? { ...q, candidateAnswer: text } : q
        )
      );

      const candidateMsg: Message = { role: "candidate", content: text };
      setMessages((prev) => [...prev, candidateMsg]);
      setIsAiThinking(true);

      try {
        // One retry (2 attempts). The backend now self-bounds each turn to ~35s
        // and returns a bridge question instead of hanging, so the first attempt
        // almost always succeeds; a second covers a transient network blip.
        // (Previously 3×45s = up to ~135s before the candidate saw any response.)
        // turn_id makes the retry idempotent: if the first request actually
        // completed server-side, the retry replays the SAME stored response
        // instead of running a duplicate AI turn.
        const turnId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let data: any;
        let lastErr: any;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            data = await apiPost<any>(`/interview/sessions/${sessionId}/message`, { content: text, turn_id: turnId }, { timeout: 45_000 });
            lastErr = null;
            break;
          } catch (retryErr) {
            lastErr = retryErr;
            if (attempt < 1) {
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
        }
        if (lastErr) throw lastErr;

        const aiMsg: Message = {
          role: "ai",
          content: data.message,
          feedback: data.feedback || undefined,
          questionIndex: data.question_index,
          codingQuestion: data.coding_question || undefined,
        };
        setMessages((prev) => [...prev, aiMsg]);
        updateQuestionStates(data.message, data.question_index, data.is_complete);
        // Reset fallback counter on successful response
        consecutiveFallbacksRef.current = 0;

        if (data.is_complete) {
          setIsInterviewComplete(true);
        }
        return data.is_complete;
      } catch (e: any) {
        const isTimeout = e instanceof ApiError && e.status === 408;
        setError(isTimeout ? "Response timed out — please try again" : (e instanceof ApiError ? e.detail : e.message));
        // On timeout or error, add a contextual fallback so the flow doesn't freeze
        const fallbackCount = consecutiveFallbacksRef.current;
        consecutiveFallbacksRef.current += 1;
        const lastAiQi = messagesRef.current.filter((m) => m.role === "ai").pop()?.questionIndex ?? 0;

        // First timeout: ask to repeat. Second+: acknowledge and ask a concrete
        // bridge question locally so the candidate sees text instead of being
        // stuck on the thinking indicator while the provider is degraded.
        // NOTE: local fallbacks always REUSE the current question index. The
        // previous +1 invented an index the backend never issued, desyncing the
        // progress counter / per-question timer / max-question guard from the
        // server (the next real reply then collided with or skipped an index).
        let fallbackContent: string;
        const fallbackQuestionIndex = lastAiQi;
        if (fallbackCount === 0) {
          fallbackContent = "I didn't catch that clearly. Could you please repeat your answer?";
        } else {
          const roleContext = jobConfig?.title || "this role";
          fallbackContent =
            `Thank you for your answer. Let's continue: can you walk me through ` +
            `a recent responsibility or project related to ${roleContext}, and what outcome you achieved?`;
        }
        const fallbackMsg: Message = {
          role: "ai",
          content: fallbackContent,
          questionIndex: fallbackQuestionIndex,
          isLocalFallback: true,
        };
        setMessages((prev) => [...prev, fallbackMsg]);
        updateQuestionStates(fallbackContent, fallbackQuestionIndex, false);
        return false;
      } finally {
        setIsAiThinking(false);
        isSendingRef.current = false;
      }
    },
    [sessionId, updateQuestionStates, jobConfig?.title]
  );

  const skipQuestion = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;

    // Mark current active question as skipped
    setQuestionStates((prev) =>
      prev.map((q) =>
        q.status === "active" ? { ...q, status: "skipped" as const } : q
      )
    );

    // Send skip signal to backend — AI will handle it gracefully
    return sendMessage("[SKIP] The candidate has chosen to skip this question.");
  }, [sessionId, sendMessage]);

  const _pollForEvaluation = useCallback(async (sid: number) => {
    // One loop at a time (retryEvaluation could otherwise stack a second),
    // and stop dead once the component unmounts — no orphaned polling.
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      await _pollForEvaluationInner(sid);
    } finally {
      isPollingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const _pollForEvaluationInner = useCallback(async (sid: number) => {
    setEvaluationStatus("processing");
    const MAX_POLLS = 100; // 100 × 4s = ~6.7 minutes — matches backend TOTAL_TIMEOUT
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      if (unmountedRef.current) return;
      try {
        // Cheap status probe — never 404s, so the browser console stays clean
        // and we find out about backend failure within one poll cycle.
        const status = await api<{ state: string; error?: string | null }>(
          `/interview/sessions/${sid}/evaluation-status`,
        );
        if (status.state === "done") {
          const evalData = await api<EvaluationResult>(`/interview/sessions/${sid}/evaluation`);
          setEvaluation(evalData);
          setEvaluationStatus("completed");
          setIsAiThinking(false);
          return;
        }
        if (status.state === "failed") {
          setEvaluationStatus("failed");
          setIsAiThinking(false);
          return;
        }
        // "processing" or "idle" — keep polling
      } catch {
        // Network blip — try again next tick
      }
    }
    // Timed out — evaluation still not available
    setEvaluationStatus("failed");
    setIsAiThinking(false);
  }, []);

  const completeInterview = useCallback(async (earlyTermination: boolean = false, terminationReason?: string) => {
    if (!sessionId) return;
    setIsAiThinking(true);
    setIsInterviewComplete(true);
    try {
      const params = new URLSearchParams();
      if (earlyTermination) params.set("early_termination", "true");
      if (terminationReason) params.set("termination_reason", terminationReason);
      const qs = params.toString();
      const path = `/interview/sessions/${sessionId}/complete${qs ? `?${qs}` : ""}`;

      // Backend returns 202 immediately and runs evaluation in background
      await api(path, { method: "POST" });

      // Poll until evaluation is ready
      await _pollForEvaluation(sessionId);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.detail : e.message);
      setEvaluationStatus("failed");
      setIsAiThinking(false);
    }
  }, [sessionId, _pollForEvaluation]);

  const retryEvaluation = useCallback(async () => {
    if (!sessionId) return;
    setIsAiThinking(true);
    setEvaluationStatus("processing");
    try {
      // Re-trigger the background evaluation task
      await api(`/interview/sessions/${sessionId}/complete`, { method: "POST" });
    } catch {
      // 400 if already completed is fine — evaluation will still re-run
    }
    await _pollForEvaluation(sessionId);
  }, [sessionId, _pollForEvaluation]);

  const uploadRecording = useCallback(
    async (
      blob: Blob,
      sid: number,
      duration: string,
      recordingId?: string,
    ): Promise<boolean> => {
      // Much higher retry ceiling — the server-side save is idempotent per
      // session id, so repeating is safe. We never give up silently; we keep
      // chunks in IndexedDB (via recordingId) so recovery can continue later.
      const MAX_ATTEMPTS = 6;
      const blobSizeMB = (blob.size / (1024 * 1024)).toFixed(1);
      console.log(
        `[uploadRecording] Starting upload for session ${sid} — ${blobSizeMB} MB, duration: ${duration}, recordingId=${recordingId ?? "(none)"}`,
      );

      if (recordingId) {
        // Keep the session token with the chunks: if every attempt below fails,
        // orphan recovery needs it to authenticate the upload on a later load.
        const st = getSessionToken();
        await updateRecordingMeta(recordingId, {
          sessionId: sid,
          duration,
          ...(st ? { sessionToken: st } : {}),
        });
      }

      // Refuse to confirm success for an empty blob — the server might accept
      // zero bytes but that's a silent data loss. Surface it.
      if (!blob || blob.size === 0) {
        console.error(`[uploadRecording] Blob is empty for session ${sid}. Refusing to upload.`);
        reportClientEvent({
          type: "recording_empty",
          message: `Recorder produced a 0-byte blob for session ${sid}`,
          context: { sessionId: sid, recordingId },
        });
        return false;
      }

      // Prevent accidental tab close during upload
      const preventClose = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue =
          "Your interview recording is still uploading. Leaving now may lose your recording.";
      };
      window.addEventListener("beforeunload", preventClose);

      try {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          // On retries after the first failure, prefer re-assembling from
          // IndexedDB — the in-memory blob reference may have been garbage
          // collected if we're inside a recovery flow.
          let body = blob;
          if (attempt > 0 && recordingId) {
            const reassembled = await assembleStoredRecording(recordingId);
            if (reassembled && reassembled.size > 0) body = reassembled;
          }

          try {
            console.log(
              `[uploadRecording] Attempt ${attempt + 1}/${MAX_ATTEMPTS} for session ${sid}`,
            );
            const form = new FormData();
            form.append("file", body, `interview_${sid}.webm`);
            form.append("duration", duration);
            if (recordingId) form.append("recording_id", recordingId);
            await apiUpload(`/interview/sessions/${sid}/upload-recording`, form, {
              timeout: 3600_000, // 1 hour — recordings can be very large
            });
            console.log(
              `[uploadRecording] SUCCESS for session ${sid} on attempt ${attempt + 1}`,
            );
            if (recordingId) {
              await updateRecordingMeta(recordingId, { uploaded: true });
              // Only purge local chunks once the server has confirmed a save.
              await deleteStoredRecording(recordingId);
            }
            return true;
          } catch (err: unknown) {
            const errMsg =
              err instanceof ApiError
                ? `HTTP ${err.status}: ${err.detail}`
                : (err as Error)?.message || "Unknown error";
            console.error(
              `[uploadRecording] Attempt ${attempt + 1} FAILED for session ${sid}: ${errMsg}`,
            );
            // Beacon the actual failure reason (HTTP 413/timeout/network/etc.)
            // so the cause of a missing recording is visible server-side.
            reportClientEvent({
              type: "recording_upload_attempt_failed",
              message: `session ${sid} attempt ${attempt + 1}/${MAX_ATTEMPTS}: ${errMsg}`,
              context: {
                sessionId: sid,
                recordingId,
                attempt: attempt + 1,
                status: err instanceof ApiError ? err.status : undefined,
              },
            });
            if (attempt < MAX_ATTEMPTS - 1) {
              // Exponential backoff capped at 60s: 3s, 6s, 12s, 24s, 48s.
              const delay = Math.min(3000 * Math.pow(2, attempt), 60_000);
              console.log(`[uploadRecording] Retrying in ${delay}ms...`);
              await new Promise((r) => setTimeout(r, delay));
            }
          }
        }

        // All retries failed. The chunks are still safe in IndexedDB; the
        // orphan-recovery hook will re-attempt on the next app load.
        console.error(
          `[uploadRecording] All ${MAX_ATTEMPTS} attempts failed for session ${sid}. ` +
            `Recording preserved in IndexedDB under recordingId=${recordingId ?? "(none)"} — ` +
            `will auto-retry on next app load.`,
        );
        return false;
      } finally {
        window.removeEventListener("beforeunload", preventClose);
      }
    },
    []
  );

  const loadMeetingSlots = useCallback(async (): Promise<MeetingSlot[]> => {
    if (!sessionId) return [];
    try {
      return await api<MeetingSlot[]>(`/interview/sessions/${sessionId}/slots`);
    } catch {
      return [];
    }
  }, [sessionId]);

  const scheduleMeeting = useCallback(
    async (slotId: number): Promise<boolean> => {
      if (!sessionId) return false;
      try {
        await apiPost(`/interview/sessions/${sessionId}/schedule-meeting`, { slot_id: slotId });
        return true;
      } catch {
        return false;
      }
    },
    [sessionId]
  );

  return {
    sessionId,
    candidateId,
    messages,
    questionStates,
    isAiThinking,
    isInterviewComplete,
    canResume,
    sessionStatus,
    evaluation,
    evaluationStatus,
    jobConfig,
    error,
    retryEvaluation,
    loadJobConfig,
    verifyAccess,
    applyForJob,
    resumeSession,
    startInterview,
    sendMessage,
    skipQuestion,
    completeInterview,
    uploadRecording,
    loadMeetingSlots,
    scheduleMeeting,
  };
}
