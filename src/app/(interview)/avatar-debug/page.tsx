"use client";

import { useState } from "react";
import AvatarCanvas from "@/components/interview/AvatarCanvas";

export default function AvatarDebugPage() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Avatar viewport */}
      <div className="flex-1 relative">
        <AvatarCanvas isSpeaking={isSpeaking} isThinking={isThinking} />
      </div>

      {/* Controls panel */}
      <div className="w-72 bg-gray-900 border-l border-gray-800 p-5 flex flex-col gap-5">
        <h2 className="text-white text-lg font-bold">Avatar Debug</h2>
        <p className="text-gray-500 text-xs">
          Toggle states to test animations.
        </p>

        <div className="flex flex-col gap-3">
          {/* Speaking toggle */}
          <button
            onClick={() => { setIsSpeaking((v) => !v); if (!isSpeaking) setIsThinking(false); }}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              isSpeaking
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {isSpeaking ? "Speaking ON" : "Speaking OFF"}
          </button>

          {/* Thinking toggle */}
          <button
            onClick={() => { setIsThinking((v) => !v); if (!isThinking) setIsSpeaking(false); }}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              isThinking
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {isThinking ? "Thinking ON" : "Thinking OFF"}
          </button>

          {/* Idle (reset both) */}
          <button
            onClick={() => { setIsSpeaking(false); setIsThinking(false); }}
            className="px-4 py-3 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Reset to Idle
          </button>
        </div>

        <div className="border-t border-gray-800 pt-4 mt-auto">
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Current State</h3>
          <div className="flex flex-col gap-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Speaking</span>
              <span className={isSpeaking ? "text-purple-400" : "text-gray-600"}>{isSpeaking ? "Active" : "Off"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Thinking</span>
              <span className={isThinking ? "text-blue-400" : "text-gray-600"}>{isThinking ? "Active" : "Off"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Mode</span>
              <span className="text-gray-300">
                {isSpeaking ? "Lip-sync + head motion" : isThinking ? "Brow + head tilt" : "Idle + blinking"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
