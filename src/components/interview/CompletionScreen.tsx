"use client";

import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EvaluationResult } from "@/hooks/interview/useInterviewSession";

interface Props {
  evaluation: EvaluationResult | null;
  onFeedback: () => void;
  onSchedule: () => void;
}

export default function CompletionScreen({ evaluation, onFeedback, onSchedule }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 bg-white">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Interview Complete</h1>
          <p className="text-gray-500 mt-3 max-w-sm mx-auto leading-relaxed">
            Your interview has been successfully completed. Thank you for your time and effort.
          </p>
        </div>

        {/* Simple completion message — NO scores shown to candidate */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-6 text-center space-y-3">
          {evaluation ? (
            <>
              <p className="text-gray-600 text-sm leading-relaxed">
                Your responses have been recorded and submitted for evaluation.
                Our team will carefully review your performance and get in touch with you soon.
              </p>
              <p className="text-gray-400 text-xs">
                You will receive an update via email regarding the next steps.
              </p>
            </>
          ) : (
            <>
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                Processing your interview... Please wait a moment.
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {evaluation?.meets_threshold && (
            <Button
              onClick={onSchedule}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-md shadow-blue-200"
            >
              Schedule a Meeting
            </Button>
          )}
          <Button
            onClick={onFeedback}
            variant="outline"
            className="w-full h-12 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl"
          >
            Share Your Feedback
          </Button>
        </div>
      </div>
    </div>
  );
}
