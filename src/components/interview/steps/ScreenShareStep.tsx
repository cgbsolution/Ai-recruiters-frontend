"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Monitor, XCircle } from "lucide-react";

interface Props {
  onNext: (screenStream?: MediaStream) => void;
  required?: boolean;
}

type ShareStatus = "idle" | "granted" | "denied" | "wrong_surface";

export default function ScreenShareStep({ onNext, required = false }: Props) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [screenStream, setScreenStream] = useState<MediaStream | undefined>(undefined);

  const requestScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" } as any,
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings() as any;

      // Check if entire screen was selected (not a window or tab)
      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("wrong_surface");
        return;
      }

      setScreenStream(stream);
      setStatus("granted");
    } catch {
      setStatus("denied");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-purple-700 flex items-center justify-center mb-8">
        <Monitor className="w-10 h-10 text-white" />
      </div>

      <h2 className="text-3xl font-bold text-white mb-2">Screen Sharing</h2>
      <p className="text-gray-400 mb-10 max-w-sm">
        {required
          ? "This interview requires you to share your entire screen to ensure a fair environment."
          : "Screen sharing is optional but helps ensure a fair interview environment."}
      </p>

      <div className="bg-gray-900 rounded-xl px-5 py-4 w-full max-w-sm mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-gray-300">
          <Monitor className="w-5 h-5" />
          <span className="font-medium">Screen Share</span>
        </div>
        {status === "granted" && <CheckCircle className="w-5 h-5 text-green-400" />}
        {status === "denied" && <XCircle className="w-5 h-5 text-red-400" />}
        {status === "wrong_surface" && <AlertTriangle className="w-5 h-5 text-amber-400" />}
        {status === "idle" && <div className="w-5 h-5 rounded-full border-2 border-gray-600" />}
      </div>

      {/* Wrong surface warning */}
      {status === "wrong_surface" && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-4 py-3 w-full max-w-sm mb-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-amber-300 text-sm text-left">
              Please select <strong>&quot;Entire Screen&quot;</strong> instead of a specific window or browser tab.
              This is required for the interview to proceed.
            </p>
          </div>
        </div>
      )}

      {/* Denied warning for required mode */}
      {status === "denied" && required && (
        <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 w-full max-w-sm mb-6">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-300 text-sm text-left">
              Screen sharing is required to proceed with the interview.
              Please click &quot;Try Again&quot; and allow access to your entire screen.
            </p>
          </div>
        </div>
      )}

      {/* Idle state */}
      {status === "idle" && (
        <div className="flex flex-col gap-3 w-full max-w-sm mt-4">
          <Button onClick={requestScreenShare} className="h-12 bg-purple-600 hover:bg-purple-700">
            Share Screen
          </Button>
          {!required && (
            <Button
              variant="ghost"
              onClick={() => onNext(undefined)}
              className="h-12 text-gray-400 hover:text-white"
            >
              Skip for now
            </Button>
          )}
        </div>
      )}

      {/* Granted — continue */}
      {status === "granted" && (
        <Button
          onClick={() => onNext(screenStream)}
          className="w-full max-w-sm h-12 bg-green-600 hover:bg-green-700 mt-4"
        >
          Continue
        </Button>
      )}

      {/* Wrong surface or denied — retry */}
      {(status === "wrong_surface" || (status === "denied" && required)) && (
        <Button
          onClick={requestScreenShare}
          className="w-full max-w-sm h-12 bg-purple-600 hover:bg-purple-700 mt-2"
        >
          Try Again
        </Button>
      )}

      {/* Denied in optional mode — skip */}
      {status === "denied" && !required && (
        <Button
          onClick={() => onNext(undefined)}
          className="w-full max-w-sm h-12 bg-gray-700 hover:bg-gray-600 mt-4"
        >
          Continue without Screen Share
        </Button>
      )}
    </div>
  );
}
