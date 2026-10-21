"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Link2, Unplug } from "lucide-react";
import { api, apiPost, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

interface ConnectionStatus {
  connected: boolean;
  /** "key": connected from here. "environment": ASKMIRA_SHARED_SECRET on the server. */
  source: "key" | "environment" | null;
  connected_at: string | null;
  pending_until: string | null;
}

/** This server's API as the browser reaches it — what AskMira will call. */
function defaultApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  if (typeof window === "undefined") return base;
  try {
    return new URL(base, window.location.origin).toString().replace(/\/$/, "");
  } catch {
    return base;
  }
}

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "";
}

/**
 * Super admin → AskMira connection. Generates a one-time key for AskMira's
 * platform console; AskMira checks it with this server and then uses it for
 * sign-in links, people sync and Ask Mira's read-only questions. No server
 * settings to edit.
 */
export default function AskmiraConnectionView() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [key, setKey] = useState<{ key: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api<ConnectionStatus>("/integrations/askmira/connection"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "Could not load the AskMira connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setApiUrl(defaultApiUrl());
    setAppUrl(window.location.origin);
    void load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    try {
      setKey(
        await apiPost<{ key: string; expires_at: string }>("/integrations/askmira/connection-key", {
          api_url: apiUrl.trim(),
          app_url: appUrl.trim(),
        }),
      );
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "Could not generate a key.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect AskMira? Its people can't open AnytimeHire from AskMira until you connect again.")) return;
    setBusy(true);
    try {
      setStatus(await api<ConnectionStatus>("/integrations/askmira/connection", { method: "DELETE" }));
      setKey(null);
      toast.success("AskMira disconnected");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key.key);
      toast.success("Key copied");
    } catch {
      toast.error("Copy failed — select the key and copy it by hand.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AskMira connection</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Connect AskMira, the HRMS, so its companies can open AnytimeHire without a second login and ask about their
          hiring from AskMira.
        </p>
      </div>

      <Card className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] space-y-3">
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                <Link2 className="w-4 h-4" /> Status
                {status?.source === "key" ? (
                  <Badge>Connected</Badge>
                ) : status?.source === "environment" ? (
                  <Badge variant="secondary">Connected by server settings</Badge>
                ) : (
                  <Badge variant="outline">Not connected</Badge>
                )}
              </p>
              {status?.connected_at && (
                <p className="text-xs text-gray-500">Connected {when(status.connected_at)}</p>
              )}
              {status?.pending_until && (
                <p className="text-xs text-gray-500">
                  A key is waiting to be used in AskMira until {when(status.pending_until)}.
                </p>
              )}
            </div>
            {status?.source === "key" && (
              <Button variant="outline" disabled={busy} onClick={() => void disconnect()}>
                <Unplug className="w-4 h-4 mr-1" /> Disconnect
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">Generate a connection key</h2>
          <p className="text-sm text-gray-500 mt-1">
            Check the two addresses, generate the key, then paste it in AskMira under Platform → Product connections →
            AnytimeHire → Connect within 30 minutes. A new key takes over only once AskMira has used it.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="askmira-api-url">This server&apos;s API address</Label>
            <Input id="askmira-api-url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="askmira-app-url">This app&apos;s address</Label>
            <Input id="askmira-app-url" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} />
          </div>
        </div>
        <Button disabled={busy || !apiUrl.trim() || !appUrl.trim()} onClick={() => void generate()}>
          <KeyRound className="w-4 h-4 mr-1" /> Generate connection key
        </Button>

        {key && (
          <div className="space-y-2">
            <Label htmlFor="askmira-key">Connection key — good until {when(key.expires_at)}</Label>
            <Textarea id="askmira-key" readOnly rows={4} className="font-mono text-xs" value={key.key} />
            <Button variant="outline" onClick={() => void copy()}>
              <Copy className="w-4 h-4 mr-1" /> Copy key
            </Button>
            <p className="text-xs text-gray-500">
              Treat it like a password: anyone holding it can connect an AskMira server here until it expires.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
