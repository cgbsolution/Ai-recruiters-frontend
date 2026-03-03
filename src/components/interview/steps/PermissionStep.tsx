"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle, Mic, XCircle } from "lucide-react";

interface Props {
  onPermissionsGranted: (stream: MediaStream) => void;
}

export default function PermissionStep({ onPermissionsGranted }: Props) {
  const [camStatus, setCamStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [micStatus, setMicStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const requestPermissions = async () => {
    setLoading(true);
    setCamStatus("idle");
    setMicStatus("idle");

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, aspectRatio: { ideal: 4 / 3 }, facingMode: "user" },
        audio: true,
      });
      setStream(s);
      setCamStatus("granted");
      setMicStatus("granted");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCamStatus("denied");
        setMicStatus("denied");
      } else {
        // Try audio only
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
          setMicStatus("granted");
          setCamStatus("denied");
        } catch {
          setMicStatus("denied");
          setCamStatus("denied");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const allGranted = camStatus === "granted" && micStatus === "granted";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <h2 className="text-3xl font-bold text-white mb-2">Camera & Microphone</h2>
      <p className="text-gray-400 mb-10 max-w-sm">
        We need access to your camera and microphone to conduct the interview.
      </p>

      <div className="space-y-4 w-full max-w-sm mb-10">
        <PermissionRow
          icon={<Camera className="w-5 h-5" />}
          label="Camera"
          status={camStatus}
        />
        <PermissionRow
          icon={<Mic className="w-5 h-5" />}
          label="Microphone"
          status={micStatus}
        />
      </div>

      {!allGranted && (
        <Button
          onClick={requestPermissions}
          disabled={loading}
          className="w-full max-w-sm h-12 bg-blue-600 hover:bg-blue-700"
        >
          {loading ? "Requesting..." : "Allow Access"}
        </Button>
      )}

      {allGranted && stream && (
        <Button
          onClick={() => onPermissionsGranted(stream)}
          className="w-full max-w-sm h-12 bg-green-600 hover:bg-green-700"
        >
          Continue
        </Button>
      )}

      {(camStatus === "denied" || micStatus === "denied") && (
        <p className="text-red-400 text-sm mt-4 max-w-sm">
          Permission denied. Please allow access in your browser settings and refresh the page.
        </p>
      )}
    </div>
  );
}

function PermissionRow({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: "idle" | "granted" | "denied";
}) {
  return (
    <div className="flex items-center justify-between bg-gray-900 rounded-xl px-5 py-4">
      <div className="flex items-center gap-3 text-gray-300">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      {status === "granted" && <CheckCircle className="w-5 h-5 text-green-400" />}
      {status === "denied" && <XCircle className="w-5 h-5 text-red-400" />}
      {status === "idle" && <div className="w-5 h-5 rounded-full border-2 border-gray-600" />}
    </div>
  );
}
