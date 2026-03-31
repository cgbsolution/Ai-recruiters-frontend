"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Camera, CheckCircle, Loader2, Smartphone, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";

interface Props {
  sessionId: number;
  onVerified: () => void;
}

type PairingStatus = "pending" | "connected" | "verified" | "active" | "disconnected" | "completed";

export default function SecondaryCamStep({ sessionId, onVerified }: Props) {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [status, setStatus] = useState<PairingStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize pairing on mount
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${API_BASE}/secondary-cam/${sessionId}/init`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Failed to initialize pairing");
        const data = await res.json();
        setPairingCode(data.pairing_code);
        setStatus(data.status);
      } catch (err: any) {
        setError(err.message || "Failed to initialize secondary camera");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [sessionId]);

  // Poll for status updates
  useEffect(() => {
    if (!pairingCode || status === "verified" || status === "active") return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/secondary-cam/${sessionId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data.status);
      } catch {
        // Silently retry
      }
    };

    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pairingCode, sessionId, status]);

  // Auto-proceed when verified
  useEffect(() => {
    if (status === "verified" || status === "active") {
      if (pollRef.current) clearInterval(pollRef.current);
      // Small delay so user sees the green checkmarks
      const timer = setTimeout(() => onVerified(), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, onVerified]);

  const qrUrl = pairingCode
    ? `${window.location.origin}/secondary-cam/connect/${pairingCode}`
    : "";

  const checks = [
    {
      label: "Second device connected",
      done: status === "connected" || status === "verified" || status === "active",
      checking: status === "pending",
    },
    {
      label: "Camera active",
      done: status === "connected" || status === "verified" || status === "active",
      checking: status === "pending",
    },
    {
      label: "Position verified",
      done: status === "verified" || status === "active",
      checking: status === "connected",
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-500">Setting up secondary camera...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">Setup Error</h3>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 px-6 text-center max-w-2xl mx-auto">
      {/* Icon */}
      <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-5">
        <Camera className="w-7 h-7 text-blue-600" />
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Secondary Camera</h2>
      <p className="text-gray-500 text-sm mb-8 max-w-md leading-relaxed">
        To keep the interview process fair and secure, ensuring no unauthorized assistance{" "}
        <strong>Scan the QR Code</strong> using your mobile.
      </p>

      {/* Content: QR + Status */}
      <div className="flex flex-col md:flex-row items-center gap-8 w-full">
        {/* Left: Reference image + QR */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-52 h-36 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
            <div className="text-center p-4">
              <Smartphone className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Position phone behind you,<br />facing your laptop screen</p>
            </div>
          </div>

          {pairingCode && (
            <div className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
              <QRCodeSVG
                value={qrUrl}
                size={160}
                level="M"
                includeMargin
              />
            </div>
          )}
        </div>

        {/* Right: Status checklist */}
        <div className="flex-1 w-full md:w-auto">
          <div className="border border-gray-200 rounded-xl bg-white p-5">
            <h3 className="font-semibold text-gray-800 mb-4 text-left">Second Device Status</h3>
            <div className="space-y-3">
              {checks.map((check, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                    check.done
                      ? "bg-green-50 border-green-200"
                      : check.checking
                      ? "bg-gray-50 border-gray-200"
                      : "bg-yellow-50 border-yellow-200"
                  }`}
                >
                  <span className="text-sm font-medium text-gray-700">{check.label}</span>
                  {check.done ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : check.checking ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Waiting...</span>
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-orange-500">Checking</span>
                      <div className="w-4 h-4 rounded-full border-2 border-orange-300 border-t-transparent animate-spin" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Continue button (only when all verified) */}
          {(status === "verified" || status === "active") && (
            <Button
              onClick={onVerified}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-full text-sm font-semibold"
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
