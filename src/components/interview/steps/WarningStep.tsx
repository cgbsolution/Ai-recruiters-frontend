"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Eye, Monitor, Shield, Tablet } from "lucide-react";

interface Props {
  onConfirm: () => void;
}

export default function WarningStep({ onConfirm }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  const warnings = [
    {
      icon: <Monitor className="w-4 h-4 text-red-400" />,
      text: "Do NOT switch browser tabs or windows during the interview.",
    },
    {
      icon: <Eye className="w-4 h-4 text-red-400" />,
      text: "Keep your face clearly visible in the webcam at all times.",
    },
    {
      icon: <Tablet className="w-4 h-4 text-red-400" />,
      text: "Only one person should be visible in the frame.",
    },
    {
      icon: <Shield className="w-4 h-4 text-red-400" />,
      text: "Exiting fullscreen mode will be flagged as a violation.",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-900/40 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        <h2 className="text-3xl font-bold text-white mb-2 text-center">Zero Tolerance Policy</h2>
        <p className="text-gray-400 text-center mb-8">
          This interview uses AI monitoring. Violations will be recorded and may affect your result.
        </p>

        <div className="space-y-3 mb-6">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-3 bg-red-950/20 border border-red-900/40 rounded-xl px-4 py-3">
              <div className="mt-0.5 flex-shrink-0">{w.icon}</div>
              <p className="text-gray-300 text-sm">{w.text}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-gray-400 text-sm text-center">
            After <span className="text-red-400 font-semibold">5 violations</span>, your interview will be automatically terminated.
          </p>
        </div>

        <div className="flex items-start gap-3 mb-6">
          <Checkbox
            id="confirm-policy"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
            className="mt-1"
          />
          <Label htmlFor="confirm-policy" className="text-gray-300 text-sm cursor-pointer">
            I understand the anti-cheating policy and agree to conduct this interview honestly and fairly.
          </Label>
        </div>

        <Button
          onClick={onConfirm}
          disabled={!confirmed}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Begin Interview
        </Button>
      </div>
    </div>
  );
}
