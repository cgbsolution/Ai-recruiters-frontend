"use client";

import { useState } from "react";
import { Eye, Copy, Mail, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, apiPost } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";

interface Props {
  candidateId: number;
  candidateName: string;
}

interface ObserverLinkInfo {
  link: string | null;
  token?: string;
  expires_at?: string | null;
  view_count?: number;
  created_by_email?: string | null;
}

/**
 * Small action that lets the recruiter pull up the live observer link for a
 * candidate, copy/email it, or revoke it. Shown next to the Share-Link button
 * once a candidate's interview is scheduled.
 */
export default function ObserverLinkButton({ candidateId, candidateName }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<ObserverLinkInfo | null>(null);
  const [busy, setBusy] = useState<"copy" | "email" | "revoke" | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<ObserverLinkInfo>(`/candidates/${candidateId}/observer-link`);
      setInfo(data);
    } catch (err: any) {
      notifyError(err.message || "Could not fetch observer link");
      setInfo({ link: null });
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (next) load();
  };

  const handleCopy = async () => {
    if (!info?.link) return;
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(info.link);
      notifySuccess("Observer link copied");
    } catch {
      notifyError("Could not copy to clipboard");
    } finally {
      setBusy(null);
    }
  };

  const handleEmail = async () => {
    setBusy("email");
    try {
      const res = await apiPost<{ ok: boolean; email_sent: boolean; link: string }>(
        `/candidates/${candidateId}/observer-link/resend`,
        {},
      );
      setInfo({ link: res.link, ...info });
      if (res.email_sent) notifySuccess("Observer link emailed to you");
      else notifyError("Email send failed — check SMTP settings");
    } catch (err: any) {
      notifyError(err.message || "Could not email observer link");
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async () => {
    if (!confirm("Revoke this observer link? Anyone currently watching will be disconnected.")) {
      return;
    }
    setBusy("revoke");
    try {
      await apiPost(`/candidates/${candidateId}/observer-link/revoke`, {});
      setInfo({ link: null });
      notifySuccess("Observer link revoked");
    } catch (err: any) {
      notifyError(err.message || "Could not revoke link");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        title="Live observer link"
        className="h-7 text-xs gap-1 whitespace-nowrap border-purple-300 text-purple-700 hover:bg-purple-50"
        onClick={() => handleOpen(true)}
      >
        <Eye className="w-3 h-3" /> Observe
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Live observer link</DialogTitle>
            <DialogDescription>
              Anyone with this link can watch <strong>{candidateName}</strong>'s interview live.
              The candidate is not interrupted, and observers cannot speak, type, or
              record.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 flex items-center justify-center text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading…
            </div>
          ) : info?.link ? (
            <div className="space-y-3">
              <div className="rounded-md bg-gray-50 border px-3 py-2 text-xs text-gray-700 break-all">
                {info.link}
              </div>
              {info.expires_at && (
                <div className="text-xs text-gray-500">
                  Expires {new Date(info.expires_at).toLocaleString()}
                </div>
              )}
              {typeof info.view_count === "number" && (
                <div className="text-xs text-gray-500">Opens so far: {info.view_count}</div>
              )}
            </div>
          ) : (
            <div className="py-4 text-sm text-gray-600">
              No active observer link for this candidate yet. Click <em>Email me a link</em> to
              create and send one.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null || !info?.link}
              onClick={handleCopy}
              className="gap-1"
            >
              {busy === "copy" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
              Copy link
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={busy !== null}
              onClick={handleEmail}
              className="gap-1"
            >
              {busy === "email" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Email me a link
            </Button>
            {info?.link && (
              <Button
                variant="destructive"
                size="sm"
                disabled={busy !== null}
                onClick={handleRevoke}
                className="gap-1"
              >
                {busy === "revoke" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Revoke
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
