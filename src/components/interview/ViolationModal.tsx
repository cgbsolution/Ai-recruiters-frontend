"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    <AlertDialog open>
      <AlertDialogContent className="bg-gray-900 border-red-800 max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <AlertDialogTitle className="text-xl font-bold text-white">{title}</AlertDialogTitle>
              <p className="text-red-400 text-sm font-medium">
                Violation {violationCount} of {threshold}
              </p>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription className="text-gray-300 text-sm leading-relaxed">
          {desc}
        </AlertDialogDescription>

        <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
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
          <AlertDialogFooter className="flex-col gap-2">
            {violationType === "fullscreen_exit" && (
              <Button
                onClick={() => {
                  document.documentElement.requestFullscreen().catch(() => {});
                  onDismiss();
                }}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700"
              >
                Return to Fullscreen
              </Button>
            )}
            <Button
              onClick={onDismiss}
              variant={violationType === "fullscreen_exit" ? "outline" : "default"}
              className={violationType === "fullscreen_exit"
                ? "w-full h-12 border-gray-600 text-gray-300 hover:bg-gray-800"
                : "w-full h-12 bg-blue-600 hover:bg-blue-700"
              }
            >
              I Understand, Continue
            </Button>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
