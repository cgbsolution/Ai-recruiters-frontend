"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PhoneOff, Mic, MicOff, GripVertical, SkipForward, Monitor, Square, Send, Trash2, Pencil, Check, X } from "lucide-react";
import dynamic from "next/dynamic";
import AvatarScene from "./AvatarScene";
import VoiceVisualizer, { type VoiceMode } from "./VoiceVisualizer";
import TranscriptPanel from "./TranscriptPanel";
import ViolationModal from "./ViolationModal";
import { useDeepgramSTT } from "@/hooks/interview/useDeepgramSTT";
import { useFrameStreamer } from "@/hooks/interview/useFrameStreamer";
import { playStartRecording, playStopRecording, playSendResponse, playDelete, playEndCall } from "@/lib/sounds";
import { useGoogleTTS } from "@/hooks/interview/useGoogleTTS";
import { useViolationDetection } from "@/hooks/interview/useViolationDetection";
import { useScreenCapture } from "@/hooks/interview/useScreenCapture";
import { useSecondaryCamMonitor } from "@/hooks/interview/useSecondaryCamMonitor";
import SecondCamReconnectModal from "./SecondCamReconnectModal";
import type { Message, JobConfig, QuestionState, CodingQuestion } from "@/hooks/interview/useInterviewSession";
import { API_BASE } from "@/lib/api";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useMemoryWatchdog } from "@/hooks/interview/useMemoryWatchdog";
import { useGlobalErrorGuard } from "@/hooks/useGlobalErrorGuard";
import { reportClientEvent } from "@/lib/clientTelemetry";

const CodeEditor = dynamic(() => import("./CodeEditor"), { ssr: false });

/* ─────────────────────── Types & Constants ─────────────────────── */

type InterviewPhase = "IDLE" | "SPEAKING" | "LISTENING" | "PROCESSING";

interface Props {
  sessionId: number;
  interviewToken?: string;
  jobConfig: JobConfig;
  messages: Message[];
  questionStates: QuestionState[];
  isThinking: boolean;
  isInterviewComplete: boolean;
  onSendMessage: (text: string) => Promise<boolean>;
  onSkipQuestion: () => Promise<boolean>;
  onComplete: () => void;
  onScreenStreamChanged?: (stream: MediaStream) => void;
  webcamStream: MediaStream | null;
  screenStream: MediaStream | null;
  interviewLanguage?: string;
}

const VIOLATION_THRESHOLD = 5;

/**
 * Silence timeout: how long to wait AFTER the last final transcript
 * before auto-submitting. Only counts silence after confirmed speech.
 *
 * Scales continuously with transcript length so candidates can give
 * long answers (5–10+ minutes) without being cut off during natural
 * thinking pauses. Every 100 chars spoken adds 1 second of patience.
 * Capped at MAX to avoid infinite waiting.
 */
const SILENCE_TIMEOUT_BASE_MS = 5000;
const SILENCE_TIMEOUT_MAX_MS = 15000;
const SILENCE_TIMEOUT_SCALE_PER_CHAR = 10;  // +1s per 100 chars
const INTRO_SILENCE_TIMEOUT_MS = 8000;

/** Delay after TTS finishes before starting STT — prevents echo pickup */
const POST_SPEECH_DELAY_MS = 1200;

/** If PROCESSING phase lasts longer than this, force-recover */
const PROCESSING_TIMEOUT_MS = 45000;

/** Hard ceiling for the SPEAKING phase. TTS questions are short (well under a
 *  minute); if we're still "speaking" after this, the audio almost certainly
 *  hung (silent decode / blocked autoplay) and onended never fired — recover
 *  instead of freezing on "Nira speaking". Generous so it never cuts real speech. */
const SPEAKING_TIMEOUT_MS = 90000;

/** Minimum characters of FINAL transcript required before auto-submit */
const MIN_SUBMIT_LENGTH = 3;

const END_COMMANDS = [
  "close interview", "end interview", "stop interview",
  "exit interview", "finish interview",
  "close my interview", "end my interview",
  "close the interview", "close this interview",
  "end this interview", "stop this interview",
  "end the interview", "finish the interview",
  "i want to end", "i want to stop", "i need to end",
  "please end", "please stop", "please close",
  "want to leave", "need to leave", "want to quit",
  "terminate interview", "cancel interview",
  "end up", "need to end up",
  "close this call", "end this call", "end call",
];

const COMPLETION_PHRASES = [
  "that's my answer", "that is my answer",
  "i'm done", "i am done",
  "that is all", "that's all",
  "i have completed", "i've completed",
  "done with my answer", "finished answering",
];

const SKIP_PHRASES = [
  "skip this question", "next question",
  "i want to skip", "skip question",
  "move to next", "pass this question",
];

function isEndCommand(text: string): boolean {
  const lower = text.toLowerCase();
  return END_COMMANDS.some((cmd) => lower.includes(cmd));
}

function isCompletionPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return COMPLETION_PHRASES.some((phrase) => lower.includes(phrase));
}

function isSkipCommand(text: string): boolean {
  const lower = text.toLowerCase();
  return SKIP_PHRASES.some((phrase) => lower.includes(phrase));
}

/* ─────────────────────── Component ─────────────────────── */

export default function InterviewRoom({
  sessionId,
  interviewToken,
  jobConfig,
  messages,
  questionStates,
  isThinking,
  isInterviewComplete,
  onSendMessage,
  onSkipQuestion,
  onComplete,
  onScreenStreamChanged,
  webcamStream,
  screenStream,
  interviewLanguage = "en",
}: Props) {
  /* ── Core Phase State ── */
  const [phase, setPhase] = useState<InterviewPhase>("IDLE");
  const phaseRef = useRef<InterviewPhase>("IDLE");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* ── UI State ── */
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showScreenShareModal, setShowScreenShareModal] = useState(false);
  const [silenceProgress, setSilenceProgress] = useState(0);

  /* ── Manual voice interaction state ── */
  type VoiceState = "idle" | "connecting" | "recording" | "answered";
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Captured transcript preserved through "answered" state and into submit
  const [capturedTranscript, setCapturedTranscript] = useState("");

  /* ── Per-question auto-skip timer state ── */
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number>(0);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSkipTimeout = jobConfig.auto_skip_timeout || 0; // seconds, 0 = off

  /* ── Transcript Correction State ── */
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState("");
  const [correctionApplied, setCorrectionApplied] = useState(false);

  /* ── Coding Mode State ── */
  const [activeCodingQuestion, setActiveCodingQuestion] = useState<CodingQuestion | null>(null);
  const [showCodeEditor, setShowCodeEditor] = useState(false);

  /* ── Refs ── */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpokenIndexRef = useRef(-1);
  const transcriptRef = useRef("");
  const finalTranscriptRef = useRef("");
  const capturedTranscriptRef = useRef(""); // mirrors capturedTranscript state for use in callbacks
  const silenceAnimRef = useRef<number | null>(null);
  const processingStartRef = useRef<number | null>(null);
  const isSubmittingRef = useRef(false);
  const isAutoCompletingRef = useRef(false);
  // Refs for callbacks needed inside animation-frame callbacks (avoids stale closures)
  const handleSubmitRef = useRef<() => void>(() => {});
  const handleSkipRef = useRef<() => void>(() => {});
  const cancelSilenceAnimRef = useRef<() => void>(() => {});
  const messagesRef = useRef(messages);

  /* ── Draggable PIP ── */
  const [pipPos, setPipPos] = useState({ x: 16, y: 16 });
  const pipDragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false, offsetX: 0, offsetY: 0,
  });

  /* ── Hooks ── */
  const { transcript, interimTranscript, isListening, isSupported, lastFinalAt, micStream, start, stop, reset, getSnapshot } = useDeepgramSTT(interviewLanguage);
  const { speak, cancel, isSpeaking, isLipSyncing, audioElement } = useGoogleTTS(interviewLanguage);
  const { violationCount, lastViolation, shouldTerminate, disable: disableViolations, lastFaceCountRef, reportViolation } = useViolationDetection(sessionId, true, webcamStream, jobConfig.face_match);
  useScreenCapture(sessionId, webcamStream, !isInterviewComplete, lastFaceCountRef);
  const secondaryCam = useSecondaryCamMonitor(sessionId, !!jobConfig.secondary_cam);

  // Catch async errors React's ErrorBoundary can't see, and flag abnormal
  // teardown (the fingerprint of a tab crash) for telemetry.
  useGlobalErrorGuard({ duringInterview: true });

  // Watch the JS heap so we can shed load BEFORE Chrome force-kills the tab.
  const { pressure } = useMemoryWatchdog();

  // Live observer stream — broadcasts low-fps JPEG frames of the candidate's
  // webcam to anyone holding a valid observer link. Goes through the backend
  // (no NAT traversal, works on any network). Read-only, send-only, fail-soft.
  //
  // This feed is the most expendable continuous workload, so it's the first to
  // be shed under memory pressure: throttle fps/quality when elevated, and stop
  // it entirely when critical. The interview itself is never degraded.
  useFrameStreamer({
    sessionId,
    interviewToken: interviewToken ?? null,
    webcamStream,
    enabled: !isInterviewComplete && pressure !== "critical",
    fps: pressure === "elevated" ? 2 : 4,
    maxWidth: pressure === "elevated" ? 360 : 480,
    quality: pressure === "elevated" ? 0.45 : 0.6,
  });

  // Record once when we begin shedding load, so a "near-miss" is visible in
  // telemetry even if the tab ultimately survives.
  const shedReportedRef = useRef(false);
  useEffect(() => {
    if (pressure === "normal") {
      shedReportedRef.current = false;
      return;
    }
    if (!shedReportedRef.current) {
      shedReportedRef.current = true;
      reportClientEvent({
        type: "load_shed",
        message: `observer stream throttled (pressure=${pressure})`,
        context: { pressure },
      });
    }
  }, [pressure]);

  /* ── Keep transcriptRef in sync on every render ── */
  // transcript from Deepgram hook already includes interim, so don't add interimTranscript again
  transcriptRef.current = transcript.trim();
  // finalTranscriptRef = transcript WITHOUT interim (for silence detection)
  // When interimTranscript is set, strip it from the end of transcript to get finals-only
  finalTranscriptRef.current = interimTranscript
    ? transcript.replace(new RegExp(interimTranscript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*$"), "").trim()
    : transcript.trim();

  /* ── Keep capturedTranscriptRef in sync ── */
  useEffect(() => {
    capturedTranscriptRef.current = capturedTranscript;
  }, [capturedTranscript]);

  /* ── Keep messagesRef in sync ── */
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /* ── Timer ── */
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  /* ── Tab close / navigation away: mark session as dropped ── */
  useEffect(() => {
    if (!sessionId) return;
    const handleBeforeUnload = () => {
      if (isInterviewComplete) return;
      const url = `${API_BASE}/interview/sessions/${sessionId}/drop`;
      navigator.sendBeacon(url);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sessionId, isInterviewComplete]);

  /* ── Current question index from latest AI message ── */
  const currentQuestionIndex = (() => {
    const aiMsgs = messages.filter((m) => m.role === "ai");
    if (aiMsgs.length === 0) return 0;
    return aiMsgs[aiMsgs.length - 1].questionIndex ?? 0;
  })();

  /* ── Answered/skipped question count from questionStates (robust frontend tracking) ── */
  const completedQuestionCount = questionStates.filter(
    (q) => q.index > 0 && (q.status === "answered" || q.status === "skipped")
  ).length;

  /* ── Cancel silence animation helper ── */
  const cancelSilenceAnim = useCallback(() => {
    setSilenceProgress(0);
    if (silenceAnimRef.current) {
      cancelAnimationFrame(silenceAnimRef.current);
      silenceAnimRef.current = null;
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  SUBMIT HANDLER — single entry point for answer submission     */
  /*  Uses isSubmittingRef to prevent any possibility of double-send*/
  /* ═══════════════════════════════════════════════════════════════ */

  const handleSubmit = useCallback(async () => {
    // Lock FIRST to prevent any race condition
    if (isSubmittingRef.current) return;
    if (phaseRef.current !== "LISTENING") return;
    isSubmittingRef.current = true;

    // Use capturedTranscript if already stopped, otherwise get a live snapshot from the ref
    const text = (
      capturedTranscriptRef.current ||
      getSnapshot()
    ).trim();
    if (!text || text.length < MIN_SUBMIT_LENGTH) {
      isSubmittingRef.current = false;
      return;
    }
    setPhase("PROCESSING");
    processingStartRef.current = Date.now();

    // Stop recognition AFTER capturing text — order matters
    stop();
    cancel();
    cancelSilenceAnim();

    // Keep capturedTranscript visible during PROCESSING so chat doesn't blank
    setCapturedTranscript(text);
    capturedTranscriptRef.current = text;

    try {
      // Check for end commands
      if (isEndCommand(text)) {
        isAutoCompletingRef.current = true; // prevent Effect 4b from double-calling
        disableViolations();
        onComplete();
        return;
      }

      // Check for skip commands
      if (isSkipCommand(text)) {
        await onSkipQuestion();
        return;
      }

      // Normal answer submission
      await onSendMessage(text);
    } finally {
      isSubmittingRef.current = false;
      // Reset transcript state AFTER successful submission
      reset();
    }
  }, [stop, cancel, reset, cancelSilenceAnim, getSnapshot, onSendMessage, onSkipQuestion, onComplete, disableViolations]);

  /* ─── Skip button handler ── */
  const handleSkip = useCallback(async () => {
    if (phaseRef.current !== "LISTENING") return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setPhase("PROCESSING");
    processingStartRef.current = Date.now();
    stop();
    cancel();
    reset();
    cancelSilenceAnim();
    try {
      await onSkipQuestion();
    } finally {
      isSubmittingRef.current = false;
    }
  }, [stop, cancel, reset, cancelSilenceAnim, onSkipQuestion]);

  // Sync callback refs — used by silence detection effect to avoid stale closures
  handleSubmitRef.current = handleSubmit;
  handleSkipRef.current = handleSkip;
  cancelSilenceAnimRef.current = cancelSilenceAnim;

  /* ── Manual voice control handlers ── */
  const handleStartSpeaking = useCallback(() => {
    reset();
    setRecordingDuration(0);
    setVoiceState("connecting");
    start();
    setTimeout(() => {
      setVoiceState((prev) => {
        if (prev === "connecting") {
          playStartRecording();
          return "recording";
        }
        return prev;
      });
    }, 800);
  }, [reset, start]);

  const handleStopSpeaking = useCallback(() => {
    playStopRecording();
    const captured = stop();
    capturedTranscriptRef.current = captured;
    setCapturedTranscript(captured);
    setVoiceState("answered");
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, [stop]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 1: Speak new AI messages → enter SPEAKING phase        */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const aiMsgs = messages.filter((m) => m.role === "ai");
    const latestIdx = aiMsgs.length - 1;
    if (latestIdx > lastSpokenIndexRef.current && aiMsgs[latestIdx]) {
      lastSpokenIndexRef.current = latestIdx;
      stop(); // Ensure STT is off
      cancelSilenceAnim();
      processingStartRef.current = null;
      setPhase("SPEAKING");
      speak(aiMsgs[latestIdx].content);

      // Coding-question handoff (only when the editor feature is enabled).
      // Three cases:
      //   1. No coding question in the new AI message → clear any prior one and
      //      close the editor. Without this, a stale question + button lingers
      //      after the AI moves on.
      //   2. New coding question, editor was closed → store the question so the
      //      "Open Code Editor" button appears (first coding turn flow).
      //   3. New coding question, editor already open → swap the question in
      //      place. This is the multi-coding-question case: candidate just
      //      submitted, AI returns the next problem, editor stays open.
      const latestAiMsg = aiMsgs[latestIdx];
      if (jobConfig.code_editor_required) {
        if (latestAiMsg.codingQuestion) {
          setActiveCodingQuestion(latestAiMsg.codingQuestion);
          // Leave showCodeEditor as-is: false on first coding turn (button
          // shown), true on subsequent turns (seamless swap in editor).
        } else {
          setActiveCodingQuestion(null);
          setShowCodeEditor(false);
        }
      }
    }
  }, [messages, speak, stop, cancelSilenceAnim]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 2: SPEAKING → LISTENING transition (when TTS ends)     */
  /*                                                                  */
  /*  Flow modes:                                                     */
  /*  • Intro phase (qIndex=0, no candidate msg): idle, show Start Speaking */
  /*  • Begin phase (qIndex=0, has candidate msg): idle, show Begin   */
  /*  • Q&A phase  (qIndex>0): idle, show manual speaking controls    */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (phase !== "SPEAKING") return;
    if (isSpeaking || isThinking) return;

    // Interview complete & avatar finished speaking → auto-trigger completion
    if (isInterviewComplete) {
      if (!isAutoCompletingRef.current) {
        isAutoCompletingRef.current = true;
        // Give user enough time to see/hear the closing message before transition.
        // Previously 1.5s was too abrupt — candidate barely noticed the goodbye.
        const completeTimer = setTimeout(() => {
          onComplete();
        }, 4000);
        return () => clearTimeout(completeTimer);
      }
      return;
    }

    // When code editor is open, go to IDLE instead of LISTENING (no STT needed)
    if (showCodeEditor) {
      setPhase("IDLE");
      return;
    }

    const timer = setTimeout(() => {
      if (phaseRef.current !== "SPEAKING") return;

      setPhase("LISTENING");
      reset();

      // Manual flow: candidate clicks Start Speaking → Stop → Send Response
      // voiceState stays "idle" until candidate clicks Start Speaking
    }, POST_SPEECH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [phase, isSpeaking, isThinking, isInterviewComplete, showCodeEditor, reset, onComplete]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 2b: SPEAKING hard-ceiling safety net                   */
  /*  If TTS audio hangs (onplaying/onended never fire), isSpeaking  */
  /*  stays true forever and Effect 2 never arms its timer — so the  */
  /*  UI sits on "Nira speaking". Recover after a generous ceiling.  */
  /* ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== "SPEAKING") return;
    const ceiling = setTimeout(() => {
      if (phaseRef.current !== "SPEAKING") return;
      console.warn("[InterviewRoom] SPEAKING exceeded ceiling — TTS likely hung; recovering");
      cancel(); // stop any stuck audio
      if (isInterviewComplete) {
        if (!isAutoCompletingRef.current) {
          isAutoCompletingRef.current = true;
          onComplete();
        }
      } else if (showCodeEditor) {
        setPhase("IDLE");
      } else {
        setPhase("LISTENING");
        reset();
        setVoiceState("idle");
      }
    }, SPEAKING_TIMEOUT_MS);
    return () => clearTimeout(ceiling);
  }, [phase, cancel, reset, isInterviewComplete, showCodeEditor, onComplete]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 3: Silence detection — ChatGPT voice mode style        */
  /*  ONLY triggers on FINAL transcript, never on interim.          */
  /*  Waits for confirmed silence after user finishes speaking.     */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (phase !== "LISTENING") {
      cancelSilenceAnim();
      return;
    }

    // Pause silence detection when code editor is open — candidate is typing, not speaking
    if (showCodeEditor) {
      cancelSilenceAnim();
      return;
    }

    // Only start silence countdown when we have final (confirmed) transcript
    const finalText = finalTranscriptRef.current;
    if (!finalText || lastFinalAt === 0) {
      cancelSilenceAnimRef.current();
      return;
    }

    // Check for immediate-action phrases on final text only
    if (isCompletionPhrase(finalText)) {
      handleSubmitRef.current();
      return;
    }
    if (isSkipCommand(finalText)) {
      handleSkipRef.current();
      return;
    }
    if (isEndCommand(finalText)) {
      handleSubmitRef.current();
      return;
    }

    // If there's active interim text, user is still speaking — don't start countdown
    if (interimTranscript.trim()) {
      cancelSilenceAnimRef.current();
      return;
    }

    // User has stopped speaking (no interim text, only final).
    // Start silence countdown from lastFinalAt.
    // Timeout scales with transcript length — the more the candidate has said,
    // the more patience we give for thinking pauses (up to MAX).
    const timeout = currentQuestionIndex === 0
      ? INTRO_SILENCE_TIMEOUT_MS
      : Math.min(
          SILENCE_TIMEOUT_MAX_MS,
          SILENCE_TIMEOUT_BASE_MS + finalText.length * SILENCE_TIMEOUT_SCALE_PER_CHAR
        );

    const tick = () => {
      if (phaseRef.current !== "LISTENING") return;
      const elapsed = Date.now() - lastFinalAt;
      const progress = Math.min(100, (elapsed / timeout) * 100);
      setSilenceProgress(progress);

      if (elapsed >= timeout) {
        // Manual mode: do NOT auto-stop recording.
        // Just cap the progress bar at 100% as a visual hint.
        // The candidate clicks Stop when they're done speaking.
        setSilenceProgress(100);
      } else {
        silenceAnimRef.current = requestAnimationFrame(tick);
      }
    };

    silenceAnimRef.current = requestAnimationFrame(tick);

    return () => {
      if (silenceAnimRef.current) {
        cancelAnimationFrame(silenceAnimRef.current);
        silenceAnimRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, interimTranscript, lastFinalAt, phase, currentQuestionIndex, showCodeEditor]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 4: Interview completion — cleanup only                 */
  /*                                                                  */
  /*  Does NOT call onComplete or cancel speech — those are handled */
  /*  by Effect 2 (after closing message TTS) or by direct handlers */
  /*  (handleEndInterview, violations, end commands).                */
  /*  Calling cancel() here would kill the AI's closing message.    */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isInterviewComplete) return;
    disableViolations();
    if (timerRef.current) clearInterval(timerRef.current);
    if (questionTimerRef.current) { clearInterval(questionTimerRef.current); questionTimerRef.current = null; }
    cancelSilenceAnim();
    processingStartRef.current = null;
  }, [isInterviewComplete, disableViolations, cancelSilenceAnim]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 4b: Fallback completion — safety net if normal flow   */
  /*  (Effect 1 → speak closing → Effect 2 → onComplete) doesn't  */
  /*  trigger within 5 seconds. Uses a delay so it doesn't kill    */
  /*  the closing message speech started by Effect 1.              */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isInterviewComplete) return;
    if (isAutoCompletingRef.current) return;

    // Give the normal flow (Effect 1 speak → Effect 2 onComplete) time to work.
    // Only force-complete if nothing happened after 12 seconds (enough for closing
    // message TTS + the 4s user-visible delay in Effect 2).
    const fallback = setTimeout(() => {
      if (isAutoCompletingRef.current) return; // Normal flow completed in time
      console.warn("[InterviewRoom] Fallback completion — normal flow did not trigger in 12s");
      isAutoCompletingRef.current = true;
      stop();
      cancel();
      setPhase("IDLE");
      onComplete();
    }, 12000);

    return () => clearTimeout(fallback);
  }, [isInterviewComplete, stop, cancel, onComplete]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT: Reset voiceState when leaving LISTENING phase          */
  /* ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== "LISTENING") {
      setVoiceState("idle");
      setCapturedTranscript("");
      capturedTranscriptRef.current = "";
      setRecordingDuration(0);
      setIsEditingTranscript(false);
      setEditableTranscript("");
      setCorrectionApplied(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }, [phase]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT: Recording duration timer                               */
  /* ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (voiceState === "recording") {
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [voiceState]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 5: PROCESSING timeout recovery                         */
  /*  If we're stuck in PROCESSING/thinking for too long,           */
  /*  force-recover to LISTENING so the interview doesn't freeze.   */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    // Guard ONLY on phase. Previously this also depended on `isThinking`, which
    // sendMessage clears in its finally regardless of outcome — that tore down
    // and recreated this interval mid-wait, so the 45s deadline could reset or
    // never fire, leaving the UI stuck on "processing". A single stable interval
    // owned purely by the PROCESSING phase is the reliable safety net.
    if (phase !== "PROCESSING") return;

    const checkStuck = setInterval(() => {
      if (phaseRef.current === "PROCESSING" && processingStartRef.current) {
        const elapsed = Date.now() - processingStartRef.current;
        if (elapsed > PROCESSING_TIMEOUT_MS) {
          console.warn("[InterviewRoom] Stuck in PROCESSING for", elapsed, "ms — force-recovering to LISTENING");
          processingStartRef.current = null;
          isSubmittingRef.current = false;
          setPhase("LISTENING");
          reset();
          // Don't auto-start recognition — manual flow requires user to click Start Speaking
          setVoiceState("idle");
        }
      }
    }, 1000);

    return () => clearInterval(checkStuck);
  }, [phase, reset]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT: Per-question auto-skip countdown timer                */
  /*  Resets when question index changes; auto-skips on expiry.     */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    // Clear existing timer
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }

    // Only activate when auto_skip_timeout > 0 and we're past the intro (question 0)
    if (autoSkipTimeout <= 0 || currentQuestionIndex <= 0) {
      setQuestionTimeLeft(0);
      return;
    }

    // Reset countdown for this new question
    setQuestionTimeLeft(autoSkipTimeout);

    questionTimerRef.current = setInterval(() => {
      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up — auto-submit if there's a transcript, otherwise skip
          if (questionTimerRef.current) clearInterval(questionTimerRef.current);
          questionTimerRef.current = null;
          if (phaseRef.current === "LISTENING") {
            setTimeout(() => {
              if (phaseRef.current === "LISTENING" && !isSubmittingRef.current) {
                const hasAnswer = finalTranscriptRef.current.trim().length >= MIN_SUBMIT_LENGTH;
                if (hasAnswer) {
                  handleSubmit();
                } else {
                  handleSkip();
                }
              }
            }, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
    };
  }, [currentQuestionIndex, autoSkipTimeout, handleSubmit, handleSkip]);

  // Pause question timer during SPEAKING/PROCESSING, resume during LISTENING
  useEffect(() => {
    if (autoSkipTimeout <= 0 || currentQuestionIndex <= 0) return;

    if (phase === "SPEAKING" || phase === "PROCESSING") {
      // Pause: clear interval but keep questionTimeLeft
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
    } else if (phase === "LISTENING" && !questionTimerRef.current && questionTimeLeft > 0) {
      // Resume countdown
      questionTimerRef.current = setInterval(() => {
        setQuestionTimeLeft((prev) => {
          if (prev <= 1) {
            if (questionTimerRef.current) clearInterval(questionTimerRef.current);
            questionTimerRef.current = null;
            setTimeout(() => {
              if (phaseRef.current === "LISTENING" && !isSubmittingRef.current) {
                const hasAnswer = finalTranscriptRef.current.trim().length >= MIN_SUBMIT_LENGTH;
                if (hasAnswer) {
                  handleSubmit();
                } else {
                  handleSkip();
                }
              }
            }, 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      // Don't clear on unmount here — the main effect handles full cleanup
    };
  }, [phase, autoSkipTimeout, currentQuestionIndex, questionTimeLeft, handleSubmit, handleSkip]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  Violation modal                                               */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    // Screen-share stop has its own dedicated "Share Screen Again" modal, so
    // don't also pop the generic violation modal for it (avoid stacking two).
    if (lastViolation && lastViolation !== "screen_share_stopped") {
      setShowViolationModal(true);
    }
  }, [lastViolation, violationCount]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  Screen share monitoring                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!screenStream) return;
    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const handleEnded = () => {
      if (phaseRef.current !== "IDLE") {
        stop();
        cancel();
        setShowScreenShareModal(true);
        // Record stopping screen share as a proctoring violation: it counts
        // toward the cheating score the recruiter sees and the auto-terminate
        // threshold. We can't prevent the candidate from stopping (the browser
        // controls that bar), but it is never a free action.
        void reportViolation(
          "screen_share_stopped",
          "Candidate stopped screen sharing during the interview",
        );
      }
    };
    videoTrack.addEventListener("ended", handleEnded);
    return () => videoTrack.removeEventListener("ended", handleEnded);
  }, [screenStream, stop, cancel, reportViolation]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  Helpers                                                       */
  /* ═══════════════════════════════════════════════════════════════ */

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  /* ── Code submission handler ── */
  const handleCodeSubmit = useCallback(
    async (code: string, language: string, testResult: { passed: number; total: number }) => {
      // Don't tear the editor down here — let the next AI message decide.
      // If another coding question follows, the effect above swaps it in place
      // (so the candidate doesn't see the same "click the button" prompt
      // again). If no coding question follows, the same effect closes the
      // editor so the chat panel comes back.
      const codeContext =
        `[CODE SUBMISSION] Language: ${language} | ` +
        `Tests: ${testResult.passed}/${testResult.total} passed\n` +
        `\`\`\`${language}\n${code}\n\`\`\``;
      await onSendMessage(codeContext);
    },
    [onSendMessage]
  );

  const handleCodeClose = useCallback(() => {
    setShowCodeEditor(false);
  }, []);

  const handleEndInterview = useCallback(() => {
    playEndCall();
    isAutoCompletingRef.current = true;
    setPhase("IDLE");
    disableViolations();
    cancel();
    stop();
    cancelSilenceAnim();
    if (timerRef.current) clearInterval(timerRef.current);
    if (questionTimerRef.current) { clearInterval(questionTimerRef.current); questionTimerRef.current = null; }
    setShowEndConfirm(false);
    onComplete();
  }, [disableViolations, cancel, stop, cancelSilenceAnim, onComplete]);

  // Auto-terminate interview when violation threshold is reached
  useEffect(() => {
    if (!shouldTerminate) return;
    setShowViolationModal(true);
    const t = setTimeout(() => handleEndInterview(), 3000);
    return () => clearTimeout(t);
  }, [shouldTerminate, handleEndInterview]);

  /* ── Draggable PIP handlers ── */
  const pipCleanupRef = useRef<(() => void) | null>(null);
  const handlePipMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Clean up any previous drag listeners
    pipCleanupRef.current?.();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pipDragRef.current = { dragging: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };

    const onMove = (ev: MouseEvent) => {
      if (!pipDragRef.current.dragging) return;
      const container = document.getElementById("interview-main");
      if (!container) return;
      const cr = container.getBoundingClientRect();
      const nx = ev.clientX - cr.left - pipDragRef.current.offsetX;
      const ny = ev.clientY - cr.top - pipDragRef.current.offsetY;
      setPipPos({
        x: Math.max(0, Math.min(nx, cr.width - 200)),
        y: Math.max(0, Math.min(ny, cr.height - 150)),
      });
    };
    const cleanup = () => {
      pipDragRef.current.dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
      pipCleanupRef.current = null;
    };
    pipCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
  }, []);

  // Cleanup PIP drag on unmount
  useEffect(() => {
    return () => { pipCleanupRef.current?.(); };
  }, []);

  /* ── Status indicator ── */
  const statusLabel = isEditingTranscript
    ? { text: "Editing transcript…", color: "text-red-600", dot: "bg-red-500" }
    : correctionApplied && phase === "LISTENING" && voiceState === "answered"
    ? { text: "Correction saved", color: "text-green-600", dot: "bg-green-500" }
    : phase === "PROCESSING" || isThinking
    ? { text: "Nira is thinking…", color: "text-blue-600", dot: "bg-blue-500" }
    : phase === "SPEAKING" || isSpeaking
    ? { text: "Nira is speaking…", color: "text-purple-600", dot: "bg-purple-500" }
    : phase === "LISTENING" && voiceState === "connecting"
    ? { text: "Connecting microphone…", color: "text-amber-600", dot: "bg-amber-500" }
    : phase === "LISTENING" && voiceState === "recording"
    ? { text: "Listening… (click stop when done)", color: "text-green-600", dot: "bg-green-500" }
    : phase === "LISTENING" && silenceProgress > 0
    ? { text: "Silence detected — finishing up?", color: "text-amber-600", dot: "bg-amber-500" }
    : phase === "LISTENING"
    ? { text: "Click Start Speaking to respond", color: "text-green-600", dot: "bg-green-500" }
    : { text: messages.length === 0 ? "Starting interview…" : "Preparing…", color: "text-gray-400", dot: "bg-gray-400" };

  /* ── Active state tab ── */
  type StateTab = "aria_speaking" | "candidate_answering" | "silence_detection" | "transcript_edit" | "correction_saved" | "next_question";
  const activeStateTab: StateTab = isEditingTranscript
    ? "transcript_edit"
    : correctionApplied && phase === "LISTENING" && voiceState === "answered"
    ? "correction_saved"
    : (phase === "PROCESSING" || isThinking)
    ? "next_question"
    : (phase === "SPEAKING" || isSpeaking)
    ? "aria_speaking"
    : phase === "LISTENING" && silenceProgress > 0
    ? "silence_detection"
    : phase === "LISTENING" && (voiceState === "recording" || voiceState === "answered")
    ? "candidate_answering"
    : "aria_speaking";

  const STATE_TABS: { key: StateTab; label: string }[] = [
    { key: "aria_speaking", label: "Nira speaking" },
    { key: "candidate_answering", label: "Candidate answering" },
    { key: "silence_detection", label: "Silence detection" },
    { key: "transcript_edit", label: "Transcript error" },
    { key: "correction_saved", label: "After correction" },
    { key: "next_question", label: "Moving to next Q" },
  ];

  /* ── Live transcript text — polled directly from refs, not React state ── */
  // React state (transcript/interimTranscript) updates asynchronously and can
  // briefly show stale or empty text between recognition restarts. Instead, we
  // poll getSnapshot() which reads synchronously from the hook's refs — zero lag.
  // liveText: combines final transcript + interim for live display
  const liveText = (() => {
    if (phase === "LISTENING" && voiceState === "recording") {
      // transcript already includes interim from the STT hook
      return transcript;
    }
    if (phase === "LISTENING" && voiceState === "answered" && capturedTranscript) {
      return capturedTranscript;
    }
    if (phase === "PROCESSING" && capturedTranscript) {
      return capturedTranscript;
    }
    return "";
  })();

  /* ═══════════════════════════════════════════════════════════════ */
  /*  STUCK-AT-START RECOVERY                                        */
  /*  If the interview produces NOTHING — no AI opening message, so  */
  /*  no Nira audio, no text, and no Start-Speaking button — the     */
  /*  candidate is trapped. Surface an escape hatch so they can      */
  /*  always retry or leave instead of staring at a frozen screen.  */
  /* ═══════════════════════════════════════════════════════════════ */
  const [showStuckHelp, setShowStuckHelp] = useState(false);
  useEffect(() => {
    if (messages.length > 0) {
      setShowStuckHelp(false);
      return;
    }
    const t = setTimeout(() => setShowStuckHelp(true), 30000);
    return () => clearTimeout(t);
  }, [messages.length]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDER                                                        */
  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Escape hatch: the interview never produced an opening message. */}
      {showStuckHelp && messages.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Trouble starting your interview</h2>
            <p className="mt-2 text-sm text-gray-500">
              We couldn&apos;t load the interview — this is usually a temporary connection issue.
              Reload to try again, or end the interview.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Reload &amp; try again
              </Button>
              <Button
                variant="outline"
                onClick={onComplete}
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                End interview
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Header Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100 z-10">
        {/* Left: Logo/Brand + Timer */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            <span className="text-gray-800 text-sm font-semibold tracking-tight">anytimehire.ai</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-gray-500 text-xs font-mono">{formatTime(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Center: Job Title */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <span className="text-gray-800 text-sm font-semibold">Interview for {jobConfig.title}</span>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-3">
          {/* Question progress — total = verbal + coding turns */}
          {(() => {
            const totalTurns = jobConfig.max_questions + (jobConfig.max_coding_questions ?? 0);
            return (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="font-semibold text-blue-600">
                  {Math.min(Math.max(currentQuestionIndex, completedQuestionCount), totalTurns)}
                </span>
                <span>/</span>
                <span>{totalTurns}</span>
                <span className="text-[10px] uppercase tracking-wide ml-0.5">Questions</span>
              </div>
            );
          })()}

          {/* Per-question countdown timer */}
          {autoSkipTimeout > 0 && questionTimeLeft > 0 && currentQuestionIndex > 0 && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${
              questionTimeLeft <= 10
                ? "bg-red-50 border border-red-200 text-red-600"
                : questionTimeLeft <= 30
                ? "bg-amber-50 border border-amber-200 text-amber-600"
                : "text-gray-500"
            }`}>
              <span className="font-bold">{formatTime(questionTimeLeft)}</span>
            </div>
          )}

          {violationCount > 0 && (
            <div className="flex items-center gap-1 text-red-600 text-xs bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
              <span className="font-semibold">{violationCount}</span>
              <span>violation{violationCount !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Switch to Coding Test button */}
          {activeCodingQuestion && !showCodeEditor && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5 border-purple-300 text-purple-600 hover:bg-purple-50"
              onClick={() => setShowCodeEditor(true)}
            >
              <Monitor className="w-3.5 h-3.5" />
              Switch to Coding Test
            </Button>
          )}
          {activeCodingQuestion && showCodeEditor && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5 border-gray-300 text-gray-600 hover:bg-gray-50"
              onClick={() => setShowCodeEditor(false)}
            >
              Back to Chat
            </Button>
          )}

          {/* End Interview button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-4 text-xs gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
            onClick={() => setShowEndConfirm(true)}
          >
            <PhoneOff className="w-3.5 h-3.5" />
            End interview
          </Button>
        </div>
      </div>

      {/* ── State Tabs ── */}
      <div className="px-4 py-2 border-b border-gray-100 shrink-0 flex items-center gap-1.5 overflow-x-auto">
        {STATE_TABS.map((tab) => (
          <div
            key={tab.key}
            className={`text-[11px] px-3 py-1 rounded-full whitespace-nowrap transition-all duration-300 ${
              activeStateTab === tab.key
                ? "bg-blue-600 text-white font-medium"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* ── State Indicator Bar ── */}
      <div className="px-4 py-2 border-b border-gray-100 shrink-0 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusLabel.dot} ${
          (phase === "SPEAKING" || isSpeaking || (phase === "LISTENING" && voiceState === "recording")) ? "animate-pulse" : ""
        }`} />

        {/* Wave bars for speaking/listening states */}
        {(phase === "SPEAKING" || isSpeaking || (phase === "LISTENING" && voiceState === "recording")) && (
          <div className="flex items-end gap-[2px] h-3.5">
            {[8, 12, 6, 10, 14, 8].map((h, i) => (
              <div
                key={i}
                className={`w-[2px] rounded-full ${
                  phase === "LISTENING" && voiceState === "recording" ? "bg-green-500" : "bg-purple-500"
                }`}
                style={{
                  height: `${h}px`,
                  animation: `pulse ${0.3 + (i % 3) * 0.1}s ease-in-out ${i * 0.05}s infinite alternate`,
                }}
              />
            ))}
          </div>
        )}

        <span className={`text-xs font-medium ${statusLabel.color}`}>
          {statusLabel.text}
        </span>

        {/* Silence progress inline */}
        {phase === "LISTENING" && silenceProgress > 0 && (
          <div className="flex items-center gap-2 ml-2">
            <div className="w-20 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${silenceProgress}%`, transition: "width 100ms linear" }}
              />
            </div>
            <span className="text-[10px] text-amber-600">finishing up…</span>
          </div>
        )}

        <span className="text-[10px] text-gray-400 ml-auto">
          {(phase === "SPEAKING" || isSpeaking) && "listen carefully"}
          {phase === "LISTENING" && voiceState === "recording" && "speak clearly"}
          {phase === "LISTENING" && voiceState === "idle" && "your turn to answer"}
          {isEditingTranscript && "tap words to correct"}
          {correctionApplied && !isEditingTranscript && voiceState === "answered" && "transcript updated"}
          {(phase === "PROCESSING" || isThinking) && "processing…"}
        </span>
      </div>

      {/* ── Main Content Area ── */}
      <div id="interview-main" className="flex flex-1 overflow-hidden relative">

        {/* ── Draggable Webcam PIP (small overlay, top-left) ── */}
        {webcamStream && (
          <div
            className="absolute z-20 rounded-xl overflow-hidden border border-gray-200 shadow-lg cursor-move group"
            style={{
              left: pipPos.x,
              top: pipPos.y,
              width: 200,
              height: 140,
            }}
            onMouseDown={handlePipMouseDown}
          >
            <WebcamMini stream={webcamStream} />
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="w-4 h-4 text-white/70 drop-shadow" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent py-1.5 px-2.5">
              <p className="text-white text-[10px] font-medium">You</p>
            </div>
          </div>
        )}

        {/* ── Left: Avatar Card (compact square, vertically centered) ── */}
        <div className={`flex flex-col items-center justify-center transition-all duration-300 px-6 ${
          showCodeEditor ? "w-[30%]" : "w-[35%]"
        }`}>
          <div className="relative w-full rounded-2xl overflow-hidden bg-[#eef0f8] border border-gray-200/60 shadow-sm aspect-square max-h-[280px] min-h-[200px]">
            {jobConfig.virtual_avatar ? (
              <ErrorBoundary
                name="avatar"
                fallback={
                  <div className="flex h-full w-full items-center justify-center bg-[#eef0f8] text-gray-400 text-sm">
                    Interviewer
                  </div>
                }
              >
                <AvatarScene isSpeaking={isLipSyncing} isThinking={isThinking} />
              </ErrorBoundary>
            ) : jobConfig.manual_interview ? (
              <VoiceVisualizer
                mode={
                  (isThinking || phase === "PROCESSING"
                    ? "processing"
                    : phase === "SPEAKING" || isSpeaking
                      ? "speaking"
                      : phase === "LISTENING" && isListening
                        ? "listening"
                        : "idle") as VoiceMode
                }
                micStream={micStream}
                ttsAudio={audioElement}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-3xl">
                  AI
                </div>
              </div>
            )}

            {/* Speaker/volume icon overlay at bottom-left */}
            {isSpeaking && (
              <button className="absolute bottom-3 left-3 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm border border-gray-200/50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Right: Code Editor OR Chat Panel ── */}
        {showCodeEditor && activeCodingQuestion ? (
          <div className="flex-1 flex flex-col min-w-0">
            <CodeEditor
              // Force remount when the question changes so internal state
              // (code, language, timer, test results) resets between coding
              // questions. Title alone could collide if the AI reuses one;
              // pair with description for uniqueness.
              key={`${activeCodingQuestion.title}::${activeCodingQuestion.description?.slice(0, 40) ?? ""}`}
              question={activeCodingQuestion}
              sessionId={sessionId}
              onSubmit={handleCodeSubmit}
              onClose={handleCodeClose}
              apiBase={API_BASE}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-white min-w-0 py-4 pr-4">
            {/* Messages area — main scrollable content */}
            <div className="flex-1 overflow-hidden px-4 py-3 min-h-0 border border-gray-100 rounded-2xl bg-gray-50/30">
              <TranscriptPanel
                messages={messages}
                isThinking={isThinking}
                liveTranscript={liveText}
              />
            </div>

            {/* Coding question prompt */}
            {activeCodingQuestion && !showCodeEditor && (
              <div className="mt-3 shrink-0">
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Monitor className="w-5 h-5 text-purple-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-purple-700 text-sm font-semibold truncate">{activeCodingQuestion.title}</p>
                      <p className="text-purple-500 text-xs">Click the button to open the code editor</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-4 shrink-0"
                    onClick={() => setShowCodeEditor(true)}
                  >
                    Open Code Editor
                  </Button>
                </div>
              </div>
            )}

            {/* Per-question timeout progress bar */}
            {autoSkipTimeout > 0 && questionTimeLeft > 0 && currentQuestionIndex > 0 && phase === "LISTENING" && (
              <div className="mt-2 shrink-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-gray-400">Time remaining</span>
                  <span className={`text-[10px] font-mono ${questionTimeLeft <= 10 ? "text-red-500" : "text-gray-500"}`}>
                    {formatTime(questionTimeLeft)}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 linear ${
                      questionTimeLeft <= 10 ? "bg-red-500" : questionTimeLeft <= 30 ? "bg-amber-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${(questionTimeLeft / autoSkipTimeout) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Live transcript bar */}
            {phase === "LISTENING" && voiceState === "recording" && liveText && (
              <div className="mt-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shrink-0 max-h-24 overflow-y-auto">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0 mt-1.5 bg-green-500 animate-pulse" />
                  <p className="text-gray-700 text-sm">{liveText}</p>
                </div>
              </div>
            )}

            {/* Editable transcript bar — shown in answered state */}
            {phase === "LISTENING" && voiceState === "answered" && capturedTranscript && (
              <div className="mt-2 shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 font-medium">Your live transcript</span>
                  {!isEditingTranscript ? (
                    <button
                      onClick={() => { setEditableTranscript(capturedTranscript); setIsEditingTranscript(true); setCorrectionApplied(false); }}
                      className="flex items-center gap-1 text-[10px] text-red-500 bg-red-50 border border-red-200 rounded px-2 py-0.5 hover:bg-red-100 transition-colors"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      Flag error
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setCapturedTranscript(editableTranscript);
                          capturedTranscriptRef.current = editableTranscript;
                          setIsEditingTranscript(false);
                          setCorrectionApplied(true);
                        }}
                        className="flex items-center gap-1 text-[10px] text-green-600 bg-green-50 border border-green-200 rounded px-2 py-0.5 hover:bg-green-100 transition-colors"
                      >
                        <Check className="w-2.5 h-2.5" />
                        Save
                      </button>
                      <button
                        onClick={() => { setIsEditingTranscript(false); setEditableTranscript(""); }}
                        className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-100 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {isEditingTranscript ? (
                  <textarea
                    value={editableTranscript}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border-2 border-red-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-red-400 resize-none"
                    rows={3}
                    autoFocus
                  />
                ) : (
                  <div className={`px-4 py-2.5 rounded-xl max-h-24 overflow-y-auto ${
                    correctionApplied
                      ? "bg-green-50 border border-green-200"
                      : "bg-white border border-gray-200"
                  }`}>
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${correctionApplied ? "bg-green-500" : "bg-blue-500"}`} />
                      <p className="text-gray-700 text-sm">
                        {capturedTranscript}
                        {correctionApplied && <span className="ml-2 text-[10px] text-green-600">(corrected)</span>}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Voice not supported warning */}
            {typeof window !== "undefined" && !isSupported && (
              <div className="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg shrink-0">
                <p className="text-yellow-700 text-xs">Voice recognition not supported in this browser.</p>
              </div>
            )}

            {/* Skip + auto-skip timer inline under chat */}
            {phase === "LISTENING" && voiceState === "idle" && currentQuestionIndex > 0 && (
              <div className="mt-3 flex items-center justify-center gap-4 shrink-0">
                <button
                  onClick={handleSkip}
                  disabled={phase !== "LISTENING" || isInterviewComplete}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Skip this question
                </button>
                {autoSkipTimeout > 0 && questionTimeLeft > 0 && (
                  <div className="flex items-center gap-1.5 px-4 py-2 text-sm text-amber-600 border border-amber-200 rounded-full bg-amber-50">
                    Skips in {formatTime(questionTimeLeft)}
                    <button onClick={() => { /* cancel auto-skip could go here */ }} className="ml-1 text-amber-400 hover:text-amber-600">
                      <span className="text-xs">✕</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Footer Bar — full-width voice controls ── */}
      {!showCodeEditor && (
        <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4 flex items-center justify-between">
          {/* Left: Powered by */}
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <span>Powered by</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                <span className="text-white text-[8px] font-bold">A</span>
              </div>
              <span className="text-gray-600 font-medium">anytimehire.ai</span>
            </div>
          </div>

          {/* Center: Voice Controls */}
          <div className="flex flex-col items-center gap-2">
            {phase === "LISTENING" && (
              <>
                {/* IDLE: Start Speaking */}
                {voiceState === "idle" && (
                  <Button
                    onClick={handleStartSpeaking}
                    className="bg-red-500 hover:bg-red-400 text-white rounded-full px-10 py-3 gap-2.5 font-semibold text-sm shadow-lg shadow-red-200/50"
                  >
                    <Mic className="w-4.5 h-4.5" />
                    Start Speaking
                  </Button>
                )}

                {/* CONNECTING: Show loader while Deepgram connects */}
                {voiceState === "connecting" && (
                  <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 border border-gray-200 rounded-full">
                    <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-600 font-medium">Connecting microphone...</span>
                  </div>
                )}

                {/* RECORDING: Waveform + timer + stop */}
                {voiceState === "recording" && (
                  <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-50 border border-gray-200 rounded-full">
                    <div className="flex items-center gap-px h-7">
                      {[4,7,3,8,5,9,4,6,8,3,7,5,9,4,6,8,3,7,5,6].map((h, i) => (
                        <div
                          key={i}
                          className="w-1 bg-red-400 rounded-full mx-px"
                          style={{
                            height: `${h * 8}%`,
                            minHeight: "15%",
                            maxHeight: "90%",
                            animation: `pulse ${0.4 + (i % 5) * 0.08}s ease-in-out ${i * 0.04}s infinite alternate`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-gray-600 text-xs font-mono tabular-nums whitespace-nowrap">
                      {formatTime(recordingDuration)}
                    </span>
                    <button
                      onClick={handleStopSpeaking}
                      className="w-9 h-9 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center shrink-0 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5 text-white fill-current" />
                    </button>
                  </div>
                )}

                {/* ANSWERED: Delete + Send Response */}
                {voiceState === "answered" && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { playDelete(); reset(); capturedTranscriptRef.current = ""; setCapturedTranscript(""); setVoiceState("idle"); setIsEditingTranscript(false); setCorrectionApplied(false); }}
                      className="w-10 h-10 border border-gray-300 hover:border-red-400 rounded-full flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors"
                      title="Delete & Re-record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <Button
                      onClick={() => { playSendResponse(); handleSubmit(); }}
                      disabled={!(capturedTranscript || transcript) || (capturedTranscript || transcript).length < 3}
                      className="bg-blue-600 hover:bg-blue-500 text-white rounded-full px-8 py-3 gap-2 font-semibold text-sm shadow-lg shadow-blue-200/50"
                    >
                      <Send className="w-4 h-4" />
                      Send Response
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* PROCESSING indicator */}
            {(phase === "PROCESSING" || (phase === "IDLE" && isThinking)) && (
              <div className="flex items-center gap-2 text-blue-500 text-sm">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>Processing your response…</span>
              </div>
            )}

            {/* SPEAKING status */}
            {(phase === "SPEAKING" || (phase !== "LISTENING" && phase !== "PROCESSING" && isSpeaking)) && (
              <div className="flex items-center gap-2 text-purple-500 text-sm">
                <div className="flex items-center gap-0.5">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-purple-400 rounded-full animate-pulse"
                      style={{
                        height: `${10 + Math.random() * 10}px`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: `${0.4 + Math.random() * 0.3}s`,
                      }}
                    />
                  ))}
                </div>
                <span>Nira is speaking…</span>
              </div>
            )}
          </div>

          {/* Right: Mic status indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
            voiceState === "recording"
              ? "bg-green-50 border border-green-200 text-green-600"
              : "bg-gray-50 border border-gray-100 text-gray-400"
          }`}>
            {voiceState === "recording" ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            {voiceState === "recording" ? "Mic Active" : "Mic Off"}
          </div>
        </div>
      )}

      {/* ── Violation Modal ── */}
      {showViolationModal && lastViolation && (
        <ViolationModal
          violationType={lastViolation}
          violationCount={violationCount}
          threshold={VIOLATION_THRESHOLD}
          onDismiss={() => setShowViolationModal(false)}
        />
      )}

      {/* ── Secondary Camera Disconnected Warning with Reconnect QR ── */}
      {secondaryCam.isDisconnected && (
        <SecondCamReconnectModal
          sessionId={sessionId}
          disconnectedSeconds={secondaryCam.disconnectedSeconds}
        />
      )}

      {/* ── Screen Share Lost Modal ── */}
      <AlertDialog open={showScreenShareModal}>
        <AlertDialogContent className="bg-white border-gray-200 max-w-sm">
          <AlertDialogHeader className="text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-2">
              <Monitor className="w-6 h-6 text-amber-500" />
            </div>
            <AlertDialogTitle className="text-gray-900 font-semibold text-lg">
              Screen Share Stopped
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 text-sm">
              Your screen sharing has stopped. The interview is paused until you resume sharing your entire screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700"
              onClick={async () => {
                try {
                  const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { displaySurface: "monitor" } as any,
                    audio: true,
                  });
                  // Validate system audio is included
                  if (stream.getAudioTracks().length === 0) {
                    stream.getTracks().forEach((t) => t.stop());
                    alert("Please enable \"Also share system audio\" when sharing your screen.");
                    return;
                  }
                  setShowScreenShareModal(false);
                  // Pass new stream back to parent so recording can use it
                  onScreenStreamChanged?.(stream);
                  // Resume to LISTENING phase so candidate can click Start Speaking
                  if (phaseRef.current === "IDLE") {
                    setPhase("LISTENING");
                    reset();
                    setVoiceState("idle");
                  }
                } catch {
                  // User denied — keep modal open
                }
              }}
            >
              Share Screen Again
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── End Interview Confirmation ── */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent className="bg-white border-gray-200 max-w-sm">
          <AlertDialogHeader className="text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-2">
              <PhoneOff className="w-6 h-6 text-red-500" />
            </div>
            <AlertDialogTitle className="text-gray-900 font-semibold text-lg">
              End Interview?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 text-sm">
              This will immediately stop the interview and submit your session for evaluation.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              className="flex-1 border-gray-300 text-gray-600 hover:bg-gray-50"
              onClick={() => setShowEndConfirm(false)}
            >
              Continue
            </Button>
            <Button
              variant="destructive"
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={handleEndInterview}
            >
              End Now
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WebcamMini({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="w-full h-full object-cover bg-black" />;
}
