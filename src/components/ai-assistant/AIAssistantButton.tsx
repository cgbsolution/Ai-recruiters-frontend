"use client";
import React from "react";
import { useAIAssistant } from "@/context/AIAssistantContext";
import { AIMascot } from "./AIMascot";
import { cn } from "@/lib/utils";

interface AIAssistantButtonProps {
  className?: string;
  /** Force compact (icon-only) presentation */
  compact?: boolean;
}

export function AIAssistantButton({ className, compact = false }: AIAssistantButtonProps) {
  const { openPanel, thinking, step } = useAIAssistant();
  const mascotState = step === "success" ? "success" : thinking ? "thinking" : "idle";

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label="Open AI Assistant"
      className={cn(
        "group relative h-11 shrink-0 overflow-hidden rounded-xl text-sm font-semibold text-white shadow-md transition-all duration-200",
        "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/30",
        "active:translate-y-0",
        compact ? "px-3" : "pl-2.5 pr-4",
        className,
      )}
    >
      {/* Subtle conic gradient border sweep */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />

      <span className="relative z-10 flex items-center gap-2">
        <AIMascot state={mascotState} size={compact ? 28 : 30} />
        {!compact && (
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
              Copilot
            </span>
            <span className="text-sm font-bold">AI Assistant</span>
          </span>
        )}
      </span>
    </button>
  );
}
