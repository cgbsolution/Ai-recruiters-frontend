"use client";

import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ViolationType } from "@/hooks/interview/useViolationDetection";

interface Props {
  violationType: ViolationType;
  violationCount: number;
  threshold: number;
  onDismiss: () => void;
}

const MESSAGES: Record<ViolationType, { title: string; desc: string }> = {
  tab_switch: {
    title: "Tab Switch Detected",
    desc: "You navigated away from the interview window. Please stay focused on this tab.",
  },
  fullscreen_exit: {
    title: "Fullscreen Exited",
    desc: "You exited fullscreen mode. Please return to fullscreen to continue.",
  },
  face_not_detected: {
    title: "Face Not Detected",
    desc: "Your face is not visible in the camera. Please ensure you are properly framed.",
  },
  multiple_faces: {
    title: "Multiple Faces Detected",
    desc: "More than one person is visible. Only the candidate should be in frame.",
  },
};

export default function ViolationModal({ violationType, violationCount, threshold, onDismiss }: Props) {
  const { title, desc } = MESSAGES[violationType] || {
    title: "Violation Detected",
    desc: "A potential cheating violation has been recorded.",
  };

  const remaining = threshold - violationCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-red-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-red-400 text-sm font-medium">
              Violation {violationCount} of {threshold}
            </p>
          </div>
        </div>

        <p className="text-gray-300 text-sm mb-6 leading-relaxed">{desc}</p>

        <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3 mb-6">
          {remaining > 0 ? (
            <p className="text-yellow-400 text-sm text-center">
              <span className="font-bold">{remaining} more violation{remaining !== 1 ? "s" : ""}</span> will automatically terminate your interview.
            </p>
          ) : (
            <p className="text-red-400 text-sm text-center font-bold">
              Your interview has been terminated due to excessive violations.
            </p>
          )}
        </div>

        {remaining > 0 && (
          <Button
            onClick={onDismiss}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700"
          >
            I Understand, Continue
          </Button>
        )}
      </div>
    </div>
  );
}
