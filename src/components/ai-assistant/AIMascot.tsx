"use client";
import React from "react";
import { Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type MascotState = "idle" | "thinking" | "success";

interface AIMascotProps {
  state?: MascotState;
  /** Size in px. Default 36. */
  size?: number;
  className?: string;
}

/**
 * Small AI mascot with 3 animation states:
 * - idle: gentle breathing glow
 * - thinking: pulsing ring + faster glow
 * - success: bounce + checkmark
 *
 * Uses pure CSS keyframes (no framer-motion dependency).
 */
export function AIMascot({ state = "idle", size = 36, className }: AIMascotProps) {
  const isThinking = state === "thinking";
  const isSuccess = state === "success";

  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Outer ping ring — only active when thinking */}
      {isThinking && (
        <span className="absolute inset-0 animate-ping rounded-full bg-purple-400/50" />
      )}

      {/* Soft glow halo — always present, faster when thinking */}
      <span
        className={cn(
          "absolute inset-0 rounded-full blur-md",
          isThinking
            ? "bg-gradient-to-br from-indigo-400 to-purple-500 opacity-70 animate-pulse"
            : isSuccess
            ? "bg-gradient-to-br from-emerald-400 to-green-500 opacity-70"
            : "bg-gradient-to-br from-indigo-400 to-purple-500 opacity-40 animate-mascot-breathe",
        )}
      />

      {/* Core disc */}
      <span
        className={cn(
          "relative z-10 flex h-full w-full items-center justify-center rounded-full text-white shadow-lg shadow-indigo-500/30 transition-colors duration-300",
          isSuccess
            ? "bg-gradient-to-br from-emerald-500 to-green-600 animate-mascot-bounce"
            : "bg-gradient-to-br from-indigo-500 to-purple-600",
        )}
      >
        {isSuccess ? (
          <Check style={{ width: size * 0.5, height: size * 0.5 }} />
        ) : (
          <Sparkles
            className={isThinking ? "animate-mascot-spin" : ""}
            style={{ width: size * 0.5, height: size * 0.5 }}
          />
        )}
      </span>

      <style jsx global>{`
        @keyframes mascot-breathe {
          0%, 100% { transform: scale(0.95); opacity: 0.35; }
          50% { transform: scale(1.08); opacity: 0.55; }
        }
        @keyframes mascot-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes mascot-bounce {
          0%, 100% { transform: scale(1); }
          30% { transform: scale(1.15); }
          60% { transform: scale(0.95); }
        }
        .animate-mascot-breathe { animation: mascot-breathe 3.2s ease-in-out infinite; }
        .animate-mascot-spin { animation: mascot-spin 2.4s linear infinite; }
        .animate-mascot-bounce { animation: mascot-bounce 0.6s ease-out; }
      `}</style>
    </span>
  );
}
