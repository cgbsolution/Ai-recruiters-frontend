"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefills the field with whatever was typed on the sign-in form. */
  defaultEmail?: string;
};

export default function ForgotPasswordModal({
  open,
  onOpenChange,
  defaultEmail = "",
}: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const close = () => {
    onOpenChange(false);
    // Reset after the close animation so the form doesn't flicker on the way out.
    setTimeout(() => {
      setSent(false);
      setError(null);
      setLoading(false);
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      await apiPost("/auth/forgot-password", { email: address });
      // The API deliberately answers the same way whether or not the account
      // exists, so the confirmation has to be worded that way too.
      setSent(true);
    } catch (err) {
      setError((err as Error).message || "Could not send the reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
            Reset Password
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            {sent
              ? "Check your inbox for the reset link."
              : "Enter your email and we'll send you a reset link."}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-sm text-green-700 dark:text-green-400">
                If an account exists for <span className="font-medium">{email.trim().toLowerCase()}</span>,
                a reset link is on its way. It expires in one hour.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={close}
                className="bg-brand-500 hover:bg-brand-600 text-white font-medium"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="mt-1.5 h-11 rounded-lg border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={close}
                disabled={loading}
                className="text-gray-700 dark:text-gray-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="bg-brand-500 hover:bg-brand-600 text-white font-medium disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                  </>
                ) : (
                  "Send Link"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
