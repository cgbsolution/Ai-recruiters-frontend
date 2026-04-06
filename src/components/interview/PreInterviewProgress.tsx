"use client";

import { Check } from "lucide-react";

interface Props {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

const STEPS = [
  { num: "01", label: "Welcome" },
  { num: "02", label: "Language" },
  { num: "03", label: "What to Expect" },
  { num: "04", label: "Permissions" },
  { num: "05", label: "ID Verification" },
  { num: "06", label: "Device Test" },
  { num: "07", label: "Practice" },
  { num: "08", label: "Interview Prep" },
];

export default function PreInterviewProgress({ currentStep }: Props) {
  return (
    <div className="flex items-center justify-center py-3.5 px-6 w-full">
      <div className="flex items-center bg-white/[0.06] backdrop-blur-xl rounded-full px-2 py-1.5 border border-white/[0.08] shadow-lg">
        {STEPS.map((step, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <div key={i} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-300 ${
                  isDone
                    ? "bg-green-500 text-white shadow-sm shadow-green-500/30"
                    : isActive
                    ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30"
                    : "text-gray-400"
                }`}
              >
                {isDone ? (
                  <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </div>
                ) : (
                  <span className="text-[11px] font-bold tracking-wide">{step.num}</span>
                )}
                <span className="whitespace-nowrap">{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px w-8 mx-0.5 transition-colors duration-300 ${
                    stepNum < currentStep ? "bg-green-500/60" : "bg-white/10"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
