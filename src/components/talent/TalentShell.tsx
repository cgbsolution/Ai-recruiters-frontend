"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";
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

  const active = (href: string) => (href === "/talent" ? pathname === "/talent" : pathname.startsWith(href));
  const state: TalentOrgState = { orgId, ready: orgId != null, isAdmin: hasRole("admin", "super_admin") };

  return (
    <TalentOrgContext.Provider value={state}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {platformAdmin && (
              <select
                aria-label="Organization"
                value={orgId ?? ""}
                onChange={(e) => choose(Number(e.target.value))}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-gray-900 dark:text-gray-200"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            {actions}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-white/10">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active(t.href)
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {state.ready ? children : <div className="py-16 text-center text-sm text-gray-500">Loading…</div>}
      </div>
    </TalentOrgContext.Provider>
  );
}

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
    <section
      className={cn(
        "rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900/40",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>}
            {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Outline / ghost buttons on talent pages: the shared variant has no dark-mode ink. */
export const quietButton =
  "dark:border-white/15 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10 dark:hover:text-white";

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "warn" | "bad" | "good" }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/5 dark:bg-white/[0.03]">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
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
      {hint && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</div>}
    </div>
  );
}

const PILL_TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  gray: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

const STATUS_TONE: Record<string, keyof typeof PILL_TONES> = {
  active: "green", paused: "amber", cancelled: "gray", completed: "blue",
  fresh: "green", stale: "amber", refreshing: "blue", unreachable: "red", unverified: "gray",
  ranked: "gray", needs_refresh: "amber", approval_pending: "amber", invited: "blue", declined: "gray",
  scheduled: "blue", interviewed: "blue", shortlisted: "green", submitted: "green", closed: "gray",
  offered: "blue", in_progress: "blue", scored: "green", no_show: "red", human_requested: "amber", expired: "gray",
  pending: "amber", reviewed: "green", yes: "green", no: "red", unclear: "amber",
};

export function Pill({ children, tone }: { children: React.ReactNode; tone?: keyof typeof PILL_TONES }) {
  const key = tone ?? STATUS_TONE[String(children)] ?? "gray";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", PILL_TONES[key])}>
      {typeof children === "string" ? children.replace(/_/g, " ") : children}
    </span>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="mb-1 font-medium">Configuration</div>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
