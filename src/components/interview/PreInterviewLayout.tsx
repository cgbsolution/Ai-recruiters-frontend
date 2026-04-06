"use client";
import PreInterviewProgress from "./PreInterviewProgress";

interface Props {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  children: React.ReactNode;
}

export default function PreInterviewLayout({ currentStep, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Dark navbar with branding + progress bar */}
      <div className="bg-gray-950 w-full shrink-0">
        <div className="flex items-center justify-between px-6 py-0">
          {/* Branding */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            <span className="text-white text-sm font-semibold tracking-tight">
              anytimehire<span className="text-blue-400">.ai</span>
            </span>
          </div>
          {/* Progress steps */}
          <div className="flex-1 flex justify-center">
            <PreInterviewProgress currentStep={currentStep} />
          </div>
          {/* Spacer for centering */}
          <div className="w-[130px] shrink-0" />
        </div>
      </div>
      {/* White content area */}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
