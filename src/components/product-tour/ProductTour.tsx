"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react";
import { useProductTour } from "@/context/ProductTourContext";
import type { TourPlacement, TourStep } from "./tour-steps";
import { cn } from "@/lib/utils";

const POPOVER_W = 380;
const POPOVER_GAP = 14;
const VIEWPORT_PAD = 16;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Layout {
  rect: Rect | null;
  placement: TourPlacement;
}

function getElementRect(selector?: string): Rect | null {
  if (!selector || typeof window === "undefined") return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function resolvePlacement(preferred: TourPlacement, targetRect: Rect | null): TourPlacement {
  if (!targetRect || preferred === "center") return preferred;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fits: Record<TourPlacement, boolean> = {
    top: targetRect.top > 280,
    bottom: vh - (targetRect.top + targetRect.height) > 280,
    left: targetRect.left > POPOVER_W + POPOVER_GAP + VIEWPORT_PAD,
    right: vw - (targetRect.left + targetRect.width) > POPOVER_W + POPOVER_GAP + VIEWPORT_PAD,
    center: true,
  };
  if (fits[preferred]) return preferred;
  const order: TourPlacement[] = ["bottom", "top", "right", "left"];
  return order.find((p) => fits[p]) ?? "bottom";
}

function computePopoverPosition(
  rect: Rect | null,
  placement: TourPlacement,
  popoverHeight: number
): { top: number; left: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  if (!rect || placement === "center") {
    return {
      top: Math.max(VIEWPORT_PAD, vh / 2 - popoverHeight / 2),
      left: Math.max(VIEWPORT_PAD, vw / 2 - POPOVER_W / 2),
    };
  }

  let top = 0;
  let left = 0;
  switch (placement) {
    case "bottom":
      top = rect.top + rect.height + POPOVER_GAP;
      left = rect.left + rect.width / 2 - POPOVER_W / 2;
      break;
    case "top":
      top = rect.top - popoverHeight - POPOVER_GAP;
      left = rect.left + rect.width / 2 - POPOVER_W / 2;
      break;
    case "right":
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left + rect.width + POPOVER_GAP;
      break;
    case "left":
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left - POPOVER_W - POPOVER_GAP;
      break;
  }

  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - POPOVER_W - VIEWPORT_PAD));
  top = Math.max(VIEWPORT_PAD, Math.min(top, vh - popoverHeight - VIEWPORT_PAD));
  return { top, left };
}

export function ProductTour() {
  const { isOpen, steps, currentIndex, stop, next, prev } = useProductTour();
  const router = useRouter();
  const pathname = usePathname();

  const step: TourStep | undefined = steps[currentIndex];
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverHeightRef = useRef(240);

  const [layout, setLayout] = useState<Layout>({ rect: null, placement: "center" });
  const [mounted, setMounted] = useState(false);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prefetch the next step's route so navigation feels instant
  useEffect(() => {
    if (!isOpen) return;
    const upcoming = steps[currentIndex + 1];
    if (upcoming?.route) {
      try {
        router.prefetch(upcoming.route);
      } catch {
        // prefetch is best-effort
      }
    }
  }, [isOpen, steps, currentIndex, router]);

  // Navigate to this step's route if we're not already there
  useEffect(() => {
    if (!isOpen || !step) return;
    if (step.route && pathname !== step.route) {
      setNavigating(true);
      router.push(step.route);
    } else {
      setNavigating(false);
    }
  }, [isOpen, step, pathname, router]);

  // Measure the target element. Single useLayoutEffect, batched setState,
  // short retry only if the target hasn't mounted yet (page still loading).
  useLayoutEffect(() => {
    if (!isOpen || !step) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12; // ~360ms @ 30ms

    const measure = () => {
      if (cancelled) return;
      const rect = getElementRect(step.target);
      const preferred = step.placement ?? "bottom";

      // For center steps, or when target is found, commit the layout.
      if (!step.target || rect) {
        const placement = resolvePlacement(preferred, rect);
        setLayout({ rect, placement });
        if (popoverRef.current) {
          popoverHeightRef.current = popoverRef.current.offsetHeight || 240;
        }
        setNavigating(false);
        return;
      }

      // Target not in DOM yet — retry briefly, the page may still be mounting.
      if (attempts < maxAttempts) {
        attempts += 1;
        setTimeout(measure, 30);
      } else {
        // Give up — fall back to centered placement so the popover always shows.
        setLayout({ rect: null, placement: "center" });
        setNavigating(false);
      }
    };

    measure();

    const onScrollResize = () => {
      const rect = getElementRect(step.target);
      const preferred = step.placement ?? "bottom";
      const placement = resolvePlacement(preferred, rect);
      setLayout({ rect, placement });
    };

    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
  }, [isOpen, step, pathname]);

  // Scroll target into view if off-screen
  useEffect(() => {
    if (!isOpen || !step?.target) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.top < 80 || rect.bottom > vh - 80) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isOpen, step]);

  // Keyboard nav
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, stop, next, prev]);

  if (!mounted || !isOpen || !step) return null;

  const total = steps.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;
  const progress = ((currentIndex + 1) / total) * 100;

  const pos = computePopoverPosition(layout.rect, layout.placement, popoverHeightRef.current);
  const showSpotlight = !!layout.rect && layout.placement !== "center";
  const SPOT_PAD = 6;

  return createPortal(
    <div className="fixed inset-0 z-[9999]" aria-modal="true" role="dialog">
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: "auto" }}
        onClick={stop}
      >
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {showSpotlight && layout.rect && (
              <rect
                x={layout.rect.left - SPOT_PAD}
                y={layout.rect.top - SPOT_PAD}
                width={layout.rect.width + SPOT_PAD * 2}
                height={layout.rect.height + SPOT_PAD * 2}
                rx="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(8, 10, 24, 0.72)"
          mask="url(#tour-mask)"
        />
      </svg>

      {showSpotlight && layout.rect && (
        <div
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-indigo-400/80 shadow-[0_0_0_4px_rgba(99,102,241,0.25)]"
          style={{
            top: layout.rect.top - SPOT_PAD,
            left: layout.rect.left - SPOT_PAD,
            width: layout.rect.width + SPOT_PAD * 2,
            height: layout.rect.height + SPOT_PAD * 2,
          }}
        />
      )}

      <button
        type="button"
        onClick={stop}
        aria-label="Close tour"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-lg ring-1 ring-black/5 transition hover:bg-white hover:scale-105 dark:bg-gray-800 dark:text-gray-200"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Popover card — uses opacity transition only so position changes are instant */}
      <div
        ref={popoverRef}
        className={cn(
          "absolute w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 transition-opacity duration-150 dark:bg-gray-900 dark:ring-white/10",
          navigating ? "opacity-50" : "opacity-100"
        )}
        style={{
          top: pos.top,
          left: pos.left,
        }}
      >
        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">{step.title}</h3>
          </div>

          <p className="text-[13.5px] leading-relaxed text-gray-600 dark:text-gray-300">
            {step.description}
          </p>

          {/* Inline mockup of what real data will look like — so empty pages still teach. */}
          {step.preview && (
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2.5 dark:border-white/10 dark:bg-white/5">
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <Sparkles className="h-2.5 w-2.5" />
                Sample preview
              </div>
              {step.preview}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={prev}
              disabled={isFirst}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5",
                isFirst && "invisible"
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>

            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {currentIndex + 1} of {total}
            </span>

            {isLast ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-purple-600"
              >
                Finish
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-purple-600"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
