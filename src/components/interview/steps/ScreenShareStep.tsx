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
        audio: true,
      });
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings() as any;
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
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center mb-6">
        <Monitor className="w-8 h-8 text-purple-500" />
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">Screen Sharing</h2>
      <p className="text-gray-500 mb-8 max-w-sm text-sm">
        {required
          ? "This interview requires you to share your entire screen to ensure a fair environment."
          : "Screen sharing is optional but helps ensure a fair interview environment."}
      </p>

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 w-full max-w-sm mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-gray-700">
          <Monitor className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-sm">Screen Share</span>
        </div>
        {status === "granted" && <CheckCircle className="w-5 h-5 text-green-500" />}
        {status === "denied" && <XCircle className="w-5 h-5 text-red-500" />}
        {status === "wrong_surface" && <AlertTriangle className="w-5 h-5 text-amber-500" />}
        {status === "idle" && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
      </div>

      {status === "wrong_surface" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 w-full max-w-sm mb-5 text-left">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-amber-700 text-sm">
              Please select <strong>&quot;Entire Screen&quot;</strong> instead of a specific window or browser tab.
            </p>
          </div>
        </div>
      )}

      {status === "denied" && required && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 w-full max-w-sm mb-5 text-left">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-red-700 text-sm">Screen sharing is required. Click &quot;Try Again&quot; and allow your entire screen.</p>
          </div>
        </div>
      )}

      {status === "idle" && (
        <div className="flex flex-col gap-3 w-full max-w-sm mt-2">
          <Button onClick={requestScreenShare} className="h-12 bg-purple-600 hover:bg-purple-500 text-white rounded-xl">
            Share Screen
          </Button>
          {!required && (
            <Button variant="ghost" onClick={() => onNext(undefined)} className="h-12 text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl">
              Skip for now
            </Button>
          )}
        </div>
      )}

      {status === "granted" && (
        <Button onClick={() => onNext(screenStream)} className="w-full max-w-sm h-12 bg-green-600 hover:bg-green-500 text-white rounded-xl mt-2">
          Continue
        </Button>
      )}

      {(status === "wrong_surface" || (status === "denied" && required)) && (
        <Button onClick={requestScreenShare} className="w-full max-w-sm h-12 bg-purple-600 hover:bg-purple-500 text-white rounded-xl mt-2">
          Try Again
        </Button>
      )}

      {status === "denied" && !required && (
        <Button onClick={() => onNext(undefined)} className="w-full max-w-sm h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl mt-2 border border-gray-200">
          Continue without Screen Share
        </Button>
      )}
    </div>
  );
}
