"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { reportClientEvent } from "@/lib/clientTelemetry";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Short tag identifying this boundary in telemetry (e.g. "avatar", "interview"). */
  name?: string;
  /**
   * When true, the recovery action does a full page reload instead of merely
   * clearing the error. Use this for stateful flows (the interview) where the
   * subtree that threw will just throw again unless the app re-initializes.
   * On reload the interview auto-resumes from its durable IndexedDB state.
   */
  reloadOnRecover?: boolean;
  /** Called when an error is caught — for extra logging/side effects. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retries: number;
}

// After this many in-place retries we stop offering "Try Again" and force a
// full reload, so a deterministic render error can't trap the user in a loop.
const MAX_INPLACE_RETRIES = 2;

/**
 * Detects the family of errors that are NOT bugs in our code but are caused by
 * something OUTSIDE React mutating the DOM React owns — overwhelmingly a page
 * translator (Google Translate) or a browser extension (Grammarly, ad blockers,
 * coupon/password tools). React then can't reconcile and throws e.g.
 * "Failed to execute 'insertBefore' on 'Node': ... not a child of this node".
 * Clearing the boundary won't help (the extension is still active), so we guide
 * the candidate to disable it and reload.
 */
function isExtensionDomError(error: Error | null): boolean {
  const m = (error?.message || "").toLowerCase();
  return (
    m.includes("insertbefore") ||
    m.includes("removechild") ||
    m.includes("appendchild") ||
    m.includes("not a child of this node") ||
    m.includes("the node to be removed is not a child") ||
    m.includes("the node before which the new node is to be inserted") ||
    m.includes("notfounderror")
  );
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retries: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    reportClientEvent({
      type: "react_error",
      message: `[${this.props.name ?? "root"}] ${error.message}`,
      context: {
        boundary: this.props.name ?? "root",
        extensionLikely: isExtensionDomError(error),
        stack: error.stack?.slice(0, 2000),
        componentStack: info.componentStack?.slice(0, 2000),
      },
    });
    this.props.onError?.(error, info);
  }

  private handleRecover = () => {
    // For extension/DOM-mutation errors, clearing the boundary is pointless —
    // the extension is still live and will re-break the next render. A full
    // reload (with translate disabled at the root) is the reliable recovery.
    const forceReload =
      isExtensionDomError(this.state.error) ||
      this.props.reloadOnRecover ||
      this.state.retries + 1 > MAX_INPLACE_RETRIES;
    if (forceReload && typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    this.setState((s) => ({ hasError: false, error: null, retries: s.retries + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // ── Extension / page-translator interference: explain + how to fix ──
      if (isExtensionDomError(this.state.error)) {
        return (
          <div className="notranslate flex min-h-[400px] items-center justify-center p-6">
            <div className="max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-8 dark:border-amber-800 dark:bg-amber-950/30">
              <h2 className="mb-2 text-xl font-bold text-amber-700 dark:text-amber-300">
                A browser extension is interfering with the interview
              </h2>
              <p className="mb-4 text-sm text-amber-800 dark:text-amber-200">
                Something on your browser is changing this page and stopping it from loading —
                almost always a <strong>page translator</strong> (like Google Translate) or an{" "}
                <strong>extension</strong> (Grammarly, ad blockers, coupon/password tools).
                Your progress and recording are safe.
              </p>
              <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                To continue:
              </p>
              <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
                <li>Turn off page translation — don&apos;t let your browser translate this page.</li>
                <li>
                  Disable browser extensions, or open this interview link in an{" "}
                  <strong>Incognito / Private window</strong> (extensions are off there).
                </li>
                <li>Then click <strong>Reload &amp; resume</strong> below.</li>
              </ol>
              <Button
                onClick={this.handleRecover}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Reload &amp; resume
              </Button>
            </div>
          </div>
        );
      }

      const willReload =
        this.props.reloadOnRecover || this.state.retries >= MAX_INPLACE_RETRIES;

      return (
        <div className="notranslate flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-950/30">
            <h2 className="mb-2 text-xl font-bold text-red-700 dark:text-red-400">
              Something went wrong
            </h2>
            <p className="mb-4 text-sm text-red-600 dark:text-red-300">
              {willReload
                ? "We hit a problem. Reloading will safely resume where you left off — your progress and recording are saved."
                : this.state.error?.message || "An unexpected error occurred."}
            </p>
            <Button
              variant="outline"
              onClick={this.handleRecover}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {willReload ? "Reload & resume" : "Try Again"}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
