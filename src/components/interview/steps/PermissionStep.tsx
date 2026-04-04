"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle, Mic, XCircle, ShieldCheck } from "lucide-react";

interface Props {
  onPermissionsGranted: (stream: MediaStream) => void;
  micOnly?: boolean;
}

export default function PermissionStep({ onPermissionsGranted, micOnly = false }: Props) {
  const [camStatus, setCamStatus] = useState<"idle" | "granted" | "denied">(micOnly ? "granted" : "idle");
  const [micStatus, setMicStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const requestPermissions = async () => {
    setLoading(true);
    setMicStatus("idle");
    if (!micOnly) setCamStatus("idle");
    try {
      const constraints: MediaStreamConstraints = micOnly
        ? { audio: true }
        : {
            video: { width: { ideal: 640 }, height: { ideal: 480 }, aspectRatio: { ideal: 4 / 3 }, facingMode: "user" },
            audio: true,
          };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      if (!micOnly) setCamStatus("granted");
      setMicStatus("granted");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        if (!micOnly) setCamStatus("denied");
        setMicStatus("denied");
      } else {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setStream(audioStream);
          setMicStatus("granted");
          if (!micOnly) setCamStatus("denied");
        } catch {
          setMicStatus("denied");
          if (!micOnly) setCamStatus("denied");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const allGranted = micOnly ? micStatus === "granted" : camStatus === "granted" && micStatus === "granted";

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-6">
        <ShieldCheck className="w-8 h-8 text-blue-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        {micOnly ? "Microphone Access" : "Camera & Microphone"}
      </h2>
      <p className="text-gray-500 mb-8 max-w-sm text-sm">
        {micOnly
          ? "We need access to your microphone to conduct the interview."
          : "We need access to your camera and microphone to conduct the interview Click Allow Access button below."}
      </p>

      <div className="space-y-3 w-full max-w-sm mb-8">
        {!micOnly && (
          <PermissionRow icon={<Camera className="w-5 h-5 text-gray-500" />} label="Camera" status={camStatus} />
        )}
        <PermissionRow icon={<Mic className="w-5 h-5 text-gray-500" />} label="Microphone" status={micStatus} />
      </div>

      {!allGranted && (
        <Button
          onClick={requestPermissions}
          disabled={loading}
          className="w-full max-w-sm h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl"
        >
          {loading ? "Requesting..." : "Allow Access"}
        </Button>
      )}

      {allGranted && stream && (
        <Button
          onClick={() => onPermissionsGranted(stream)}
          className="w-full max-w-sm h-12 bg-green-600 hover:bg-green-500 text-white rounded-xl"
        >
          Continue
        </Button>
      )}

      {(camStatus === "denied" || micStatus === "denied") && (
        <p className="text-red-500 text-sm mt-4 max-w-sm">
          Permission denied. Please allow access in your browser settings and refresh.
        </p>
      )}
    </div>
  );
}

function PermissionRow({ icon, label, status }: { icon: React.ReactNode; label: string; status: "idle" | "granted" | "denied" }) {
  return (
    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
      <div className="flex items-center gap-3 text-gray-700">
        {icon}
        <span className="font-medium text-sm">{label}</span>
      </div>
      {status === "granted" && <CheckCircle className="w-5 h-5 text-green-500" />}
      {status === "denied" && <XCircle className="w-5 h-5 text-red-500" />}
      {status === "idle" && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
    </div>
  );
}
