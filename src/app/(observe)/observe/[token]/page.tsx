"use client";

import { useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useObserverSubscriber, type CodingSubmissionPayload } from "@/hooks/interview/useObserverSubscriber";
import { useObserverFrameReceiver } from "@/hooks/interview/useObserverFrameReceiver";
import AvatarScene from "@/components/interview/AvatarScene";
import VoiceVisualizer, { type VoiceMode } from "@/components/interview/VoiceVisualizer";

function CandidateFrame({
  frameUrl,
  frameCount,
  ready,
}: {
  frameUrl: string | null;
  frameCount: number;
  ready: boolean;
}) {
  if (!ready || !frameUrl || frameCount === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
        {ready ? "Waiting for candidate frames…" : "Connecting to candidate video…"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frameUrl}
      alt="Candidate live"
      className="absolute inset-0 w-full h-full object-cover bg-black"
    />
  );
}

function SpeakingBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-1 h-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-1 rounded-sm bg-purple-400 transition-all duration-150 ${
            active ? "animate-pulse" : "opacity-40"
          }`}
          style={{
            height: active ? `${40 + ((i * 17) % 60)}%` : "30%",
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium transition ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-800 text-gray-400 border border-gray-700"
      }`}
    >
      {label}
    </span>
  );
}

function formatTimestamp(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function MessageBubble({
  role,
  content,
  createdAt,
  candidateName,
}: {
  role: "ai" | "candidate";
  content: string;
  createdAt?: string | null;
  candidateName: string;
}) {
  const isCode = role === "candidate" && content.startsWith("[CODE SUBMISSION]");
  let header: string | null = null;
  let body = content;
  if (isCode) {
    const firstFence = content.indexOf("```");
    header = firstFence > 0 ? content.slice(0, firstFence).trim() : "[CODE SUBMISSION]";
    body = firstFence > 0 ? content.slice(firstFence) : content;
  }
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`text-xs font-semibold ${
            role === "ai" ? "text-purple-400" : "text-blue-400"
          }`}
        >
          {role === "ai" ? "◆ Nira" : `◆ ${candidateName}`}
        </span>
        <span className="text-[11px] text-gray-500">{formatTimestamp(createdAt)}</span>
        {isCode && (
          <span className="text-[10px] uppercase tracking-wide bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
            Code submission
          </span>
        )}
      </div>
      {isCode && header && (
        <div className="text-xs text-amber-200 mb-1 whitespace-pre-wrap">{header}</div>
      )}
      <div
        className={
          isCode
            ? "text-[12px] leading-relaxed font-mono whitespace-pre-wrap bg-gray-950 border border-gray-800 rounded p-3 text-gray-200 overflow-x-auto"
            : `text-sm leading-relaxed whitespace-pre-wrap ${
                role === "ai" ? "text-gray-200" : "text-gray-300"
              }`
        }
      >
        {body}
      </div>
    </div>
  );
}

function CodingPanel({ coding }: { coding: CodingSubmissionPayload }) {
  return (
    <div className="rounded-xl bg-gray-900 border border-amber-700/40 p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-amber-300 font-semibold">
            Coding challenge
          </span>
          {coding.difficulty && (
            <span className="text-[10px] uppercase tracking-wide bg-amber-700/30 text-amber-200 px-1.5 py-0.5 rounded">
              {coding.difficulty}
            </span>
          )}
          {coding.language && (
            <span className="text-[10px] bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded">
              {coding.language}
            </span>
          )}
        </div>
        {typeof coding.test_cases_total === "number" && (coding.test_cases_total ?? 0) > 0 && (
          <span className="text-[11px] text-gray-400">
            Tests passed: <span className="text-white font-semibold">{coding.test_cases_passed ?? 0} / {coding.test_cases_total}</span>
          </span>
        )}
      </div>
      {coding.title && (
        <div className="text-sm font-semibold text-white mb-1">{coding.title}</div>
      )}
      {coding.description && (
        <div className="text-xs text-gray-400 whitespace-pre-wrap mb-2">{coding.description}</div>
      )}
      {coding.code && (
        <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap bg-gray-950 border border-gray-800 rounded p-3 text-gray-200 max-h-64 overflow-auto">
          {coding.code}
        </pre>
      )}
    </div>
  );
}

export default function ObserverPage() {
  const params = useParams();
  const token = (params?.token as string) || null;

  const {
    info, state, messages,
    aiSpeaking, phase, errorMessage, latestCoding,
  } = useObserverSubscriber(token);

  // Live JPEG frames over WebSocket — works through any firewall, no TURN.
  const framesEnabled = phase !== "candidate_completed" && phase !== "revoked" && phase !== "error";
  const { frameUrl, state: frameState, frameCount } = useObserverFrameReceiver(token, framesEnabled);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, latestCoding]);

  const candidateSpeaking = useMemo(() => {
    if (aiSpeaking) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "candidate") return false;
    if (!last.created_at) return false;
    const ageMs = Date.now() - new Date(last.created_at).getTime();
    return ageMs < 6000;
  }, [messages, aiSpeaking]);

  const candidateName = info?.candidate.name ?? "Candidate";
  const jobTitle = info?.job.title ?? "Interview";
  const questionCount = state?.current_question_index ?? 0;
  const totalQuestions = state?.total_questions ?? 0;
  const sessionStatus = state?.status ?? null;
  const interviewMode = info?.interview_mode ?? "default";

  const voiceMode: VoiceMode = aiSpeaking
    ? "speaking"
    : candidateSpeaking
    ? "listening"
    : "idle";

  const banner = useMemo(() => {
    if (phase === "loading") return "Loading…";
    if (phase === "error") return errorMessage ?? "Something went wrong.";
    if (phase === "revoked") return errorMessage ?? "This observer link has been revoked.";
    if (phase === "waiting_for_candidate") return "Waiting for the candidate to start the interview…";
    if (phase === "candidate_completed") return "Interview has ended.";
    if (frameState === "open" && frameCount === 0) return "Connected — waiting for first frame…";
    if (frameState === "connecting") return "Connecting to live video…";
    if (frameState === "closed") return "Reconnecting to live video…";
    if (frameState === "no_session") return "Candidate session not active.";
    return null;
  }, [phase, errorMessage, frameState, frameCount]);

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        Loading observer view…
      </div>
    );
  }

  if (phase === "error" || phase === "revoked") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="max-w-md text-center px-6">
          <div className="text-red-400 text-lg font-semibold mb-2">
            {phase === "revoked" ? "Link revoked" : "Cannot open observer link"}
          </div>
          <p className="text-gray-400 text-sm">{errorMessage}</p>
        </div>
      </div>
    );
  }

  const aiVisualizer = (() => {
    if (interviewMode === "avatar") {
      return (
        <div className="relative rounded-xl overflow-hidden bg-[#eef0f8] border border-gray-800 aspect-square max-h-[420px]">
          <AvatarScene isSpeaking={aiSpeaking} isThinking={false} />
          {aiSpeaking && (
            <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/60 text-white rounded text-xs">
              <SpeakingBars active />
              <span>Nira is speaking…</span>
            </div>
          )}
        </div>
      );
    }
    if (interviewMode === "manual") {
      return (
        <div className="relative rounded-xl overflow-hidden bg-[#eef0f8] border border-gray-800 aspect-square max-h-[420px]">
          <VoiceVisualizer mode={voiceMode} micStream={null} ttsAudio={null} />
          <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/60 text-white rounded text-xs">
            <SpeakingBars active={aiSpeaking || candidateSpeaking} />
            <span>
              {aiSpeaking ? "Nira is speaking…" : candidateSpeaking ? "Candidate speaking…" : "Idle"}
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-800 aspect-square max-h-[420px]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-3xl">
            AI
          </div>
        </div>
        {aiSpeaking && (
          <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/60 text-white rounded text-xs">
            <SpeakingBars active />
            <span>Nira is speaking…</span>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-white">
      <header className="px-6 py-3 border-b border-gray-800 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
            {(info?.job.title || "I").charAt(0).toUpperCase()}
          </div>
          <span className="font-semibold">Observer · {jobTitle}</span>
        </div>
        <span className="text-xs px-2 py-1 bg-red-600/20 text-red-300 rounded-full font-medium border border-red-600/30">
          ● LIVE
        </span>
        <div className="ml-auto flex items-center gap-3 text-sm text-gray-400">
          <span>
            {questionCount} / {totalQuestions || "?"} QUESTIONS
          </span>
          {sessionStatus && (
            <span className="px-2 py-1 bg-gray-800 rounded text-xs uppercase tracking-wide">
              {sessionStatus.replace("_", " ")}
            </span>
          )}
        </div>
      </header>

      <div className="px-6 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <StatusPill active={aiSpeaking} label="AI speaking" />
        <StatusPill active={candidateSpeaking} label="Candidate answering" />
        <StatusPill active={(state?.violation_count ?? 0) > 0} label={`Violations (${state?.violation_count ?? 0})`} />
        {info?.code_editor_required && (
          <StatusPill active={!!latestCoding} label="Coding challenge" />
        )}
        {banner && (
          <span className="ml-auto text-xs text-amber-300 bg-amber-900/30 border border-amber-700/30 rounded px-2 py-1">
            {banner}
          </span>
        )}
      </div>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-hidden">
        <div className="md:col-span-1 flex flex-col gap-4 min-h-0">
          {/* Candidate live frames (JPEG over WebSocket) */}
          <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-800 aspect-video">
            <CandidateFrame
              frameUrl={frameUrl}
              frameCount={frameCount}
              ready={frameState === "open"}
            />
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-xs">
              {candidateName}
            </div>
            {candidateSpeaking && (
              <div className="absolute top-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/70 rounded text-xs">
                <SpeakingBars active />
                <span>Speaking…</span>
              </div>
            )}
            {frameCount > 0 && (
              <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 rounded text-[10px] text-gray-300">
                ~{frameCount > 50 ? "live" : `${frameCount} frames`}
              </div>
            )}
          </div>
          {aiVisualizer}
        </div>

        <div className="md:col-span-2 flex flex-col rounded-xl bg-gray-900 border border-gray-800 min-h-0">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="font-semibold">Live transcript</span>
            <span className="text-xs text-gray-500">Read-only</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {latestCoding && <CodingPanel coding={latestCoding} />}
            {messages.length === 0 && !latestCoding && (
              <div className="text-gray-500 text-sm text-center py-12">
                Transcript will appear here as the interview progresses.
              </div>
            )}
            {messages.map((m, idx) => (
              <MessageBubble
                key={m.id ?? idx}
                role={m.role}
                content={m.content}
                createdAt={m.created_at}
                candidateName={candidateName}
              />
            ))}
            <div ref={transcriptEndRef} />
          </div>
          <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500 flex items-center justify-between">
            <span>
              {aiSpeaking
                ? "Nira is speaking…"
                : candidateSpeaking
                ? "Candidate is answering…"
                : "Listening for next turn"}
            </span>
            <span>You are watching live · nothing is recorded by you</span>
          </div>
        </div>
      </main>

      <footer className="px-6 py-2 border-t border-gray-800 text-[11px] text-gray-500 text-center">
        Observer view · this is a private live link · do not share outside the hiring team
      </footer>
    </div>
  );
}
