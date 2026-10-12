"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bot } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { setTalentOrg } from "@/lib/talent";
import { cn } from "@/lib/utils";

/** The organization the talent pages act on (always set once `ready`). */
interface TalentOrgState {
  orgId: number | null;
  ready: boolean;
  isAdmin: boolean;
}

const TalentOrgContext = createContext<TalentOrgState>({ orgId: null, ready: false, isAdmin: false });

export const useTalentOrg = () => useContext(TalentOrgContext);

const TABS = [
  { href: "/talent", label: "Campaigns" },
  { href: "/talent/jobs", label: "Job matches" },
  { href: "/talent/interviews", label: "Interviews" },
  { href: "/talent/audit", label: "Audit" },
  { href: "/talent/settings", label: "Settings" },
];

const ORG_KEY = "talent_platform_org";

export function TalentShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, hasRole } = useAuth();
  const pathname = usePathname();
  const platformAdmin = !!user && user.role === "super_admin" && user.organization_id == null;
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [orgId, setOrgId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!platformAdmin) {
      setTalentOrg(null);
      setOrgId(user.organization_id);
      return;
    }
    api<{ id: number; name: string; is_active: boolean }[]>("/organizations/?is_active=true")
      .then((rows) => {
        setOrgs(rows);
        let saved: number | null = null;
        try {
          saved = Number(localStorage.getItem(ORG_KEY)) || null;
        } catch {
          /* storage unavailable */
        }
        const pick = rows.find((o) => o.id === saved)?.id ?? rows[0]?.id ?? null;
        setTalentOrg(pick);
        setOrgId(pick);
      })
      .catch(() => setOrgs([]));
  }, [user, platformAdmin]);

  const choose = (id: number) => {
    setTalentOrg(id);
    setOrgId(id);
    try {
      localStorage.setItem(ORG_KEY, String(id));
    } catch {
      /* storage unavailable */
    }
  };

  const activeTab =
    [...TABS].reverse().find((t) => (t.href === "/talent" ? pathname === "/talent" : pathname.startsWith(t.href)))?.href ??
    "/talent";
  const state: TalentOrgState = { orgId, ready: orgId != null, isAdmin: hasRole("admin", "super_admin") };

  return (
    <TalentOrgContext.Provider value={state}>
      <div className="talent-ui space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {platformAdmin && orgs.length > 0 && (
              <Select value={orgId != null ? String(orgId) : undefined} onValueChange={(v) => choose(Number(v))}>
                <SelectTrigger aria-label="Organization" className="w-56">
                  <SelectValue placeholder="Organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {actions}
          </div>
        </div>
        <Tabs value={activeTab}>
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.href} value={t.href} asChild>
                <Link href={t.href}>{t.label}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {state.ready ? (
          children
        ) : (
          <div className="space-y-4" aria-label="Loading">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}
      </div>
    </TalentOrgContext.Provider>
  );
}

/** CardAction classes that move the actions under the title when the card is
 *  narrow (phones), instead of squeezing the title into a thin column. */
export const stackedAction =
  "flex flex-wrap items-center gap-2 @max-xl/card-header:col-start-1 @max-xl/card-header:row-span-1 @max-xl/card-header:row-start-auto @max-xl/card-header:mt-2 @max-xl/card-header:justify-self-start";

/** A titled section: a shadcn Card with an optional action in the header. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-4", className)}>
      {(title || action) && (
        <CardHeader>
          {title && <CardTitle className="col-start-1">{title}</CardTitle>}
          {description && <CardDescription className="col-start-1">{description}</CardDescription>}
          {action && <CardAction className={stackedAction}>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** One number with a label: a compact Card. */
export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "warn" | "bad" | "good" }) {
  return (
    <Card className="gap-1 py-4 shadow-none">
      <CardContent className="px-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-1 text-2xl font-semibold text-gray-900 dark:text-white",
            tone === "warn" && "text-amber-600 dark:text-amber-400",
            tone === "bad" && "text-red-600 dark:text-red-400",
            tone === "good" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

const PILL_TONES: Record<string, string> = {
  green: "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  red: "border-transparent bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  blue: "border-transparent bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  gray: "",
};

const STATUS_TONE: Record<string, keyof typeof PILL_TONES> = {
  active: "green", paused: "amber", cancelled: "gray", completed: "blue",
  fresh: "green", stale: "amber", refreshing: "blue", unreachable: "red", unverified: "gray",
  ranked: "gray", needs_refresh: "amber", approval_pending: "amber", invited: "blue", declined: "gray",
  scheduled: "blue", interviewed: "blue", shortlisted: "green", submitted: "green", closed: "gray",
  offered: "blue", in_progress: "blue", scored: "green", no_show: "red", human_requested: "amber", expired: "gray",
  pending: "amber", reviewed: "green", yes: "green", no: "red", unclear: "amber",
  queued: "blue", running: "blue", done: "green", failed: "red", skipped: "amber",
};

/** A status label: a shadcn Badge, coloured by meaning (always with words). */
export function Pill({ children, tone }: { children: React.ReactNode; tone?: keyof typeof PILL_TONES }) {
  const key = tone ?? STATUS_TONE[String(children)] ?? "gray";
  return (
    <Badge variant="secondary" className={cn("rounded-full", PILL_TONES[key])}>
      {typeof children === "string" ? children.replace(/_/g, " ") : children}
    </Badge>
  );
}

/** Configuration problems the server reported. */
export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Alert variant="warning">
      <AlertTriangle />
      <AlertTitle>Configuration</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-5">
          {items.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

