"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Landing page for "Open Interviews" in AskMira. AskMira puts a one-time,
 * one-minute sign-in token in the URL fragment (never sent to any server or
 * Referer); it is traded for a normal session here and then wiped from the URL.
 */
export default function AskmiraSignIn() {
  const { loginWithAskmira } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setError("This link has no sign-in token. Open Interviews again from AskMira.");
      return;
    }
    loginWithAskmira(token)
      .then(() => router.replace("/"))
      .catch((e: Error) => setError(e.message));
  }, [loginWithAskmira, router]);

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        {error ? (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              Couldn&apos;t sign you in from AskMira
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
            <a href="/signin" className="text-sm text-brand-500 hover:text-brand-600">
              Sign in with a password instead
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
            <Loader2 className="size-5 animate-spin" />
            <span>Signing you in from AskMira…</span>
          </div>
        )}
      </div>
    </div>
  );
}
