"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import type { JobConfig } from "@/hooks/interview/useInterviewSession";

interface Props {
  jobConfig: JobConfig;
  onNext: () => void;
}

export default function WhatToExpectStep({ jobConfig, onNext }: Props) {
  const orgName = jobConfig.organization_name || "the company";
  const managerName = jobConfig.manager_name;

  const points = [
    "Aria is your AI interviewer — she asks questions and listens to your full answer before responding",
    "You'll see a live transcript of your words as you speak — flag any errors instantly",
    "Take as long as you need — Aria waits for silence before moving to the next question",
    managerName
      ? `Your responses are reviewed by ${managerName} from ${orgName}'s talent team`
      : `Your responses are reviewed by ${orgName}'s talent team`,
    "You'll receive feedback within 3 business days, regardless of the outcome",
  ];

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Here&apos;s how it works</h1>
        <p className="text-gray-500 text-sm mb-8">
          No surprises. Here&apos;s exactly what will happen.
        </p>

        {/* Checklist */}
        <div className="space-y-5 mb-10">
          {points.map((point, i) => (
            <div key={i} className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 leading-relaxed">{point}</p>
            </div>
          ))}
        </div>

        {/* Fairness note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-10">
          <p className="text-sm text-amber-800 leading-relaxed">
            This interview is evaluated fairly and consistently — the same questions, same scoring,
            for every candidate. No bias for name, gender, or background.
          </p>
        </div>

        {/* CTA */}
        <Button
          onClick={onNext}
          className="w-full h-13 text-base bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-md shadow-violet-200"
        >
          I&apos;m ready — try a practice round
        </Button>
      </div>
    </div>
  );
}
