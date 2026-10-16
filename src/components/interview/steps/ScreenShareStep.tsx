"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Monitor, XCircle } from "lucide-react";
import { canCaptureSystemAudio } from "@/lib/browserCapabilities";
import { reportClientEvent } from "@/lib/clientTelemetry";
import { screenShareLooksBlack } from "@/lib/screenFrameCheck";

interface Props {
  onNext: (screenStream?: MediaStream) => void;
  required?: boolean;
  /** Only for telemetry, so a black-screen event can be tied to the interview. */
  sessionId?: number | null;
}

type ShareStatus = "idle" | "checking" | "granted" | "black_screen" | "denied" | "wrong_surface" | "no_audio";

// The fix for a black share differs by OS: on a Mac it is almost always the
// browser missing macOS's Screen Recording permission (it can start sharing,
// but macOS hands it black frames).
const isMac =
  typeof navigator !== "undefined" &&
  /Macintosh|Mac OS X/.test(navigator.userAgent) &&
  !/iPhone|iPad/.test(navigator.userAgent);

export default function ScreenShareStep({ onNext, required = false, sessionId = null }: Props) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [screenStream, setScreenStream] = useState<MediaStream | undefined>(undefined);

  const requestScreenShare = async () => {
    // Retrying after a black share: release the old one first.
    screenStream?.getTracks().forEach((t) => t.stop());
    setScreenStream(undefined);
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
      // Validate that system audio is included — required for recording.
      // ONLY enforced where the browser can actually deliver it: Firefox and
      // Safari cannot capture system audio at all, so requiring it there
      // trapped candidates in an unsatisfiable retry loop. On those browsers
      // we accept video-only and rely on the mic track in the recording mix.
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0 && canCaptureSystemAudio()) {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("no_audio");
        return;
      }
      // A share can be "granted" and still be solid black on some laptops —
      // the recording would then show nothing. Catch it here, while the
      // candidate can still fix it.
      setStatus("checking");
      const black = await screenShareLooksBlack(stream);
      setScreenStream(stream);
      if (black) {
        const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
        reportClientEvent({
          type: "screen_capture_black",
          message: "screen share is black at the pre-interview check",
          context: {
            sessionId,
            phase: "precheck",
            width: settings.width ?? null,
            height: settings.height ?? null,
            displaySurface: settings.displaySurface ?? null,
            trackMuted: track.muted,
          },
        });
        setStatus("black_screen");
        return;
      }
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
      <p className="text-gray-500 mb-4 max-w-sm text-sm">
        {required
          ? "This interview requires you to share your entire screen to ensure a fair environment Click on the screen share button below."
          : "Screen sharing is optional but helps ensure a fair interview environment."}
      </p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 w-full max-w-sm mb-6 text-left">
        <p className="text-blue-700 text-sm">
          <strong>Important:</strong> When the screen share dialog appears, please:
        </p>
        <ol className="text-blue-700 text-sm mt-1.5 list-decimal list-inside space-y-0.5">
          <li>Select the <strong>&quot;Entire Screen&quot;</strong> tab</li>
          <li>Turn ON <strong>&quot;Also share system audio&quot;</strong> toggle</li>
          <li>Click <strong>&quot;Share&quot;</strong></li>
        </ol>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 w-full max-w-sm mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-gray-700">
          <Monitor className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-sm">Screen Share</span>
        </div>
        {status === "granted" && <CheckCircle className="w-5 h-5 text-green-500" />}
        {status === "denied" && <XCircle className="w-5 h-5 text-red-500" />}
        {(status === "wrong_surface" || status === "no_audio" || status === "black_screen") && <AlertTriangle className="w-5 h-5 text-amber-500" />}
        {status === "checking" && <div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />}
        {status === "idle" && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
      </div>

      {status === "checking" && (
        <p className="text-gray-500 text-sm mb-5">Checking your screen share…</p>
      )}

      {status === "black_screen" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 w-full max-w-sm mb-5 text-left">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-amber-700 text-sm">
              <p className="font-semibold">Your shared screen is coming through completely black.</p>
              {isMac ? (
                <>
                  <p className="mt-1">Your Mac is blocking your browser from recording the screen. To fix it:</p>
                  <ol className="mt-1 list-decimal list-inside space-y-0.5">
                    <li>
                      Open <strong>System Settings → Privacy &amp; Security → Screen &amp; System Audio Recording</strong>{" "}
                      (called <strong>Screen Recording</strong> on older macOS).
                    </li>
                    <li>Turn it on for your browser (e.g. <strong>Google Chrome</strong>).</li>
                    <li>
                      Quit the browser completely (<strong>⌘Q</strong>), reopen it, and open your interview link again.
                    </li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="mt-1">This happens on some laptops. To fix it:</p>
                  <ol className="mt-1 list-decimal list-inside space-y-0.5">
                    <li>If you have more than one screen, click &quot;Try Again&quot; and pick the other one.</li>
                    <li>
                      Otherwise, in Chrome open <strong>Settings → System</strong>, turn off{" "}
                      <strong>&quot;Use graphics acceleration when available&quot;</strong>, click{" "}
                      <strong>Relaunch</strong>, and open your interview link again.
                    </li>
                  </ol>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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

      {status === "no_audio" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 w-full max-w-sm mb-5 text-left">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-amber-700 text-sm">
              <p className="font-semibold">System audio is required!</p>
              <p className="mt-1">
                Please click &quot;Try Again&quot; and make sure to turn ON the <strong>&quot;Also share system audio&quot;</strong> toggle at the bottom of the screen share dialog before clicking Share.
              </p>
            </div>
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

      {(status === "wrong_surface" || status === "no_audio" || status === "black_screen" || (status === "denied" && required)) && (
        <Button onClick={requestScreenShare} className="w-full max-w-sm h-12 bg-purple-600 hover:bg-purple-500 text-white rounded-xl mt-2">
          Try Again
        </Button>
      )}

      {/* Not a hard block: a candidate who can't fix their laptop still gets
          to interview, and the recording falls back to their camera. */}
      {status === "black_screen" && (
        <Button
          variant="ghost"
          onClick={() => onNext(screenStream)}
          className="w-full max-w-sm h-12 text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl mt-2"
        >
          Continue anyway
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
