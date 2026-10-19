"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, notifySuccess } from "@/lib/notify";
import { talentGet, talentPost } from "@/lib/talent";

/**
 * A recruiter records consent a candidate gave them directly (a call, an
 * email reply). Each change is stored with the recruiter and the stated
 * basis (POST /talent/profiles/{id}/consent) and lands in the audit trail.
 */

type Purpose = "jobs" | "interview" | "refresh";

const PURPOSES: { key: Purpose; label: string; help: string }[] = [
  { key: "jobs", label: "Job invites", help: "Invites to matching openings, and their reminders" },
  { key: "interview", label: "Interviews", help: "Booking, confirmation and reminder emails" },
  { key: "refresh", label: "Profile updates", help: "Requests to confirm or update their profile" },
];

type ConsentRow = { channel: string; purpose: string; status: string; source: string | null; granted_at: string | null };
type ConsentState = { consents: ConsentRow[]; suppressed: boolean; email_status: string | null };

const MIN_BASIS = 5;

export function ConsentDialog({
  profileId,
  name,
  open,
  onOpenChange,
  onSaved,
}: {
  profileId: number;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [state, setState] = useState<ConsentState | null>(null);
  const [chosen, setChosen] = useState<Record<Purpose, boolean>>({ jobs: false, interview: false, refresh: false });
  const [basis, setBasis] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setState(null);
    setBasis("");
    talentGet<ConsentState>(`/profiles/${profileId}/consent`)
      .then((s) => {
        setState(s);
        const on = (p: Purpose) => s.consents.some((c) => c.channel === "email" && c.purpose === p && c.status === "granted");
        setChosen({ jobs: on("jobs"), interview: on("interview"), refresh: on("refresh") });
      })
      .catch((e) => notifyError((e as Error).message));
  }, [open, profileId]);

  const current = (p: Purpose) => state?.consents.find((c) => c.channel === "email" && c.purpose === p);
  const isGranted = (p: Purpose) => current(p)?.status === "granted";
  const changed = PURPOSES.filter(({ key }) => chosen[key] !== isGranted(key));
  // Re-granting what the candidate themselves withdrew overrides their choice: say so.
  const overridesWithdrawal = changed.some(({ key }) => chosen[key] && current(key)?.status === "withdrawn");
  const basisOk = basis.trim().length >= MIN_BASIS;

  const save = async () => {
    setSaving(true);
    try {
      for (const { key } of changed) {
        await talentPost(`/profiles/${profileId}/consent`, { channel: "email", purpose: key, granted: chosen[key], basis: basis.trim() });
      }
      notifySuccess(`Consent updated for ${name}`);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> Record consent
          </DialogTitle>
          <DialogDescription>
            What {name} has agreed to be emailed about. Record only what they told you themselves; your name and the
            note below are kept with each change.
          </DialogDescription>
        </DialogHeader>

        {!state ? (
          <div className="space-y-3" role="status" aria-label="Loading">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {state.suppressed && (
              <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                This candidate is on the do-not-contact list (unsubscribed, bounced or blocked). Consent alone won’t let
                emails through.
              </p>
            )}
            <div className="space-y-3">
              {PURPOSES.map(({ key, label, help }) => {
                const row = current(key);
                return (
                  <div key={key} className="flex items-start justify-between gap-3">
                    <Label htmlFor={`consent-${key}`} className="flex flex-col items-start gap-0.5 font-normal leading-snug">
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {help}
                        {row?.status === "withdrawn" && " · withdrawn earlier"}
                      </span>
                    </Label>
                    <Switch
                      id={`consent-${key}`}
                      checked={chosen[key]}
                      disabled={saving}
                      onCheckedChange={(v) => setChosen((c) => ({ ...c, [key]: v }))}
                    />
                  </div>
                );
              })}
            </div>
            {overridesWithdrawal && (
              <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                The candidate withdrew this before. Turn it back on only if they have agreed again.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="consent-basis">How did they agree?</Label>
              <Textarea
                id="consent-basis"
                rows={2}
                value={basis}
                disabled={saving}
                onChange={(e) => setBasis(e.target.value)}
                placeholder="e.g. Agreed on a phone call on 15 Oct"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!state || saving || !changed.length || !basisOk}>
            {saving ? "Saving…" : "Save consent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
