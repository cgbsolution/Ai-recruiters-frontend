"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Clock, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EvaluationResult } from "@/hooks/interview/useInterviewSession";
import type { EvaluationStatus } from "@/hooks/interview/useInterviewSession";

interface Props {
  evaluation: EvaluationResult | null;
  evaluationStatus: EvaluationStatus;
  onRetry: () => void;
  onFeedback: () => void;
  onSchedule: () => void;
}

export default function CompletionScreen({ evaluation, evaluationStatus, onRetry, onFeedback, onSchedule }: Props) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (evaluationStatus !== "processing") return;
    const t = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [evaluationStatus]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

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

        {/* Status card */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-6 text-center space-y-3">
          {evaluationStatus === "processing" && (
            <>
              <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-700 font-medium text-sm">Generating your evaluation report…</p>
              <p className="text-gray-400 text-xs leading-relaxed">
                This may take up to 2–3 minutes. Please keep this tab open.
              </p>
              {elapsedSeconds > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-400 text-xs">{formatElapsed(elapsedSeconds)} elapsed</span>
                </div>
              )}
            </>
          )}

          {evaluationStatus === "completed" && (
            <>
              <p className="text-gray-600 text-sm leading-relaxed">
                Your responses have been recorded and submitted for evaluation.
                Our team will carefully review your performance and get in touch with you soon.
              </p>
              <p className="text-gray-400 text-xs">
                You will receive an update via email regarding the next steps.
              </p>
            </>
          )}

          {evaluationStatus === "failed" && (
            <>
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-2">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Your interview responses have been saved. The evaluation report is taking longer than expected.
              </p>
              <p className="text-gray-400 text-xs">
                Don't worry — your data is safe. Click retry or check back later.
              </p>
            </>
          )}

          {evaluationStatus === "idle" && (
            <>
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Processing your interview… Please wait a moment.</p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {evaluationStatus === "failed" && (
            <Button
              onClick={onRetry}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Evaluation
            </Button>
          )}
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
