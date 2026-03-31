"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";

type Phase = "loading" | "invalid" | "instructions" | "camera" | "confirmed";

export default function SecondaryCamConnectPage() {
  const params = useParams();
  const code = params.code as string;

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [personDetected, setPersonDetected] = useState(false);
  const [screenDetected, setScreenDetected] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  // ── Validate pairing code on mount ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/secondary-cam/connect/${code}`);
        if (!res.ok) {
          setPhase("invalid");
          setError(res.status === 410 ? "Pairing code expired." : "Invalid pairing code.");
          return;
        }
        const data = await res.json();
        setJobTitle(data.job_title || "");

        if (data.status === "verified" || data.status === "active") {
          setPhase("camera");
          // Will auto-start camera via the effect below
        } else {
          setPhase("instructions");
        }
      } catch {
        setPhase("invalid");
        setError("Unable to connect. Check your internet.");
      }
    })();
  }, [code]);

  // ── Start camera when phase becomes "camera" ──
  useEffect(() => {
    if (phase !== "camera" && phase !== "confirmed") return;
    if (streamRef.current) return; // already started

    let cancelled = false;

    (async () => {
      try {
        // Try rear camera first, fallback to any camera
        // Use FRONT camera — shows candidate's face + laptop behind them
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          // Fallback — any available camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);

        // Register device
        const fd = new FormData();
        fd.append("device_info", JSON.stringify({
          userAgent: navigator.userAgent,
          screen: `${screen.width}x${screen.height}`,
        }));
        fetch(`${API_BASE}/secondary-cam/connect/${codeRef.current}/register`, {
          method: "POST",
          body: fd,
        }).catch(() => {});

        // Keep screen on
        if ("wakeLock" in navigator) {
          navigator.wakeLock.request("screen").catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setError("Camera permission denied. Allow camera access and tap Retry.");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [phase]);

  // ── Heartbeat every 3s (only when camera is active) ──
  useEffect(() => {
    if (!cameraActive) return;

    const send = () => {
      fetch(`${API_BASE}/secondary-cam/connect/${codeRef.current}/heartbeat`, {
        method: "POST",
      }).catch(() => {});
    };

    // Send first heartbeat immediately
    send();
    heartbeatRef.current = setInterval(send, 3000);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [cameraActive]);

  // ── Detect tab switch — stop heartbeat when hidden, restart when visible ──
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        // Tab hidden — stop heartbeat so desktop detects disconnect
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      } else {
        // Tab visible again — check if camera is still alive
        if (streamRef.current) {
          const tracks = streamRef.current.getVideoTracks();
          if (tracks.length === 0 || tracks[0].readyState === "ended") {
            // Camera was killed by OS — need to restart
            streamRef.current = null;
            setCameraActive(false);
            // Re-trigger camera start by toggling phase
            setPhase((prev) => prev === "confirmed" ? "confirmed" : "camera");
          } else {
            // Camera still alive — restart heartbeat
            setCameraActive(true); // triggers heartbeat effect
          }
        }

        // Reassign video srcObject (some mobile browsers lose it)
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ── Periodic snapshots every 30s (only when confirmed) ──
  useEffect(() => {
    if (phase !== "confirmed" || !cameraActive) return;

    snapshotRef.current = setInterval(async () => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (video.videoWidth === 0) return; // no video data yet
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.5));
      if (!blob) return;
      const fd = new FormData();
      fd.append("snapshot", blob, "snap.jpg");
      fetch(`${API_BASE}/secondary-cam/connect/${codeRef.current}/snapshot`, {
        method: "POST", body: fd,
      }).catch(() => {});
    }, 30000);

    return () => {
      if (snapshotRef.current) {
        clearInterval(snapshotRef.current);
        snapshotRef.current = null;
      }
    };
  }, [phase, cameraActive]);

  // ── Confirm position button handler ──
  const handleConfirm = async () => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.7));
    if (!blob) return;

    const fd = new FormData();
    fd.append("snapshot", blob, "position.jpg");
    try {
      const res = await fetch(`${API_BASE}/secondary-cam/connect/${code}/confirm-position`, {
        method: "POST", body: fd,
      });
      if (res.ok) setPhase("confirmed");
    } catch {
      setError("Failed to confirm. Try again.");
    }
  };

  // ── Real-time frame verification — detect person + laptop ──
  useEffect(() => {
    if (!cameraActive || phase === "confirmed") return;

    const verifyRef = { current: null as ReturnType<typeof setInterval> | null };

    verifyRef.current = setInterval(async () => {
      if (!canvasRef.current || !videoRef.current) return;
      const video = videoRef.current;
      if (video.videoWidth === 0) return;

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.4));
      if (!blob) return;

      const fd = new FormData();
      fd.append("frame", blob, "frame.jpg");
      try {
        const res = await fetch(`${API_BASE}/secondary-cam/connect/${codeRef.current}/verify-frame`, {
          method: "POST", body: fd,
        });
        if (res.ok) {
          const data = await res.json();
          setPersonDetected(data.person_detected);
          setScreenDetected(data.screen_detected);
        }
      } catch { /* retry next interval */ }
    }, 2500);

    return () => {
      if (verifyRef.current) clearInterval(verifyRef.current);
    };
  }, [cameraActive, phase]);

  // ── Poll session status — detect when interview ends on desktop ──
  useEffect(() => {
    if (phase !== "camera" && phase !== "confirmed") return;

    const checkSession = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/secondary-cam/connect/${codeRef.current}`);
        if (!res.ok) {
          // Session deleted or invalid — interview ended
          setSessionEnded(true);
          return;
        }
        const data = await res.json();
        if (data.status === "completed") {
          setSessionEnded(true);
        }
      } catch { /* retry */ }
    }, 5000);

    return () => clearInterval(checkSession);
  }, [phase]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (snapshotRef.current) clearInterval(snapshotRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ═══════════════════ RENDER ═══════════════════

  // Interview ended on desktop — show on phone too
  if (sessionEnded) {
    // Stop everything
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (snapshotRef.current) { clearInterval(snapshotRef.current); snapshotRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }

    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Interview Completed</h1>
        <p className="text-gray-500 text-sm max-w-xs">
          The interview session has ended. You can now close this page.
        </p>
      </div>
    );
  }

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

  if (phase === "instructions") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-5">
          <Camera className="w-7 h-7 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Second Device Instructions</h1>
        {jobTitle && <p className="text-gray-500 text-sm mb-4">Interview: {jobTitle}</p>}
        <p className="text-gray-500 text-sm mb-6 max-w-xs leading-relaxed">
          Please read the instructions below to ensure a smooth interview process.
        </p>
        <ol className="text-left text-sm text-gray-700 space-y-3 mb-8 max-w-xs">
          <li className="flex gap-2">
            <span className="font-semibold text-gray-400">1.</span>
            Allow camera permission when prompted. The front camera will be used.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-gray-400">2.</span>
            Place your phone on the side so both <strong>you and your laptop screen</strong> are visible in the camera.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-gray-400">3.</span>
            Once your position is accurate, the primary device will update automatically.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-gray-400">4.</span>
            Keep this page open during the entire interview. Do not switch tabs or close the app.
          </li>
        </ol>
        <Button
          onClick={() => setPhase("camera")}
          className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-full text-sm font-semibold"
        >
          Start Camera &rarr;
        </Button>
      </div>
    );
  }

  // Camera error
  if (error && !cameraActive) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <Camera className="w-12 h-12 text-red-400 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Camera Required</h1>
        <p className="text-gray-400 text-sm max-w-xs mb-6">{error}</p>
        <Button
          onClick={() => {
            setError("");
            streamRef.current = null;
            setCameraActive(false);
            // Re-trigger camera effect
            setPhase("instructions");
            setTimeout(() => setPhase("camera"), 100);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full"
        >
          Retry Camera Access
        </Button>
      </div>
    );
  }

  // ── Camera view ──
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ minHeight: "60vh" }}
        />

        {phase === "camera" && cameraActive && (
          <div className="absolute top-3 left-0 right-0 text-center">
            <p className="text-white text-xs bg-black/60 inline-block px-4 py-2 rounded-full">
              Make sure both you and your laptop screen are visible
            </p>
          </div>
        )}

        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Starting camera...</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-t-2xl p-5 shadow-lg">
        <div className="space-y-2.5 mb-4">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-700 font-medium">Second Camera</span>
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${cameraActive ? "text-green-600" : "text-orange-500"}`}>
              {cameraActive ? "Connected" : "Starting..."}
              <span className={`w-2.5 h-2.5 rounded-full ${cameraActive ? "bg-green-500" : "bg-orange-400 animate-pulse"}`} />
            </span>
          </div>

          {phase === "camera" && cameraActive && (
            <>
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${personDetected ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}>
                <span className="text-sm text-gray-700 font-medium">Person visible</span>
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${personDetected ? "text-green-600" : "text-orange-500"}`}>
                  {personDetected ? "Detected" : "Checking..."}
                  {personDetected ? <CheckCircle className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                </span>
              </div>
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${screenDetected ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}>
                <span className="text-sm text-gray-700 font-medium">Laptop screen visible</span>
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${screenDetected ? "text-green-600" : "text-orange-500"}`}>
                  {screenDetected ? "Detected" : "Checking..."}
                  {screenDetected ? <CheckCircle className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                </span>
              </div>
            </>
          )}

          {phase === "confirmed" && (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-green-200 bg-green-50">
              <span className="text-sm text-gray-700 font-medium">Position</span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-green-600">
                Verified <CheckCircle className="w-4 h-4" />
              </span>
            </div>
          )}
        </div>

        {phase === "camera" && cameraActive && (
          <Button
            onClick={handleConfirm}
            disabled={!personDetected || !screenDetected}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-full text-sm font-semibold"
          >
            {personDetected && screenDetected
              ? "Confirm Position"
              : "Waiting for person & laptop detection..."}
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
