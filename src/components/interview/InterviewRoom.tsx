"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PhoneOff, Mic, MicOff, GripVertical, SkipForward, Monitor } from "lucide-react";
import dynamic from "next/dynamic";
import AvatarScene from "./AvatarScene";
import TranscriptPanel from "./TranscriptPanel";
import ViolationModal from "./ViolationModal";
import { useSpeechRecognition } from "@/hooks/interview/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/interview/useSpeechSynthesis";
import { useViolationDetection } from "@/hooks/interview/useViolationDetection";
import type { Message, JobConfig, QuestionState, CodingQuestion } from "@/hooks/interview/useInterviewSession";
import { API_BASE } from "@/lib/api";

const CodeEditor = dynamic(() => import("./CodeEditor"), { ssr: false });

/* ─────────────────────── Types & Constants ─────────────────────── */

type InterviewPhase = "IDLE" | "SPEAKING" | "LISTENING" | "PROCESSING";

interface Props {
  sessionId: number;
  jobConfig: JobConfig;
  messages: Message[];
  questionStates: QuestionState[];
  isThinking: boolean;
  isInterviewComplete: boolean;
  onSendMessage: (text: string) => Promise<boolean>;
  onSkipQuestion: () => Promise<boolean>;
  onComplete: () => void;
  webcamStream: MediaStream | null;
  screenStream: MediaStream | null;
}

const VIOLATION_THRESHOLD = 5;

/**
 * Silence timeout: how long to wait AFTER the last final transcript
 * before auto-submitting. Only counts silence after confirmed speech.
 */
const SILENCE_TIMEOUT_MS = 3500;
const INTRO_SILENCE_TIMEOUT_MS = 5000;

/** Delay after TTS finishes before starting STT — prevents echo pickup */
const POST_SPEECH_DELAY_MS = 1200;

/** If PROCESSING phase lasts longer than this, force-recover */
const PROCESSING_TIMEOUT_MS = 35000;

/** Minimum characters of FINAL transcript required before auto-submit */
const MIN_SUBMIT_LENGTH = 3;

const END_COMMANDS = [
  "close interview", "end interview", "stop interview",
  "exit interview", "finish interview",
  "close my interview", "end my interview",
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
  jobConfig,
  messages,
  questionStates,
  isThinking,
  isInterviewComplete,
  onSendMessage,
  onSkipQuestion,
  onComplete,
  webcamStream,
  screenStream,
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
  const [answeredCount, setAnsweredCount] = useState(0);

  /* ── Per-question auto-skip timer state ── */
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number>(0);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSkipTimeout = jobConfig.auto_skip_timeout || 0; // seconds, 0 = off

  /* ── Coding Mode State ── */
  const [activeCodingQuestion, setActiveCodingQuestion] = useState<CodingQuestion | null>(null);

  /* ── Refs ── */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpokenIndexRef = useRef(-1);
  const lastQuestionIndexRef = useRef(0);
  const transcriptRef = useRef("");
  const finalTranscriptRef = useRef("");
  const silenceAnimRef = useRef<number | null>(null);
  const processingStartRef = useRef<number | null>(null);
  const isSubmittingRef = useRef(false);

  /* ── Draggable PIP ── */
  const [pipPos, setPipPos] = useState({ x: 16, y: 16 });
  const pipDragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false, offsetX: 0, offsetY: 0,
  });

  /* ── Hooks ── */
  const { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset } = useSpeechRecognition();
  const { speak, cancel, isSpeaking } = useSpeechSynthesis();
  const { violationCount, lastViolation, shouldTerminate, disable: disableViolations } = useViolationDetection(sessionId, true, webcamStream, jobConfig.face_match);

  /* ── Keep transcriptRef in sync ── */
  useEffect(() => {
    transcriptRef.current = (transcript + " " + interimTranscript).trim();
    finalTranscriptRef.current = transcript.trim();
  }, [transcript, interimTranscript]);

  /* ── Timer ── */
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  /* ── Current question index from latest AI message ── */
  const currentQuestionIndex = (() => {
    const aiMsgs = messages.filter((m) => m.role === "ai");
    if (aiMsgs.length === 0) return 0;
    return aiMsgs[aiMsgs.length - 1].questionIndex ?? 0;
  })();

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
    if (phaseRef.current !== "LISTENING") return;
    if (isSubmittingRef.current) return;

    // Use FINAL transcript only — never submit interim/partial text
    const text = finalTranscriptRef.current.trim();
    if (!text || text.length < MIN_SUBMIT_LENGTH) return;

    // Lock immediately to prevent double-submit
    isSubmittingRef.current = true;
    setPhase("PROCESSING");
    processingStartRef.current = Date.now();
    stop();
    cancel();
    reset();
    cancelSilenceAnim();

    try {
      // Check for end commands
      if (isEndCommand(text)) {
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
    }
  }, [stop, cancel, reset, cancelSilenceAnim, onSendMessage, onSkipQuestion, onComplete, disableViolations]);

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

      // Check if this AI message includes a coding question (only if code editor is enabled)
      const latestAiMsg = aiMsgs[latestIdx];
      if (latestAiMsg.codingQuestion && jobConfig.code_editor_required) {
        setActiveCodingQuestion(latestAiMsg.codingQuestion);
      }
    }
  }, [messages, speak, stop, cancelSilenceAnim]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 2: SPEAKING → LISTENING transition (when TTS ends)     */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (phase !== "SPEAKING") return;
    if (isSpeaking || isThinking) return;
    if (isInterviewComplete) return;

    // When coding mode is active, go to IDLE instead of LISTENING (no STT needed)
    if (activeCodingQuestion) {
      setPhase("IDLE");
      return;
    }

    const timer = setTimeout(() => {
      if (phaseRef.current === "SPEAKING") {
        setPhase("LISTENING");
        reset();
        start();
      }
    }, POST_SPEECH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [phase, isSpeaking, isThinking, isInterviewComplete, activeCodingQuestion, reset, start]);

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

    // Pause silence detection during coding mode — candidate is typing, not speaking
    if (activeCodingQuestion) {
      cancelSilenceAnim();
      return;
    }

    // Only start silence countdown when we have final (confirmed) transcript
    const finalText = transcript.trim();
    if (!finalText || lastFinalAt === 0) {
      cancelSilenceAnim();
      return;
    }

    // Check for immediate-action phrases on final text only
    if (isCompletionPhrase(finalText)) {
      handleSubmit();
      return;
    }
    if (isSkipCommand(finalText)) {
      handleSkip();
      return;
    }
    if (isEndCommand(finalText)) {
      handleSubmit();
      return;
    }

    // If there's active interim text, user is still speaking — don't start countdown
    if (interimTranscript.trim()) {
      cancelSilenceAnim();
      return;
    }

    // User has stopped speaking (no interim text, only final).
    // Start silence countdown from lastFinalAt.
    const timeout = currentQuestionIndex === 0 ? INTRO_SILENCE_TIMEOUT_MS : SILENCE_TIMEOUT_MS;

    const tick = () => {
      if (phaseRef.current !== "LISTENING") return;
      const elapsed = Date.now() - lastFinalAt;
      const progress = Math.min(100, (elapsed / timeout) * 100);
      setSilenceProgress(progress);

      if (elapsed >= timeout) {
        handleSubmit();
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
  }, [transcript, interimTranscript, lastFinalAt, phase, currentQuestionIndex, handleSubmit, handleSkip, cancelSilenceAnim]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 4: Interview completion — stop everything              */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!isInterviewComplete) return;
    setPhase("IDLE");
    disableViolations();
    cancel();
    stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (questionTimerRef.current) { clearInterval(questionTimerRef.current); questionTimerRef.current = null; }
    cancelSilenceAnim();
    processingStartRef.current = null;
    const t = setTimeout(() => onComplete(), 800);
    return () => clearTimeout(t);
  }, [isInterviewComplete, disableViolations, cancel, stop, onComplete, cancelSilenceAnim]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  EFFECT 5: PROCESSING timeout recovery                         */
  /*  If we're stuck in PROCESSING/thinking for too long,           */
  /*  force-recover to LISTENING so the interview doesn't freeze.   */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (phase !== "PROCESSING" && !isThinking) return;

    const checkStuck = setInterval(() => {
      if (phaseRef.current === "PROCESSING" && processingStartRef.current) {
        const elapsed = Date.now() - processingStartRef.current;
        if (elapsed > PROCESSING_TIMEOUT_MS) {
          console.warn("[InterviewRoom] Stuck in PROCESSING for", elapsed, "ms — force-recovering to LISTENING");
          processingStartRef.current = null;
          isSubmittingRef.current = false;
          setPhase("LISTENING");
          reset();
          start();
        }
      }
    }, 5000);

    return () => clearInterval(checkStuck);
  }, [phase, isThinking, reset, start]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  Track answered count from question index changes              */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const aiMsgs = messages.filter((m) => m.role === "ai");
    if (aiMsgs.length === 0) return;
    const qi = aiMsgs[aiMsgs.length - 1].questionIndex ?? 0;
    if (qi > lastQuestionIndexRef.current) {
      if (lastQuestionIndexRef.current > 0) setAnsweredCount((c) => c + 1);
      lastQuestionIndexRef.current = qi;
    }
  }, [messages]);

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
          // Time's up — auto-skip
          if (questionTimerRef.current) clearInterval(questionTimerRef.current);
          questionTimerRef.current = null;
          // Trigger skip (must be async, fire-and-forget from interval)
          if (phaseRef.current === "LISTENING") {
            // Use setTimeout(0) to avoid calling setState during render cycle
            setTimeout(() => {
              if (phaseRef.current === "LISTENING" && !isSubmittingRef.current) {
                handleSkip();
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
  }, [currentQuestionIndex, autoSkipTimeout, handleSkip]);

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
                handleSkip();
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
  }, [phase, autoSkipTimeout, currentQuestionIndex, questionTimeLeft, handleSkip]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  Violation modal                                               */
  /* ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (lastViolation) setShowViolationModal(true);
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
      }
    };
    videoTrack.addEventListener("ended", handleEnded);
    return () => videoTrack.removeEventListener("ended", handleEnded);
  }, [screenStream, stop, cancel]);

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
      setActiveCodingQuestion(null); // Close editor
      // Submit code + get AI response
      const codeContext =
        `[CODE SUBMISSION] Language: ${language} | ` +
        `Tests: ${testResult.passed}/${testResult.total} passed\n` +
        `\`\`\`${language}\n${code}\n\`\`\``;
      await onSendMessage(codeContext);
    },
    [onSendMessage]
  );

  const handleCodeClose = useCallback(() => {
    setActiveCodingQuestion(null);
  }, []);

  const handleEndInterview = useCallback(() => {
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
  const handlePipMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
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
    const onUp = () => {
      pipDragRef.current.dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  /* ── Status indicator ── */
  const statusLabel = phase === "PROCESSING" || isThinking
    ? { text: "Alex is thinking…", color: "text-blue-400", dot: "bg-blue-400" }
    : phase === "SPEAKING" || isSpeaking
    ? { text: "Alex is speaking…", color: "text-purple-400", dot: "bg-purple-400" }
    : phase === "LISTENING"
    ? { text: "Listening… (pause to submit)", color: "text-green-400", dot: "bg-green-400" }
    : { text: messages.length === 0 ? "Starting interview…" : "Preparing…", color: "text-gray-500", dot: "bg-gray-500" };

  /* ── Live transcript text (final + interim) ── */
  const liveText = phase === "LISTENING"
    ? (transcript + " " + interimTranscript).trim()
    : "";

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDER                                                        */
  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      {/* ── Header Bar ── */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-gray-900/95 border-b border-gray-800 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-xs font-mono bg-gray-800 px-2.5 py-1 rounded">
              {formatTime(elapsedSeconds)}
            </span>
          </div>
          <div className="h-4 w-px bg-gray-700" />
          <span className="text-gray-300 text-sm font-medium">{jobConfig.title}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Question progress */}
          <div className="flex items-center gap-1.5 bg-gray-800/80 px-3 py-1.5 rounded-lg">
            <span className="text-blue-400 text-xs font-bold">{answeredCount}</span>
            <span className="text-gray-600 text-xs">/</span>
            <span className="text-gray-400 text-xs">{jobConfig.max_questions}</span>
            <span className="text-gray-500 text-[10px] ml-1 uppercase tracking-wide">Questions</span>
          </div>

          {/* Per-question countdown timer */}
          {autoSkipTimeout > 0 && questionTimeLeft > 0 && currentQuestionIndex > 0 && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${
              questionTimeLeft <= 10
                ? "bg-red-950/50 border border-red-900/50 text-red-400"
                : questionTimeLeft <= 30
                ? "bg-amber-950/50 border border-amber-900/50 text-amber-400"
                : "bg-gray-800/80 text-gray-300"
            }`}>
              <span className="font-bold">{formatTime(questionTimeLeft)}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-70">left</span>
            </div>
          )}

          {violationCount > 0 && (
            <div className="flex items-center gap-1 text-red-400 text-xs bg-red-950/50 border border-red-900/50 px-2.5 py-1 rounded-lg">
              <span className="font-semibold">{violationCount}</span>
              <span>violation{violationCount !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Skip Question button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5 border-gray-600 text-gray-300 hover:bg-gray-800"
            onClick={handleSkip}
            disabled={phase !== "LISTENING" || isInterviewComplete}
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </Button>

          <Button
            variant="destructive"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5 bg-red-600/90 hover:bg-red-600 border border-red-500/30"
            onClick={() => setShowEndConfirm(true)}
          >
            <PhoneOff className="w-3.5 h-3.5" />
            End Interview
          </Button>
        </div>
      </div>

      {/* ── Main Content: Avatar Left | Chat/Code Right ── */}
      <div id="interview-main" className="flex flex-1 overflow-hidden relative">
        {/* ── Left: Avatar Panel (shrinks when coding) ── */}
        <div className={`flex flex-col bg-gradient-to-b from-gray-900 via-gray-925 to-gray-950 border-r border-gray-800 transition-all duration-300 ${
          activeCodingQuestion ? "w-[25%]" : "w-[45%]"
        }`}>
          <div className="flex-1 relative">
            {jobConfig.virtual_avatar ? (
              <AvatarScene isSpeaking={isSpeaking} isThinking={isThinking} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-3xl">
                  AI
                </div>
              </div>
            )}

            {/* AI Status overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-950/90 to-transparent pt-10 pb-4 px-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                  AI
                </div>
                <div>
                  <p className="text-white text-sm font-semibold leading-tight">Alex</p>
                  <p className="text-gray-400 text-[11px]">AI Interviewer</p>
                </div>
                {isSpeaking && (
                  <div className="ml-auto flex items-center gap-1">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="w-0.5 bg-blue-400 rounded-full animate-pulse"
                        style={{
                          height: `${8 + Math.random() * 12}px`,
                          animationDelay: `${i * 0.1}s`,
                          animationDuration: `${0.4 + Math.random() * 0.3}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {!isInterviewComplete && (
                <div className={`flex items-center gap-2 ${statusLabel.color} text-xs`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${statusLabel.dot}`} />
                  {statusLabel.text}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Code Editor (when coding question active) OR Chat Panel ── */}
        {activeCodingQuestion ? (
          <div className="flex-1 flex flex-col min-w-0">
            <CodeEditor
              question={activeCodingQuestion}
              sessionId={sessionId}
              onSubmit={handleCodeSubmit}
              onClose={handleCodeClose}
              apiBase={API_BASE}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-gray-950 min-w-0">
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-white text-sm font-semibold">Interview Chat</h3>
                <p className="text-gray-500 text-[11px]">Live conversation transcript</p>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                phase === "LISTENING"
                  ? "bg-green-950/50 border border-green-800/50 text-green-400"
                  : "bg-gray-800/50 border border-gray-700/50 text-gray-500"
              }`}>
                {phase === "LISTENING" ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                {phase === "LISTENING" ? "Mic Active" : "Mic Off"}
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-hidden px-4 py-3 min-h-0">
              <TranscriptPanel
                messages={messages}
                isThinking={isThinking}
                liveTranscript={liveText}
              />
            </div>

            {/* Per-question timeout progress bar */}
            {autoSkipTimeout > 0 && questionTimeLeft > 0 && currentQuestionIndex > 0 && phase === "LISTENING" && (
              <div className="mx-4 mb-1 shrink-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-gray-500">Time remaining</span>
                  <span className={`text-[10px] font-mono ${questionTimeLeft <= 10 ? "text-red-400" : "text-gray-400"}`}>
                    {formatTime(questionTimeLeft)}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 linear ${
                      questionTimeLeft <= 10 ? "bg-red-500" : questionTimeLeft <= 30 ? "bg-amber-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${(questionTimeLeft / autoSkipTimeout) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Silence countdown progress bar */}
            {phase === "LISTENING" && silenceProgress > 0 && (
              <div className="mx-4 mb-1 h-1 bg-gray-800 rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${silenceProgress}%`, transition: "width 100ms linear" }}
                />
              </div>
            )}

            {/* Live transcript bar */}
            {phase === "LISTENING" && liveText && (
              <div className="mx-4 mb-3 px-4 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-xl shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0" />
                  <p className="text-gray-300 text-sm truncate">{liveText}</p>
                </div>
              </div>
            )}

            {/* Voice not supported warning */}
            {!isSupported && (
              <div className="mx-4 mb-3 px-3 py-2 bg-yellow-950/30 border border-yellow-800/30 rounded-lg shrink-0">
                <p className="text-yellow-400 text-xs">Voice recognition not supported in this browser.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Draggable Webcam PIP ── */}
        {webcamStream && (
          <div
            className="absolute z-20 rounded-xl overflow-hidden border-2 border-gray-700/80 shadow-2xl shadow-black/50 cursor-move group"
            style={{
              left: pipPos.x,
              top: pipPos.y,
              width: 192,
              height: 144,
            }}
            onMouseDown={handlePipMouseDown}
          >
            <WebcamMini stream={webcamStream} />
            <div className="absolute top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="w-4 h-4 text-white/60" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent py-1.5 px-2">
              <p className="text-white text-[10px] font-medium">You</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Violation Modal ── */}
      {showViolationModal && lastViolation && (
        <ViolationModal
          violationType={lastViolation}
          violationCount={violationCount}
          threshold={VIOLATION_THRESHOLD}
          onDismiss={() => setShowViolationModal(false)}
        />
      )}

      {/* ── Screen Share Lost Modal ── */}
      {showScreenShareModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full mx-4 border border-gray-700 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-amber-900/40 flex items-center justify-center mx-auto mb-4">
              <Monitor className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-white font-semibold text-lg text-center mb-2">Screen Share Stopped</h3>
            <p className="text-gray-400 text-sm text-center mb-6">
              Your screen sharing has stopped. The interview is paused until you resume sharing your entire screen.
            </p>
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700"
              onClick={async () => {
                try {
                  const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { displaySurface: "monitor" } as any,
                    audio: false,
                  });
                  setShowScreenShareModal(false);
                  void stream;
                } catch {
                  // User denied — keep modal open
                }
              }}
            >
              Share Screen Again
            </Button>
          </div>
        </div>
      )}

      {/* ── End Interview Confirmation ── */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full mx-4 border border-gray-700 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-900/40 flex items-center justify-center mx-auto mb-4">
              <PhoneOff className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="text-white font-semibold text-lg text-center mb-2">End Interview?</h3>
            <p className="text-gray-400 text-sm text-center mb-6">
              This will immediately stop the interview and submit your session for evaluation.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
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
            </div>
          </div>
        </div>
      )}
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
