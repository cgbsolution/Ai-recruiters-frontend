"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogIn, Mail, UserPlus } from "lucide-react";

interface Props {
  onLogin: (email: string) => Promise<"ok" | "resume" | "completed" | "not_found" | "error">;
  onSwitchToRegister: () => void;
  onBack?: () => void;
}

export default function LoginStep({ onLogin, onSwitchToRegister, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    const result = await onLogin(email.trim());

    switch (result) {
      case "ok":
      case "resume":
        // Parent handles navigation
        break;
      case "completed":
        setErrorMsg("You have already completed the interview for this position.");
        break;
      case "not_found":
        setErrorMsg("No account found with this email. Please register first.");
        break;
      case "error":
        setErrorMsg("Something went wrong. Please try again.");
        break;
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10">
      <div className="w-full max-w-md">
        {/* Go Back */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        )}

        {/* Register / Login toggle — same style as RegistrationStep */}
        <div className="bg-gray-900 rounded-xl p-4 mb-8 space-y-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="flex-1 rounded-lg border border-gray-700 hover:border-gray-500 p-3 text-left transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-300">New Interview</span>
              </div>
              <p className="text-xs text-gray-500">Fill in the form to start</p>
            </button>
            <div className="flex-1 rounded-lg bg-blue-600/20 border border-blue-500/40 p-3">
              <div className="flex items-center gap-2 mb-1">
                <LogIn className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-300">Continue Existing</span>
              </div>
              <p className="text-xs text-gray-400">Resume where you left off</p>
            </div>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-white mb-2 text-center">Welcome Back</h2>
        <p className="text-gray-400 text-center mb-8">
          Enter your email to resume your interview or continue where you left off.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="text-gray-300">Email Address <span className="text-red-400">*</span></Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 pl-10 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
                required
              />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 text-left">
              <p className="text-red-300 text-sm">{errorMsg}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
          >
            {loading ? "Checking..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
