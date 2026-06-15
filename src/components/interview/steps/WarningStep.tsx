"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Eye, Loader2, Monitor, Shield, Tablet } from "lucide-react";

interface Props {
  onConfirm: () => void | Promise<void>;
}

export default function WarningStep({ onConfirm }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [starting, setStarting] = useState(false);

  // Give immediate feedback the moment the candidate clicks: the opening
  // question takes a few seconds to generate, and without this the button
  // looked frozen. Latches true (we're navigating into the room next) and is
  // guarded against double-clicks.
  const handleClick = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await onConfirm();
    } catch {
      // Parent handles errors; re-enable so the candidate can retry.
      setStarting(false);
    }
  };

  const warnings = [
    { icon: <Monitor className="w-4 h-4 text-red-500" />, text: "Do NOT switch browser tabs or windows during the interview." },
    { icon: <Eye className="w-4 h-4 text-red-500" />, text: "Keep your face clearly visible in the webcam at all times." },
    { icon: <Tablet className="w-4 h-4 text-red-500" />, text: "Only one person should be visible in the frame." },
    { icon: <Shield className="w-4 h-4 text-red-500" />, text: "Exiting fullscreen mode will be flagged as a violation." },
  ];

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Zero Tolerance Policy</h2>
        <p className="text-gray-500 text-center mb-8 text-sm">
          This interview uses AI monitoring. Violations will be recorded and may affect your result.
        </p>

        <div className="space-y-3 mb-6">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <div className="mt-0.5 shrink-0">{w.icon}</div>
              <p className="text-gray-700 text-sm">{w.text}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-center">
          <p className="text-gray-600 text-sm">
            After <span className="text-red-500 font-semibold">5 violations</span>, your interview will be automatically terminated.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Eye className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-blue-900 text-xs leading-relaxed">
            Members of the hiring team may watch this interview live for evaluation purposes.
            They can only watch — they cannot interrupt, speak, or record.
          </p>
        </div>

        <div className="flex items-start gap-3 mb-6">
          <Checkbox
            id="confirm-policy"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
            className="mt-1"
          />
          <Label htmlFor="confirm-policy" className="text-gray-600 text-sm cursor-pointer leading-relaxed">
            I understand the anti-cheating policy and agree to conduct this interview honestly and fairly.
          </Label>
        </div>

        <Button
          onClick={handleClick}
          disabled={!confirmed || starting}
          className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl disabled:opacity-50"
        >
          {starting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting your interview…
            </span>
          ) : (
            "Begin Interview"
          )}
        </Button>
      </div>
    </div>
  );
}
