"use client";

/**
 * Observer-side state for the live observer feature.
 *
 * Pulls candidate / job info via REST, and live transcript + status via SSE.
 * Video is delivered separately by useObserverFrameReceiver as JPEG frames
 * over WebSocket.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

export interface ObserverMessage {
  id?: number;
  role: "ai" | "candidate";
  content: string;
  question_index?: number | null;
  created_at?: string | null;
}

export interface ObserverState {
  session_id: number;
  status: string;
  current_question_index: number;
  total_questions: number;
  violation_count: number;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface CodingSubmissionPayload {
  question_index?: number | null;
  title?: string | null;
  description?: string | null;
  difficulty?: string | null;
  language?: string | null;
  code?: string | null;
  test_cases_total?: number | null;
  test_cases_passed?: number | null;
  submitted_at?: string | null;
}

export interface ObserverInfo {
  candidate: { name: string; role?: string | null; interview_status?: string | null };
  job: { title: string; id: number };
  session: ObserverState | null;
  room_name: string;
  publisher_present: boolean;
  frame_publisher_present: boolean;
  ice_servers: RTCIceServer[];
  interview_mode: "avatar" | "manual" | "default";
  code_editor_required: boolean;
  latest_coding_submission: CodingSubmissionPayload | null;
}

export type ConnectionPhase =
  | "loading"
  | "waiting_for_candidate"
  | "connecting_video"
  | "live"
  | "candidate_completed"
  | "revoked"
  | "error";

interface Result {
  info: ObserverInfo | null;
  state: ObserverState | null;
  messages: ObserverMessage[];
  aiSpeaking: boolean;
  phase: ConnectionPhase;
  errorMessage: string | null;
  latestCoding: CodingSubmissionPayload | null;
}

function estimateSpeakingMs(text: string): number {
  // Rough cap: ~14 chars/sec for English-y TTS. Floor at 1.2s, ceiling at 25s.
  const ms = Math.min(25000, Math.max(1200, Math.round(text.length * 70)));
  return ms;
}

export function useObserverSubscriber(token: string | null): Result {
  const [info, setInfo] = useState<ObserverInfo | null>(null);
  const [state, setState] = useState<ObserverState | null>(null);
  const [messages, setMessages] = useState<ObserverMessage[]>([]);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [phase, setPhase] = useState<ConnectionPhase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestCoding, setLatestCoding] = useState<CodingSubmissionPayload | null>(null);

  const aiSpeakingTimerRef = useRef<number | null>(null);
  const messageIdsRef = useRef<Set<number>>(new Set());

  // ── 1. Resolve token ────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/observe/${encodeURIComponent(token)}`);
        if (aborted) return;
        if (res.status === 404) {
          setPhase("error");
          setErrorMessage("This observer link does not exist.");
          return;
        }
        if (res.status === 410) {
          setPhase("revoked");
          setErrorMessage("This observer link has been revoked or has expired.");
          return;
        }
        if (!res.ok) {
          setPhase("error");
          setErrorMessage(`Server error (${res.status}). Please retry.`);
          return;
        }
        const data: ObserverInfo = await res.json();
        setInfo(data);
        setState(data.session);
        if (data.latest_coding_submission) setLatestCoding(data.latest_coding_submission);
        if (!data.session) {
          setPhase("waiting_for_candidate");
        } else if (data.session.status === "completed" || data.session.status === "terminated") {
          setPhase("candidate_completed");
        } else {
          // The frame receiver hook tracks live-video state separately; here
          // we only need to know the candidate has an active session.
          setPhase(data.frame_publisher_present ? "live" : "waiting_for_candidate");
        }
      } catch (err) {
        if (aborted) return;
        setPhase("error");
        setErrorMessage("Could not reach the server.");
      }
    })();
    return () => { aborted = true; };
  }, [token]);

  // ── 2. SSE transcript stream ────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const url = `${API_BASE}/observe/${encodeURIComponent(token)}/stream`;
    const es = new EventSource(url);

    const onSnapshot = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.state) setState(data.state);
        if (Array.isArray(data.messages)) {
          messageIdsRef.current = new Set(
            data.messages.map((m: ObserverMessage) => m.id).filter(Boolean) as number[],
          );
          setMessages(data.messages);
        }
      } catch {}
    };

    const onMessage = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        const msg: ObserverMessage = data.message;
        if (!msg) return;
        if (msg.id != null) {
          if (messageIdsRef.current.has(msg.id)) return;
          messageIdsRef.current.add(msg.id);
        }
        setMessages((prev) => [...prev, msg]);
        if (msg.role === "ai" && typeof msg.content === "string") {
          setAiSpeaking(true);
          if (aiSpeakingTimerRef.current) window.clearTimeout(aiSpeakingTimerRef.current);
          aiSpeakingTimerRef.current = window.setTimeout(() => setAiSpeaking(false), estimateSpeakingMs(msg.content));
        } else if (msg.role === "candidate") {
          // Candidate spoke → AI is no longer speaking.
          if (aiSpeakingTimerRef.current) window.clearTimeout(aiSpeakingTimerRef.current);
          setAiSpeaking(false);
        }
      } catch {}
    };

    const onState = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.state) {
          setState(data.state);
          if (data.state.status === "completed" || data.state.status === "terminated") {
            setPhase("candidate_completed");
          }
        }
      } catch {}
    };

    const onSessionReady = (_ev: MessageEvent) => {
      // The candidate has just started — re-resolve token to refresh
      // publisher_present + session, then the SSE backend will drop the
      // current connection and we'll reconnect to pick up the live snapshot.
      // Just close & rely on EventSource auto-reconnect.
      es.close();
    };

    const onWaiting = () => {
      // No-op — the resolve effect already set the phase.
    };

    const onRevoked = () => {
      setPhase("revoked");
      setErrorMessage("This observer link has been revoked.");
      es.close();
    };

    const onCoding = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.coding) setLatestCoding(data.coding as CodingSubmissionPayload);
      } catch {}
    };

    es.addEventListener("snapshot", onSnapshot);
    es.addEventListener("message", onMessage);
    es.addEventListener("state", onState);
    es.addEventListener("session_ready", onSessionReady);
    es.addEventListener("waiting", onWaiting);
    es.addEventListener("revoked", onRevoked);
    es.addEventListener("coding_submission", onCoding);
    es.onerror = () => {
      // EventSource auto-reconnects. If we're still in waiting state, that's
      // fine; the loop continues server-side.
    };

    return () => {
      try { es.close(); } catch {}
      if (aiSpeakingTimerRef.current) {
        window.clearTimeout(aiSpeakingTimerRef.current);
        aiSpeakingTimerRef.current = null;
      }
    };
  }, [token]);

  return useMemo(() => ({
    info,
    state,
    messages,
    aiSpeaking,
    phase,
    errorMessage,
    latestCoding,
  }), [info, state, messages, aiSpeaking, phase, errorMessage, latestCoding]);
}
