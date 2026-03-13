"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, ShieldCheck, Loader2 } from "lucide-react";

interface VerifyResult {
  access: "granted" | "apply" | "completed" | "terminated";
  candidateName?: string;
  canResume: boolean;
  message: string;
}

interface Props {
  onVerify: (email: string) => Promise<VerifyResult>;
  onAccessGranted: (canResume: boolean) => void;
  onShowApply: (email: string, name?: string) => void;
  onBack: () => void;
}

export default function EmailVerifyStep({
  onVerify,
  onAccessGranted,
  onShowApply,
  onBack,
}: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    const result = await onVerify(email.trim().toLowerCase());

    switch (result.access) {
      case "granted":
        onAccessGranted(result.canResume);
        break;
      case "apply":
        onShowApply(email.trim().toLowerCase(), result.candidateName);
        break;
      case "completed":
        setErrorMsg(result.message);
        break;
      case "terminated":
        setErrorMsg(result.message);
        break;
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10">
      <div className="w-full max-w-md">
        {/* Go Back */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <h2 className="text-3xl font-bold text-white mb-2 text-center">
          Verify Your Access
        </h2>
        <p className="text-gray-400 text-center mb-8">
          Enter the email address that was used when you were invited for this interview.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="text-gray-300">
              Email Address <span className="text-red-400">*</span>
            </Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 pl-10 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
                required
                autoFocus
              />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3">
              <p className="text-red-300 text-sm">{errorMsg}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Verifying...
              </>
            ) : (
              "Verify & Continue"
            )}
          </Button>
        </form>

        <p className="text-gray-500 text-xs text-center mt-6">
          Don&apos;t have an invitation? You can still apply for this job after entering your email.
        </p>
      </div>
    </div>
  );
}
