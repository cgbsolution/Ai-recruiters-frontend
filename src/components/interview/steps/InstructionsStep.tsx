"use client";

import { Button } from "@/components/ui/button";
import { Clock, MessageSquare, Mic, Volume2, ArrowRight } from "lucide-react";
import type { JobConfig } from "@/hooks/interview/useInterviewSession";

interface Props {
  jobConfig: JobConfig;
  onNext: () => void;
}

export default function InstructionsStep({ jobConfig, onNext }: Props) {
  const instructions = [
    {
      icon: <Mic className="w-5 h-5 text-blue-500" />,
      bg: "bg-blue-50 border-blue-100",
      title: "Speak clearly",
      desc: "Click 'Start Speaking' to begin. Your voice will be transcribed in real-time.",
    },
    {
      icon: <Volume2 className="w-5 h-5 text-purple-500" />,
      bg: "bg-purple-50 border-purple-100",
      title: "Listen to AI Interviewer",
      desc: "Your AI interviewer will ask questions out loud. Listen carefully before responding.",
    },
    {
      icon: <MessageSquare className="w-5 h-5 text-green-500" />,
      bg: "bg-green-50 border-green-100",
      title: "One question at a time",
      desc: "Answer each question fully before moving to the next. Take your time to think.",
    },
    {
      icon: <Clock className="w-5 h-5 text-amber-500" />,
      bg: "bg-amber-50 border-amber-100",
      title: `${jobConfig.max_questions} questions total`,
      desc: `This interview has ${jobConfig.max_questions} questions and will take approximately ${Math.ceil(jobConfig.max_questions * 2)} minutes.`,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-10">
      <div className="w-full max-w-lg">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">How it works</h2>
        <p className="text-gray-500 text-center mb-8 text-sm">Read these instructions before starting your interview.</p>

        <div className="space-y-3 mb-8">
          {instructions.map((item, i) => (
            <div key={i} className={`flex gap-4 border rounded-xl p-4 ${item.bg}`}>
              <div className="mt-0.5 shrink-0">{item.icon}</div>
              <div>
                <p className="text-gray-900 font-semibold text-sm">{item.title}</p>
                <p className="text-gray-500 text-sm mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {jobConfig.special_instructions && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
            <p className="text-blue-700 text-sm font-semibold mb-1">Special Instructions</p>
            <p className="text-gray-700 text-sm">{jobConfig.special_instructions}</p>
          </div>
        )}

        <Button onClick={onNext} className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2">
          I Understand, Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
