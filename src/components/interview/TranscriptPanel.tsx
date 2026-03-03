"use client";

import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import type { Message } from "@/hooks/interview/useInterviewSession";

interface Props {
  messages: Message[];
  isThinking: boolean;
  liveTranscript: string;
}

export default function TranscriptPanel({ messages, isThinking, liveTranscript }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking, liveTranscript]);

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1 pb-2">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex gap-3 ${msg.role === "candidate" ? "flex-row-reverse" : "flex-row"}`}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
              msg.role === "ai" ? "bg-blue-700" : "bg-gray-700"
            }`}
          >
            {msg.role === "ai" ? (
              <Bot className="w-4 h-4 text-white" />
            ) : (
              <User className="w-4 h-4 text-white" />
            )}
          </div>
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "ai"
                ? "bg-blue-900/30 text-gray-200 rounded-tl-none"
                : "bg-gray-800 text-gray-200 rounded-tr-none"
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {/* Live transcript (candidate speaking) */}
      {liveTranscript && (
        <div className="flex gap-3 flex-row-reverse">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-gray-800/60 text-gray-400 rounded-tr-none italic">
            {liveTranscript}
            <span className="animate-pulse">|</span>
          </div>
        </div>
      )}

      {/* AI thinking indicator */}
      {isThinking && (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="bg-blue-900/30 rounded-2xl rounded-tl-none px-4 py-3">
            <div className="flex gap-1 items-center h-5">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
