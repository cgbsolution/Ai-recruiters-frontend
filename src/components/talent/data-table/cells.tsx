"use client";

import React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifySuccess } from "@/lib/notify";
import { fmtDate, parseUtc } from "@/lib/talent";
import { cn } from "@/lib/utils";

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60],
];

/** "5 minutes ago" / "in 2 days". */
export function timeAgo(iso: string, now = Date.now()): string {
  const secs = (parseUtc(iso).getTime() - now) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(secs) >= size) return rtf ? rtf.format(Math.round(secs / size), unit) : fmtDate(iso, true);
  }
  return "just now";
}

/** Relative time, the exact date and time on hover. */
export function RelativeTime({ iso, className }: { iso?: string | null; className?: string }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} className={cn("whitespace-nowrap tabular-nums", className)}>
          {timeAgo(iso)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{fmtDate(iso, true)}</TooltipContent>
    </Tooltip>
  );
}

const AVATAR_TONES = [
  "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
];

function initials(name: string): string {
  // Letters and digits only: "Recruiter #1" → "R1", not "R#".
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Avatar with initials (or an icon), a name and a muted second line. */
export function Person({
  name,
  sub,
  icon: Icon,
  seed,
}: {
  name: string;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  seed?: string | number;
}) {
  const key = String(seed ?? name);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="size-8">
        <AvatarFallback className={cn("text-xs font-semibold", AVATAR_TONES[h % AVATAR_TONES.length])}>
          {Icon ? <Icon className="size-4" /> : initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{name}</div>
        {sub != null && sub !== "" && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

/** A monospaced id, shortened, with a copy button. */
export function IdChip({ value, label, short = 8 }: { value: string | number; label?: string; short?: number }) {
  const text = String(value);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess(`${label ?? "Id"} copied`);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      {label && <span className="text-muted-foreground">{label}</span>}
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
        {text.length > short + 1 ? `${text.slice(0, short)}…` : text}
      </code>
      <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label={`Copy ${label ?? "id"}`} onClick={copy}>
        <Copy className="size-3" />
      </Button>
    </span>
  );
}

/** A 0–max score as a number and a slim bar. */
export function ScoreBar({ value, max = 100, suffix }: { value?: number | null; max?: number; suffix?: string }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  // Full class names: Tailwind only generates classes it can see in the source.
  const tone =
    pct >= 75
      ? "[&>[data-slot=progress-indicator]]:bg-emerald-500"
      : pct >= 50
        ? "[&>[data-slot=progress-indicator]]:bg-brand-500"
        : pct >= 30
          ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
          : "[&>[data-slot=progress-indicator]]:bg-red-500";
  return (
    <div className="flex min-w-24 items-center gap-2">
      <span className="w-10 text-right font-medium tabular-nums">
        {Number.isInteger(value) ? value : value.toFixed(1)}
        {suffix}
      </span>
      <Progress value={pct} aria-label={`Score ${value} of ${max}`} className={cn("h-1.5 w-16", tone)} />
    </div>
  );
}

/** The checkbox column for row selection. */
export function selectColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: "select",
    size: 36,
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all on this page"
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} />
    ),
  };
}

export interface RowAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

/** The "…" menu at the end of a row. */
export function RowActions({ actions, label = "Actions" }: { actions: RowAction[]; label?: string }) {
  if (!actions.length) return null;
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 data-[state=open]:bg-accent" aria-label={label}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {actions.map((a) => (
            <React.Fragment key={a.label}>
              {a.separatorBefore && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={a.onSelect} disabled={a.disabled} variant={a.destructive ? "destructive" : "default"}>
                {a.icon && <a.icon />}
                {a.label}
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** What an empty table says: an icon, a title, a line of help and an optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-6 text-center">
      {Icon && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
