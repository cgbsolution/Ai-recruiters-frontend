"use client";

import React from "react";
import type { CandidateBrand } from "@/lib/talent";
import { cn } from "@/lib/utils";

export type Brand = CandidateBrand;

/** The shell every candidate page shares: a single readable column, headed by
 *  the organization's logo (or name in its colour) — the same branding as its emails. */
export function CandidateFrame({ org, brand, children }: { org?: string; brand?: Brand; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      {brand?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- an organization's own https logo, any host
        <img src={brand.logo_url} alt={org ?? ""} className="mb-6 h-9 w-auto max-w-[220px] object-contain" />
      ) : (
        org && (
          <div className="mb-6 text-sm font-semibold tracking-wide text-gray-500" style={brand ? { color: brand.color } : undefined}>
            {org}
          </div>
        )
      )}
      {children}
      <p className="mt-10 text-xs leading-5 text-gray-400">
        This page was opened from a private link sent to you. Don&apos;t share it.
      </p>
    </main>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6", className)}>{children}</div>;
}

export function LinkProblem() {
  return (
    <CandidateFrame>
      <Card>
        <h1 className="text-lg font-semibold">This link has expired or was already used</h1>
        <p className="mt-2 text-sm text-gray-600">
          Links in our emails work for a limited time, and some work only once. Our next email will bring a new one, or
          you can contact the company that wrote to you.
        </p>
      </Card>
    </CandidateFrame>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:text-sm";

export function PrimaryButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60",
        className,
      )}
    />
  );
}

export function SecondaryButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60",
        className,
      )}
    />
  );
}
