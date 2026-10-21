"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bot, Briefcase, Building2, History, Megaphone, Mic, Settings } from "lucide-react";
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

/** Any lucide icon (or a component with the same shape). */
export type TalentIcon = React.ComponentType<{ className?: string }>;

/** The organization the talent pages act on (always set once `ready`). */
interface TalentOrgState {
  orgId: number | null;
  ready: boolean;
  isAdmin: boolean;
}

const TalentOrgContext = createContext<TalentOrgState>({ orgId: null, ready: false, isAdmin: false });

export const useTalentOrg = () => useContext(TalentOrgContext);

const TABS: { href: string; label: string; icon: TalentIcon }[] = [
  { href: "/talent", label: "Campaigns", icon: Megaphone },
  { href: "/talent/jobs", label: "Job matches", icon: Briefcase },
  { href: "/talent/interviews", label: "Interviews", icon: Mic },
  { href: "/talent/audit", label: "Audit", icon: History },
  { href: "/talent/settings", label: "Settings", icon: Settings },
];

const ORG_KEY = "talent_platform_org";

export function TalentShell({
  title,
  subtitle,
  actions,
  icon: Icon = Bot,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** The icon in the header tile (default: the agent's robot). */
  icon?: TalentIcon;
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
        <header className="space-y-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-600 shadow-xs dark:border-brand-500/25 dark:bg-brand-500/15 dark:text-brand-300">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
                {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
              </div>
            </div>
            {((platformAdmin && orgs.length > 0) || actions) && (
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {platformAdmin && orgs.length > 0 && (
                  <Select value={orgId != null ? String(orgId) : undefined} onValueChange={(v) => choose(Number(v))}>
                    <SelectTrigger size="sm" aria-label="Organization" className="h-9 w-full sm:w-60">
                      <Building2 className="size-4" />
                      <SelectValue placeholder="Organization" />
                    </SelectTrigger>
                    <SelectContent align="end">
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
            )}
          </div>
          <nav aria-label="Talent Agent sections" className="-mx-1 overflow-x-auto px-1 pb-1">
            <Tabs value={activeTab}>
              <TabsList className="h-10 w-max">
                {TABS.map((t) => (
                  <TabsTrigger key={t.href} value={t.href} asChild className="flex-none gap-2 px-3">
                    <Link href={t.href}>
                      <t.icon className="size-4" />
                      {t.label}
                    </Link>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </nav>
        </header>
        {state.ready ? (
          children
        ) : (
          <div className="space-y-4" role="status" aria-label="Loading">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
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

/** A titled section: a shadcn Card with an optional icon and an action in the header. */
export function Panel({
  title,
  description,
  action,
  icon: Icon,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  /** A small icon before the title. */
  icon?: TalentIcon;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("gap-4", className)}>
      {(title || action) && (
        <CardHeader>
          {title && (
            <CardTitle className="col-start-1 flex items-center gap-2 text-base">
              {Icon && (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
              )}
              {title}
            </CardTitle>
          )}
          {description && <CardDescription className="col-start-1">{description}</CardDescription>}
          {action && <CardAction className={stackedAction}>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

const STAT_TONE = {
  warn: { value: "text-amber-600 dark:text-amber-400", icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" },
  bad: { value: "text-red-600 dark:text-red-400", icon: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300" },
  good: { value: "text-emerald-600 dark:text-emerald-400", icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
} as const;

/** One number with a label: a compact KPI card, with an optional icon and hint. */
export function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "warn" | "bad" | "good";
  icon?: TalentIcon;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-4 shadow-none", className)}>
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
          {Icon && (
            <span
              aria-hidden
              className={cn(
                "-mt-1 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
                tone && STAT_TONE[tone].icon,
              )}
            >
              <Icon className="size-4" />
            </span>
          )}
        </div>
        <div className={cn("mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums", tone && STAT_TONE[tone].value)}>
          {value}
        </div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

const PILL_TONES = {
  green: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  amber: {
    badge: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  red: {
    badge: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    dot: "bg-red-500",
  },
  blue: {
    badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  gray: {
    badge: "border-border bg-muted/60 text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
};

const STATUS_TONE: Record<string, keyof typeof PILL_TONES> = {
  active: "green", paused: "amber", cancelled: "gray", completed: "blue", open: "green",
  fresh: "green", stale: "amber", refreshing: "blue", unreachable: "red", unverified: "gray",
  ranked: "gray", needs_refresh: "amber", approval_pending: "amber", invited: "blue", declined: "gray",
  "not interested": "red", "consent requested": "amber",
  scheduled: "blue", interviewed: "blue", shortlisted: "green", submitted: "green", closed: "gray",
  offered: "blue", in_progress: "blue", scored: "green", no_show: "red", human_requested: "amber", expired: "gray",
  pending: "amber", reviewed: "green", yes: "green", no: "red", unclear: "amber",
  queued: "blue", running: "blue", done: "green", failed: "red", skipped: "amber",
};

/** A status label: a shadcn Badge with a coloured dot, coloured by meaning (always with words). */
export function Pill({ children, tone, className }: { children: React.ReactNode; tone?: keyof typeof PILL_TONES; className?: string }) {
  const key = tone ?? STATUS_TONE[String(children)] ?? "gray";
  const t = PILL_TONES[key];
  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-full px-2 font-medium", t.badge, className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
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
      <AlertTitle>Configuration needs attention</AlertTitle>
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
