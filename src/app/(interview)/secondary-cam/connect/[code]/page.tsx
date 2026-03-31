"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";

type SessionStatus = "loading" | "invalid" | "ready" | "connected" | "verified" | "active" | "disconnected";

export default function SecondaryCamConnectPage() {
  const params = useParams();
  const code = params.code as string;

  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Validate pairing code on mount
  useEffect(() => {
    const validate = async () => {
      try {
        const res = await fetch(`${API_BASE}/secondary-cam/connect/${code}`);
        if (res.status === 404) {
          setStatus("invalid");
          setError("Invalid or expired pairing code.");
          return;
        }
        if (res.status === 410) {
          setStatus("invalid");
          setError("This pairing code has expired. Please generate a new QR code from your interview.");
          return;
        }
        if (!res.ok) throw new Error("Connection failed");
        const data = await res.json();
        setJobTitle(data.job_title || "");

        if (data.status === "verified" || data.status === "active") {
          setStatus("active");
        } else {
          setStatus("ready");
        }
      } catch {
        setStatus("invalid");
        setError("Unable to connect. Please check your internet and try again.");
      }
    };
    validate();
  }, [code]);

  // Start camera when ready
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);

      // Register device
      const formData = new FormData();
      formData.append("device_info", JSON.stringify({
        userAgent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
        platform: navigator.platform,
      }));
      await fetch(`${API_BASE}/secondary-cam/connect/${code}/register`, {
        method: "POST",
        body: formData,
      });
      setStatus("connected");

      // Request wake lock to keep screen on
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake lock not supported — continue
      }
    } catch {
      setError("Camera permission denied. Please allow camera access and reload.");
    }
  }, [code]);

  // Heartbeat every 5s
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(async () => {
      try {
        await fetch(`${API_BASE}/secondary-cam/connect/${code}/heartbeat`, {
          method: "POST",
        });
      } catch {
        // Will retry on next interval
      }
    }, 5000);
  }, [code]);

  // Periodic snapshots every 30s
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
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.5)
      );
      if (!blob) return;

      const formData = new FormData();
      formData.append("snapshot", blob, "snap.jpg");
      try {
        await fetch(`${API_BASE}/secondary-cam/connect/${code}/snapshot`, {
          method: "POST",
          body: formData,
        });
      } catch {
        // Best-effort
      }
    }, 30000);
  }, [code]);

  // Confirm positioning
  const confirmPosition = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.7)
    );
    if (!blob) return;

    const formData = new FormData();
    formData.append("snapshot", blob, "position.jpg");

    try {
      const res = await fetch(`${API_BASE}/secondary-cam/connect/${code}/confirm-position`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setStatus("verified");
        startHeartbeat();
        startSnapshots();
      }
    } catch {
      setError("Failed to confirm position. Please try again.");
    }
  }, [code, startHeartbeat, startSnapshots]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (snapshotRef.current) clearInterval(snapshotRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  // ── Invalid/Error State ──
  if (status === "invalid") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Connection Failed</h1>
        <p className="text-gray-500 text-sm max-w-xs">{error}</p>
      </div>
    );
  }

  // ── Loading State ──
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-500 text-sm">Connecting to interview...</p>
      </div>
    );
  }

  // ── Camera Setup State ──
  if (status === "ready" && !cameraReady) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-4">
          <Camera className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Second Device Instructions</h1>
        {jobTitle && (
          <p className="text-gray-500 text-sm mb-4">Interview: {jobTitle}</p>
        )}
        <p className="text-gray-500 text-sm mb-6 max-w-xs leading-relaxed">
          Please familiarize yourself with the key instructions to ensure a smooth interview process.
        </p>
        <ol className="text-left text-sm text-gray-700 space-y-3 mb-8 max-w-xs">
          <li className="flex gap-2">
            <span className="font-semibold text-gray-400">1.</span>
            Ensure your browser has camera permissions enabled.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-gray-400">2.</span>
            Once your position is accurate, the primary device will update automatically.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-gray-400">3.</span>
            If disconnected, you&apos;ll be notified on the primary device with the next steps.
          </li>
        </ol>

        <label className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <input
            type="checkbox"
            id="ack-checkbox"
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          I have read the above mentioned requirements
        </label>

        <Button
          onClick={startCamera}
          className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-full text-sm font-semibold"
        >
          Next &rarr;
        </Button>
      </div>
    );
  }

  // ── Camera Active State (connected, awaiting position confirmation) ──
  if (status === "connected" && cameraReady) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        {/* Camera preview - full screen */}
        <div className="flex-1 relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {/* Positioning overlay guide */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-4 left-0 right-0 text-center">
              <p className="text-white text-xs bg-black/50 inline-block px-3 py-1.5 rounded-full">
                Position your phone so laptop screen &amp; keyboard are visible
              </p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-white rounded-t-2xl p-5 shadow-lg">
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Second Camera</span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                Connected <span className="w-2 h-2 rounded-full bg-green-500" />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Device Position</span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-orange-500">
                Confirm below <span className="w-2 h-2 rounded-full bg-orange-400" />
              </span>
            </div>
          </div>

          <Button
            onClick={confirmPosition}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-full text-sm font-semibold"
          >
            I&apos;ve Positioned My Phone Correctly
          </Button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // ── Verified / Active State (streaming during interview) ──
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      </div>

      {/* Status bar */}
      <div className="bg-white rounded-t-2xl p-5 shadow-lg">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Second Camera</span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
              Connected <span className="w-2 h-2 rounded-full bg-green-500" />
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Device Position</span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
              Verified <CheckCircle className="w-4 h-4" />
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center mt-3">
          Keep this page open during the interview. Do not close or switch apps.
        </p>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
