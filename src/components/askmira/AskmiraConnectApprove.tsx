"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { api, apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import type { MyConnection } from "@/components/askmira/AskmiraConnectionView";

interface Request {
  tenant_id: string;
  tenant_name: string;
  redirect_uri: string;
  state: string;
  challenge: string;
}

function readRequest(): Request | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const request = {
    tenant_id: q.get("tenant_id") ?? "",
    tenant_name: q.get("tenant_name") ?? "",
    redirect_uri: q.get("redirect_uri") ?? "",
    state: q.get("state") ?? "",
    challenge: q.get("challenge") ?? "",
  };
  return Object.values(request).every(Boolean) ? request : null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * /connect/askmira — AskMira asks to connect one of its workspaces to the
 * signed-in admin's organization. Allow makes a one-time code, bound to this
 * organization, that only the AskMira server which asked can use; Cancel sends
 * the admin back with nothing.
 */
export default function AskmiraConnectApprove() {
  const { user, isLoading } = useAuth();
  const request = useMemo(readRequest, []);
  const [mine, setMine] = useState<MyConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOrgAdmin = Boolean(user && (user.role === "admin" || user.role === "super_admin") && user.organization_id);

  useEffect(() => {
    if (!isOrgAdmin) return;
    api<MyConnection>("/integrations/askmira/my-connection")
      .then(setMine)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.detail : "Could not read your organization."));
  }, [isOrgAdmin]);

  const allow = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const { redirect_to } = await apiPost<{ redirect_to: string }>("/integrations/askmira/connect/approve", request);
      window.location.assign(redirect_to);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not allow the connection.");
      setBusy(false);
    }
  };

  const cancel = () => {
    if (request) window.location.assign(request.redirect_uri.replace(/\/callback$/, ""));
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto px-6 space-y-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-7 text-brand-500" />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Connect AskMira</h1>
        </div>

        {!request ? (
          <p className="text-sm text-gray-500">
            This link is incomplete. Start again from AskMira: Settings → Connectors → AnytimeHire → Connect.
          </p>
        ) : isLoading ? (
          <Loader2 className="size-5 animate-spin text-gray-500" />
        ) : !isOrgAdmin ? (
          <p className="text-sm text-gray-500">
            Only an admin of an organization here can connect it to AskMira. Sign in with an admin account of your
            organization, or ask one of them to press Connect in AskMira.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              The AskMira workspace <span className="font-semibold">“{request.tenant_name}”</span> at{" "}
              <span className="font-mono">{hostOf(request.redirect_uri)}</span> asks to connect to your organization
              {mine ? (
                <>
                  {" "}
                  <span className="font-semibold">“{mine.organization}”</span>
                </>
              ) : null}
              .
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
              <li>Its people can open AnytimeHire from AskMira without a second password.</li>
              <li>It keeps your team list here in step with AskMira (HR as admins, managers as recruiters).</li>
              <li>
                Its people can see your jobs, candidates and interviews in AskMira, as their role here allows — never
                résumés, contact details or AI scores.
              </li>
            </ul>
            <p className="text-xs text-gray-500">
              It reaches your organization only. You can disconnect it any time under AskMira Connection.
            </p>
            {mine?.connected && mine.askmira_workspace !== request.tenant_name ? (
              <p className="text-sm text-amber-600">
                Your organization is already connected to “{mine.askmira_workspace}”. Disconnect that first.
              </p>
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex gap-3">
              <Button onClick={() => void allow()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin mr-1" /> : null} Allow
              </Button>
              <Button variant="outline" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-gray-500">Signed in as {user?.email}.</p>
          </>
        )}
      </div>
    </div>
  );
}
