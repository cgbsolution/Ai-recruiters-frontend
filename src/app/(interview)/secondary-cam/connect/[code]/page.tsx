"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";

export default function SecondaryCamConnectPage() {
  const params = useParams();
  const code = params.code as string;

  const [phase, setPhase] = useState<"loading" | "invalid" | "camera" | "confirmed">("loading");
  const [error, setError] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Step 1: Validate code + auto-start camera ──
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Validate pairing code
      try {
        const res = await fetch(`${API_BASE}/secondary-cam/connect/${code}`);
        if (!res.ok) {
          setPhase("invalid");
          setError(res.status === 410
            ? "This pairing code has expired."
            : "Invalid pairing code.");
          return;
        }
        const data = await res.json();
        setJobTitle(data.job_title || "");

        // If already confirmed from a previous visit, go to confirmed
        if (data.status === "verified" || data.status === "active") {
          setPhase("confirmed");
          startCamera();
          return;
        }
      } catch {
        setPhase("invalid");
        setError("Unable to connect. Check your internet.");
        return;
      }

      if (cancelled) return;

      // Auto-start camera immediately
      setPhase("camera");
      await startCamera();
    };

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Start camera ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      // Wait for video element to be available
      const waitForVideo = () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          setCameraActive(true);
        } else {
          setTimeout(waitForVideo, 100);
        }
      };
      waitForVideo();

      // Register device with backend
      const formData = new FormData();
      formData.append("device_info", JSON.stringify({
        userAgent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
      }));
      await fetch(`${API_BASE}/secondary-cam/connect/${code}/register`, {
        method: "POST",
        body: formData,
      });

      // Start heartbeat immediately
      startHeartbeat();

      // Keep screen on
      try {
        if ("wakeLock" in navigator) {
          await navigator.wakeLock.request("screen");
        }
      } catch { /* not supported */ }
    } catch {
      setError("Camera permission denied. Please allow camera access and reload this page.");
    }
  }, [code]);

  // ── Heartbeat every 3s ──
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(async () => {
      try {
        await fetch(`${API_BASE}/secondary-cam/connect/${code}/heartbeat`, {
          method: "POST",
        });
      } catch { /* retry next interval */ }
    }, 3000);
  }, [code]);

  // ── Periodic snapshots every 30s ──
  const startSnapshots = useCallback(() => {
    if (snapshotRef.current) clearInterval(snapshotRef.current);
    snapshotRef.current = setInterval(async () => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.5));
      if (!blob) return;
      const fd = new FormData();
      fd.append("snapshot", blob, "snap.jpg");
      try {
        await fetch(`${API_BASE}/secondary-cam/connect/${code}/snapshot`, {
          method: "POST", body: fd,
        });
      } catch { /* best effort */ }
    }, 30000);
  }, [code]);

  // ── Confirm position ──
  const confirmPosition = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.7));
    if (!blob) return;

    const fd = new FormData();
    fd.append("snapshot", blob, "position.jpg");
    try {
      const res = await fetch(`${API_BASE}/secondary-cam/connect/${code}/confirm-position`, {
        method: "POST", body: fd,
      });
      if (res.ok) {
        setPhase("confirmed");
        startSnapshots();
      }
    } catch {
      setError("Failed to confirm position.");
    }
  }, [code, startSnapshots]);

  // ── Detect tab switch / visibility change ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // User switched away — camera might stop on mobile
        // Heartbeat will stop being sent, desktop will detect disconnection
      } else {
        // User came back — restart camera if needed
        if (streamRef.current) {
          const tracks = streamRef.current.getVideoTracks();
          if (tracks.length === 0 || tracks[0].readyState === "ended") {
            // Camera was killed by OS — restart
            startCamera();
          }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [startCamera]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (snapshotRef.current) clearInterval(snapshotRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── RENDER ──

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
        <p className="text-gray-400 text-sm">Connecting to interview...</p>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Connection Failed</h1>
        <p className="text-gray-400 text-sm max-w-xs">{error}</p>
      </div>
    );
  }

  if (error && !cameraActive) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <Camera className="w-12 h-12 text-red-400 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Camera Required</h1>
        <p className="text-gray-400 text-sm max-w-xs mb-6">{error}</p>
        <Button
          onClick={() => { setError(""); startCamera(); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full"
        >
          Retry Camera Access
        </Button>
      </div>
    );
  }

  // ── Camera view (both "camera" and "confirmed" phases) ──
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Camera preview */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ minHeight: "60vh" }}
        />

        {/* Overlay instruction */}
        {phase === "camera" && (
          <div className="absolute top-3 left-0 right-0 text-center">
            <p className="text-white text-xs bg-black/60 inline-block px-4 py-2 rounded-full">
              Position your phone so laptop screen &amp; keyboard are visible
            </p>
          </div>
        )}

        {/* Camera loading state */}
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Starting camera...</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="bg-white rounded-t-2xl p-5 shadow-lg safe-area-bottom">
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 font-medium">Second Camera</span>
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${cameraActive ? "text-green-600" : "text-orange-500"}`}>
              {cameraActive ? "Connected" : "Starting..."}
              <span className={`w-2.5 h-2.5 rounded-full ${cameraActive ? "bg-green-500" : "bg-orange-400 animate-pulse"}`} />
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 font-medium">Device Position</span>
            {phase === "confirmed" ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-green-600">
                Verified <CheckCircle className="w-4 h-4" />
              </span>
            ) : (
              <span className="text-sm font-semibold text-orange-500">
                Confirm below
              </span>
            )}
          </div>
        </div>

        {phase === "camera" && cameraActive && (
          <Button
            onClick={confirmPosition}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-full text-sm font-semibold"
          >
            I&apos;ve Positioned My Phone Correctly
          </Button>
        )}

        {phase === "confirmed" && (
          <p className="text-xs text-gray-400 text-center">
            Keep this page open during the interview. Do not close or switch apps.
          </p>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
