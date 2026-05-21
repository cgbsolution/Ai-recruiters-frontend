"use client";

import { Sparkles } from "lucide-react";
import { useProductTour } from "@/context/ProductTourContext";
import { cn } from "@/lib/utils";

interface TryDemoButtonProps {
  className?: string;
}

export function TryDemoButton({ className }: TryDemoButtonProps) {
  const { start } = useProductTour();

  return (
    <button
      type="button"
      onClick={start}
      className={cn(
        "group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-indigo-200/60 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/15 dark:border-indigo-400/30 dark:bg-gray-900 dark:text-indigo-300 dark:hover:border-indigo-400/60",
        className
      )}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-indigo-100/60 to-transparent transition-transform duration-700 group-hover:translate-x-full dark:via-indigo-400/10" />
      <Sparkles className="h-3.5 w-3.5 text-indigo-500 transition-transform group-hover:rotate-12 dark:text-indigo-300" />
      Try a Demo
    </button>
  );
}
