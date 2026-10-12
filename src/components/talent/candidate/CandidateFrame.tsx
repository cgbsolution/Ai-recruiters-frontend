"use client";

import React from "react";
import type { CandidateBrand } from "@/lib/talent";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type Brand = CandidateBrand;

/** The shell every candidate page shares: a single readable column, headed by
 *  the organization's logo (or name in its colour) — the same branding as its emails. */
export function CandidateFrame({ org, brand, children }: { org?: string; brand?: Brand; children: React.ReactNode }) {
  return (
    <main className="talent-ui mx-auto max-w-xl px-4 py-8 sm:py-12">
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

export function LinkProblem() {
  return (
    <CandidateFrame>
      <Card>
        <CardHeader>
          <CardTitle className="leading-snug">
            <h1 className="text-lg font-semibold">This link has expired or was already used</h1>
          </CardTitle>
          <CardDescription className="mt-1 text-gray-600">
            Links in our emails work for a limited time, and some work only once. Our next email will bring a new one, or
            you can contact the company that wrote to you.
          </CardDescription>
        </CardHeader>
      </Card>
    </CandidateFrame>
  );
}
