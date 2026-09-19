"use client";

import { Fragment, useEffect, useRef } from "react";
import type { Message } from "@/hooks/interview/useInterviewSession";

interface Props {
  messages: Message[];
  isThinking: boolean;
  liveTranscript: string;
  /** AI message whose feedback is being spoken — its question bubble appears
   *  only once the question itself is spoken, after a short pause. */
  pendingQuestionMsg?: Message | null;
}

function Entry({ role, text }: { role: Message["role"]; text: string }) {
  return (
    <div className="space-y-1.5">
      {/* Sender label */}
      <div className={`flex items-center gap-2 ${role === "candidate" ? "justify-end" : ""}`}>
        {role === "ai" && (
          <div className="flex items-center gap-1.5">
            <span className="text-red-500">✦</span>
            <span className="text-gray-800 text-xs font-semibold">Nira</span>
          </div>
        )}
        {role === "candidate" && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-blue-500" />
            <span className="text-gray-800 text-xs font-semibold">You</span>
          </div>
        )}
      </div>
      {/* Message content */}
      <div className={`${role === "candidate" ? "pl-4" : "pl-5"}`}>
        <p className="text-gray-700 text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

export default function TranscriptPanel({ messages, isThinking, liveTranscript, pendingQuestionMsg }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking, liveTranscript, pendingQuestionMsg]);

  return (
    <div className="h-full overflow-y-auto space-y-5 pr-1 pb-2 px-2">
      {messages.map((msg, i) => (
        <Fragment key={i}>
          {/* Feedback on the previous answer, then the question — separate bubbles */}
          {msg.role === "ai" && msg.feedback && <Entry role="ai" text={msg.feedback} />}
          {msg !== pendingQuestionMsg && <Entry role={msg.role} text={msg.content} />}
        </Fragment>
      ))}

      {/* Live transcript (candidate speaking) */}
      {liveTranscript && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-blue-500" />
            <span className="text-gray-800 text-xs font-semibold">You</span>
            <span className="text-gray-400 text-[10px]">(speaking)</span>
          </div>
          <div className="pl-5">
            <p className="text-gray-500 text-sm leading-relaxed italic">
              {liveTranscript}
              <span className="animate-pulse">|</span>
            </p>
          </div>
        </div>
      )}

      {/* AI thinking indicator */}
      {isThinking && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-red-500">✦</span>
            <span className="text-gray-800 text-xs font-semibold">Nira</span>
          </div>
          <div className="pl-5">
            <div className="flex gap-1.5 items-center h-5">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
