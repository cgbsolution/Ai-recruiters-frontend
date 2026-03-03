"use client";

import { Button } from "@/components/ui/button";
import { Clock, MessageSquare, Mic, Volume2 } from "lucide-react";
import type { JobConfig } from "@/hooks/interview/useInterviewSession";

interface Props {
  jobConfig: JobConfig;
  onNext: () => void;
}

export default function InstructionsStep({ jobConfig, onNext }: Props) {
  const instructions = [
    {
      icon: <Mic className="w-5 h-5 text-blue-400" />,
      title: "Speak clearly",
      desc: "Click the microphone button to start speaking. Your voice will be transcribed in real-time.",
    },
    {
      icon: <Volume2 className="w-5 h-5 text-purple-400" />,
      title: "Listen to AI",
      desc: "Alex, your AI interviewer, will ask questions out loud. Listen carefully before responding.",
    },
    {
      icon: <MessageSquare className="w-5 h-5 text-green-400" />,
      title: "One question at a time",
      desc: "Answer each question fully before moving to the next. Take your time to think.",
    },
    {
      icon: <Clock className="w-5 h-5 text-yellow-400" />,
      title: `${jobConfig.max_questions} questions total`,
      desc: `This interview has ${jobConfig.max_questions} questions and will take approximately ${Math.ceil(jobConfig.max_questions * 2)} minutes.`,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-md">
        <h2 className="text-3xl font-bold text-white mb-2 text-center">How it works</h2>
        <p className="text-gray-400 text-center mb-8">
          Read these instructions before starting your interview.
        </p>

        <div className="space-y-4 mb-8">
          {instructions.map((item, i) => (
            <div key={i} className="bg-gray-900 rounded-xl p-4 flex gap-4">
              <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
              <div>
                <p className="text-white font-semibold text-sm">{item.title}</p>
                <p className="text-gray-400 text-sm mt-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {jobConfig.special_instructions && (
          <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4 mb-8">
            <p className="text-blue-300 text-sm font-semibold mb-1">Special Instructions</p>
            <p className="text-gray-300 text-sm">{jobConfig.special_instructions}</p>
          </div>
        )}

        <Button onClick={onNext} className="w-full h-12 bg-blue-600 hover:bg-blue-700">
          I Understand, Continue
        </Button>
      </div>
    </div>
  );
}
