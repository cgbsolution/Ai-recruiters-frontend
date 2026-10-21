"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Unplug } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export interface MyConnection {
  organization: string;
  connected: boolean;
  /** The AskMira workspace this organization is connected to, as it called itself. */
  askmira_workspace: string | null;
  askmira_origin: string | null;
  connected_at: string | null;
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "");

/**
 * Admin → AskMira connection: whether this organization is connected to an
 * AskMira workspace, and a way to disconnect it. Connecting starts in AskMira
 * (Settings → Connectors) and is allowed on /connect/askmira here.
 */
export default function AskmiraConnectionView() {
  const [status, setStatus] = useState<MyConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api<MyConnection>("/integrations/askmira/my-connection"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "Could not load the AskMira connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disconnect = async () => {
    if (!window.confirm("Disconnect AskMira? Its people can't open AnytimeHire from AskMira until it connects again.")) return;
    setBusy(true);
    try {
      setStatus(await api<MyConnection>("/integrations/askmira/my-connection", { method: "DELETE" }));
      toast.success("AskMira disconnected");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AskMira connection</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          AskMira, the HRMS, can sign your people in here without a second password, keep your team list in step,
          and show your hiring in AskMira. The connection reaches your organization only.
        </p>
      </div>

      <Card className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] space-y-3">
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : status ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                <Link2 className="w-4 h-4" /> {status.organization}
                {status.connected ? <Badge>Connected</Badge> : <Badge variant="outline">Not connected</Badge>}
              </p>
              {status.connected ? (
                <p className="text-sm text-gray-500">
                  Connected to the AskMira workspace “{status.askmira_workspace}”
                  {status.askmira_origin ? ` at ${status.askmira_origin}` : ""} since {when(status.connected_at)}.
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  To connect, an admin of your workspace in AskMira opens Settings → Connectors → AnytimeHire → Connect,
                  then an admin of this organization signs in here and presses Allow.
                </p>
              )}
            </div>
            {status.connected && (
              <Button variant="outline" disabled={busy} onClick={() => void disconnect()}>
                <Unplug className="w-4 h-4 mr-1" /> Disconnect
              </Button>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
