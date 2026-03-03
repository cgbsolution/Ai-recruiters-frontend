"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";

interface Props {
  sessionId: number;
  onDone: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function FeedbackForm({ sessionId, onDone }: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [technicalIssues, setTechnicalIssues] = useState(false);
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/interview/sessions/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          experience_comment: comment || null,
          technical_issues: technicalIssues,
          would_recommend: wouldRecommend,
        }),
      });
      setDone(true);
    } catch {
      // non-blocking
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="text-6xl mb-6">🎉</div>
        <h2 className="text-2xl font-bold text-white mb-2">Thank you!</h2>
        <p className="text-gray-400 mb-8">Your feedback helps us improve the interview experience.</p>
        <Button onClick={onDone} className="h-12 px-8 bg-blue-600 hover:bg-blue-700">
          Close Interview
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-md">
        <h2 className="text-3xl font-bold text-white mb-2 text-center">Share Your Experience</h2>
        <p className="text-gray-400 text-center mb-8">How was your interview experience?</p>

        {/* Star rating */}
        <div className="flex justify-center gap-3 mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(star)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className="w-10 h-10 transition-colors"
                fill={(hovered || rating) >= star ? "#facc15" : "none"}
                stroke={(hovered || rating) >= star ? "#facc15" : "#4b5563"}
              />
            </button>
          ))}
        </div>

        <div className="space-y-4 mb-8">
          {/* Comment */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">
              Any comments? (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Share your thoughts about the interview..."
            />
          </div>

          {/* Technical issues */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={technicalIssues}
              onChange={(e) => setTechnicalIssues(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-gray-300 text-sm">I experienced technical issues</span>
          </label>

          {/* Would recommend */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={wouldRecommend}
              onChange={(e) => setWouldRecommend(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-gray-300 text-sm">I would recommend this platform to others</span>
          </label>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Feedback"}
        </Button>

        <button
          onClick={onDone}
          className="w-full mt-3 text-gray-500 text-sm hover:text-gray-300 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
