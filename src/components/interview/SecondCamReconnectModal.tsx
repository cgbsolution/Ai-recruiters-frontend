"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PhoneOff, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { API_BASE, sessionTokenHeader } from "@/lib/api";

const RECONNECT_TIMEOUT = 300; // 5 minutes

interface Props {
  sessionId: number;
  disconnectedSeconds: number;
}

export default function SecondCamReconnectModal({ sessionId, disconnectedSeconds }: Props) {
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  // Fetch the pairing code for this session so candidate can reconnect
  useEffect(() => {
    (async () => {
      try {
        // init endpoint returns existing code if already created
        const res = await fetch(`${API_BASE}/secondary-cam/${sessionId}/init`, {
          method: "POST",
          headers: sessionTokenHeader(),
        });
        if (res.ok) {
          const data = await res.json();
          setPairingCode(data.pairing_code);
        }
      } catch { /* best effort */ }
    })();
  }, [sessionId]);

  const remaining = Math.max(0, RECONNECT_TIMEOUT - disconnectedSeconds);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = Math.min(100, (disconnectedSeconds / RECONNECT_TIMEOUT) * 100);

  const qrUrl = pairingCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/secondary-cam/connect/${pairingCode}`
    : "";

  return (
    <AlertDialog open>
      <AlertDialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <AlertDialogHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-red-900/40 flex items-center justify-center mx-auto mb-2">
            <PhoneOff className="w-6 h-6 text-red-400" />
          </div>
          <AlertDialogTitle className="text-white font-semibold text-lg">
            Secondary Camera Disconnected
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400 text-sm" asChild>
            <div>
              {remaining > 0 ? (
                <p>
                  Please reconnect your phone within{" "}
                  <span className="text-white font-semibold">
                    {minutes}:{seconds.toString().padStart(2, "0")}
                  </span>{" "}
                  to continue the interview.
                </p>
              ) : (
                <p className="text-red-400">
                  Reconnection time expired. Please reconnect to continue.
                </p>
              )}

              {/* Progress bar */}
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-3">
                <div
                  className="bg-red-500 h-1.5 rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* QR Code for reconnection */}
              {pairingCode && (
                <div className="mt-4 flex flex-col items-center">
                  <p className="text-xs text-gray-500 mb-2">
                    Scan this QR code with your phone to reconnect:
                  </p>
                  <div className="p-2 bg-white rounded-lg">
                    <QRCodeSVG value={qrUrl} size={120} level="M" />
                  </div>
                </div>
              )}

              {!pairingCode && (
                <div className="mt-4 flex items-center justify-center gap-2 text-gray-500 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading reconnect code...
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}
