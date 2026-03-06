"use client";

import { useCallback, useRef, useState } from "react";
import { api, apiPost, apiUpload, ApiError } from "@/lib/api";

export interface PreInterviewField {
  field_id: string;
  label: string;
  type: string;
  is_default: boolean;
}

export interface Message {
  role: "ai" | "candidate";
  content: string;
  questionIndex?: number;
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
  max_questions: number;
  mode: string;
  virtual_avatar: boolean;
  webcam_required: boolean;
  face_match: boolean;
  resume_based: boolean;
  special_instructions?: string;
  skills: string[];
  pre_interview_fields: PreInterviewField[];
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

interface InterviewSessionHook {
  sessionId: number | null;
  candidateId: number | null;
  messages: Message[];
  questionStates: QuestionState[];
  isAiThinking: boolean;
  isInterviewComplete: boolean;
  isExistingUser: boolean;
  alreadyCompleted: boolean;
  canResume: boolean;
  sessionStatus: string | null;
  evaluation: EvaluationResult | null;
  jobConfig: JobConfig | null;
  error: string | null;
  loadJobConfig: (token: string) => Promise<JobConfig | null>;
  registerCandidate: (
    token: string,
    name: string,
    email: string,
    phone: string | undefined,
    resumePath: string,
    extraFields?: Record<string, string>
  ) => Promise<true | false | null>;
  loginCandidate: (token: string, email: string) => Promise<"ok" | "resume" | "completed" | "not_found" | "error">;
  resumeSession: () => Promise<boolean>;
  startInterview: () => Promise<void>;
  sendMessage: (text: string) => Promise<boolean>;
  skipQuestion: () => Promise<boolean>;
  completeInterview: (earlyTermination?: boolean, terminationReason?: string) => Promise<void>;
  uploadRecording: (blob: Blob, sessionId: number, duration: string) => Promise<void>;
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
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [jobConfig, setJobConfig] = useState<JobConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Guard: prevent double sendMessage calls while one is in-flight */
  const isSendingRef = useRef(false);
  /** Track consecutive frontend fallbacks to vary messages */
  const consecutiveFallbacksRef = useRef(0);

  const loadJobConfig = useCallback(async (token: string): Promise<JobConfig | null> => {
    try {
      const data = await api<JobConfig>(`/interview/${token}`);
      setJobConfig(data);
      return data;
    } catch (e: any) {
      setError(e instanceof ApiError ? e.detail : e.message);
      return null;
    }
  }, []);

  const registerCandidate = useCallback(
    async (
      token: string,
      name: string,
      email: string,
      phone: string | undefined,
      resumePath: string,
      extraFields?: Record<string, string>
    ): Promise<true | false | null> => {
      try {
        const data = await apiPost<any>(`/interview/${token}/register`, {
          name,
          email,
          phone,
          resume_path: resumePath,
          extra_fields: extraFields ?? null,
        });
        setSessionId(data.session_id);
        setCandidateId(data.candidate_id);
        setIsExistingUser(data.is_existing_user ?? false);
        setAlreadyCompleted(data.already_completed ?? false);
        setCanResume(data.can_resume ?? false);
        setSessionStatus(data.session_status ?? null);
        if (data.already_completed) return null;
        return true;
      } catch (e: any) {
        setError(e instanceof ApiError ? e.detail : e.message);
        return false;
      }
    },
    []
  );

  const loginCandidate = useCallback(
    async (token: string, email: string): Promise<"ok" | "resume" | "completed" | "not_found" | "error"> => {
      try {
        const data = await apiPost<any>(`/interview/${token}/login`, { email });
        setSessionId(data.session_id);
        setCandidateId(data.candidate_id);
        setIsExistingUser(true);
        setCanResume(data.can_resume ?? false);
        setSessionStatus(data.session_status ?? null);
        if (data.already_completed) {
          setAlreadyCompleted(true);
          return "completed";
        }
        return data.can_resume ? "resume" : "ok";
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 404) return "not_found";
        setError(e instanceof ApiError ? e.detail : e.message);
        return "error";
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
      if (isComplete) return;
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

  const startInterview = useCallback(async () => {
    if (!sessionId) return;
    setIsAiThinking(true);
    try {
      const data = await api<any>(`/interview/sessions/${sessionId}/start`, {
        method: "POST",
        timeout: 30_000,
      });
      const aiMsg: Message = { role: "ai", content: data.message, questionIndex: data.question_index };
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
        const data = await apiPost<any>(`/interview/sessions/${sessionId}/message`, { content: text }, { timeout: 30_000 });

        const aiMsg: Message = {
          role: "ai",
          content: data.message,
          questionIndex: data.question_index,
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
        // On timeout or error, add a varied fallback so the flow doesn't freeze
        const fallbackCount = consecutiveFallbacksRef.current;
        consecutiveFallbacksRef.current += 1;
        const fallbackMessages = [
          "I didn't catch that clearly. Could you please repeat your answer?",
          "There seems to be a brief audio delay. Let's continue — could you share more about your experience?",
          "Let me rephrase. Tell me about a recent project you've worked on and what your role was.",
          "Let's move on. Can you describe how you approach solving a technical problem you haven't seen before?",
          "I appreciate your patience. Let's try a different question — what technologies are you most comfortable working with?",
        ];
        const fallbackMsg: Message = {
          role: "ai",
          content: fallbackMessages[fallbackCount % fallbackMessages.length],
          questionIndex: messages.filter((m) => m.role === "ai").length > 0
            ? (messages.filter((m) => m.role === "ai").pop()?.questionIndex ?? 0)
            : 0,
        };
        setMessages((prev) => [...prev, fallbackMsg]);
        return false;
      } finally {
        setIsAiThinking(false);
        isSendingRef.current = false;
      }
    },
    [sessionId, updateQuestionStates, messages]
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

  const completeInterview = useCallback(async (earlyTermination: boolean = false, terminationReason?: string) => {
    if (!sessionId) return;
    setIsAiThinking(true);
    try {
      const params = new URLSearchParams();
      if (earlyTermination) params.set("early_termination", "true");
      if (terminationReason) params.set("termination_reason", terminationReason);
      const qs = params.toString();
      const path = `/interview/sessions/${sessionId}/complete${qs ? `?${qs}` : ""}`;

      const data = await api<EvaluationResult>(path, { method: "POST", timeout: 60_000 });
      setEvaluation(data);
      setIsInterviewComplete(true);
    } catch (e: any) {
      const isTimeout = e instanceof ApiError && e.status === 408;
      setError(isTimeout ? "Evaluation timed out" : (e instanceof ApiError ? e.detail : e.message));
    } finally {
      setIsAiThinking(false);
    }
  }, [sessionId]);

  const uploadRecording = useCallback(
    async (blob: Blob, sid: number, duration: string): Promise<void> => {
      try {
        const form = new FormData();
        form.append("file", blob, `interview_${sid}.webm`);
        form.append("duration", duration);
        await apiUpload(`/interview/sessions/${sid}/upload-recording`, form);
      } catch {
        // non-blocking — don't fail the flow if upload fails
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
    isExistingUser,
    alreadyCompleted,
    canResume,
    sessionStatus,
    evaluation,
    jobConfig,
    error,
    loadJobConfig,
    registerCandidate,
    loginCandidate,
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
