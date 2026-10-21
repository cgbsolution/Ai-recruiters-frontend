"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";

/** Where to go after signing in: the page that sent you here, if it is one of ours. */
function afterSignIn(): string {
  const target = new URLSearchParams(window.location.search).get("redirect") ?? "";
  return target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\") ? target : "/";
}

export default function SignInForm() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Show session expired toast if redirected from expired session
  useEffect(() => {
    const msg = sessionStorage.getItem("session_expired");
    if (msg) {
      sessionStorage.removeItem("session_expired");
      toast.error(msg);
    }
  }, []);

  // Handle browser autofill — poll form inputs to sync React state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!formRef.current) return;
      const emailInput = formRef.current.querySelector<HTMLInputElement>('input[type="email"]');
      const passInput = formRef.current.querySelector<HTMLInputElement>('input[type="password"], input[name="password"]');
      if (emailInput?.value && !email) setEmail(emailInput.value);
      if (passInput?.value && !password) setPassword(passInput.value);
    }, 500);
    return () => clearTimeout(timer);
  }, [email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Re-read from DOM in case autofill didn't trigger onChange
    if (formRef.current) {
      const emailInput = formRef.current.querySelector<HTMLInputElement>('input[type="email"]');
      const passInput = formRef.current.querySelector<HTMLInputElement>('input[type="password"], input[name="password"]');
      const finalEmail = email || emailInput?.value || "";
      const finalPass = password || passInput?.value || "";
      if (!finalEmail.trim() || !finalPass) return;

      setLoading(true);
      setError(null);

      try {
        await login(finalEmail.trim().toLowerCase(), finalPass);
        window.location.href = afterSignIn();
      } catch (err) {
        setError((err as Error).message || "Login failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) return;

    setLoading(true);
    setError(null);

    try {
      await login(email.trim().toLowerCase(), password);
      window.location.href = afterSignIn();
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full overflow-y-auto no-scrollbar">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Sign In
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter your credentials to access your account
          </p>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="text-gray-700 dark:text-gray-300 text-sm font-medium">
              Email <span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 pl-10 bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 rounded-lg focus:border-brand-500 focus:ring-brand-500"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-700 dark:text-gray-300 text-sm font-medium">
              Password <span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pl-10 pr-10 bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 rounded-lg focus:border-brand-500 focus:ring-brand-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-sm font-medium text-brand-500 hover:text-brand-600"
              >
                Forgot password?
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-brand-500 hover:bg-brand-600 text-white font-semibold disabled:opacity-50 rounded-lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-brand-500 hover:text-brand-600 font-medium">
            Sign Up
          </Link>
        </p>
      </div>

      <ForgotPasswordModal
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        defaultEmail={email}
      />
    </div>
  );
}
