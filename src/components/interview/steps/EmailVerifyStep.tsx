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
  interviewDate?: string;
  interviewTimezone?: string;
  joiningFlexibility?: string;
  allowJoiningEarly?: boolean;
}

interface Props {
  onVerify: (email: string) => Promise<VerifyResult>;
  onAccessGranted: (canResume: boolean, scheduling?: {
    interviewDate?: string;
    interviewTimezone?: string;
    joiningFlexibility?: string;
    allowJoiningEarly?: boolean;
  }, candidateName?: string) => void;
  onShowApply: (email: string, name?: string) => void;
  onBack?: () => void;
  initialEmail?: string;
}

export default function EmailVerifyStep({
  onVerify,
  onAccessGranted,
  onShowApply,
  onBack,
  initialEmail,
}: Props) {
  const [email, setEmail] = useState(initialEmail ?? "");
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
        onAccessGranted(result.canResume, {
          interviewDate: result.interviewDate,
          interviewTimezone: result.interviewTimezone,
          joiningFlexibility: result.joiningFlexibility,
          allowJoiningEarly: result.allowJoiningEarly,
        }, result.candidateName);
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
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10 bg-white">
      <div className="w-full max-w-md">
        {/* Go Back */}
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-8 transition-colors px-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        )}

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
          Verify Your Access
        </h2>
        <p className="text-gray-500 text-center mb-8 text-sm">
          Enter the email address that was used when you were invited for this interview.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="text-gray-700 text-sm font-medium">
              Email Address <span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 rounded-xl focus:border-blue-500 focus:ring-blue-500"
                required
                autoFocus
              />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{errorMsg}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50 rounded-xl shadow-md shadow-blue-200"
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

        <p className="text-gray-400 text-xs text-center mt-6">
          Don&apos;t have an invitation? You can still apply for this job after entering your email.
        </p>
      </div>
    </div>
  );
}
