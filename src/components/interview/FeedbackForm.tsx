"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { apiPost } from "@/lib/api";

interface Props {
  sessionId: number;
  onDone: () => void;
}

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
      await apiPost(`/interview/sessions/${sessionId}/feedback`, {
        rating,
        experience_comment: comment || null,
        technical_issues: technicalIssues,
        would_recommend: wouldRecommend,
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
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <div className="w-16 h-16 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mb-6">
          <span className="text-3xl">🎉</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank you!</h2>
        <p className="text-gray-500 mb-8">Your feedback helps us improve the interview experience.</p>
        <Button onClick={onDone} className="h-12 px-8 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-md shadow-blue-200">
          Close Interview
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-white">
      <div className="w-full max-w-md">
        <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">Share Your Experience</h2>
        <p className="text-gray-500 text-center mb-8">How was your interview experience?</p>

        {/* Star rating */}
        <div className="flex justify-center gap-3 mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <Button
              key={star}
              variant="ghost"
              size="icon"
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(star)}
              className="transition-transform hover:scale-110 hover:bg-transparent"
            >
              <Star
                className="w-10 h-10 transition-colors"
                fill={(hovered || rating) >= star ? "#facc15" : "none"}
                stroke={(hovered || rating) >= star ? "#facc15" : "#d1d5db"}
              />
            </Button>
          ))}
        </div>

        <div className="space-y-4 mb-8">
          {/* Comment */}
          <div>
            <Label className="block text-gray-700 text-sm font-medium mb-1">
              Any comments? (optional)
            </Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Share your thoughts about the interview..."
            />
          </div>

          {/* Technical issues */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="technical-issues"
              checked={technicalIssues}
              onCheckedChange={(checked) => setTechnicalIssues(checked === true)}
            />
            <Label htmlFor="technical-issues" className="text-gray-700 text-sm cursor-pointer">
              I experienced technical issues
            </Label>
          </div>

          {/* Would recommend */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="would-recommend"
              checked={wouldRecommend}
              onCheckedChange={(checked) => setWouldRecommend(checked === true)}
            />
            <Label htmlFor="would-recommend" className="text-gray-700 text-sm cursor-pointer">
              I would recommend this platform to others
            </Label>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50 rounded-xl shadow-md shadow-blue-200"
        >
          {submitting ? "Submitting..." : "Submit Feedback"}
        </Button>

        <Button
          variant="ghost"
          onClick={onDone}
          className="w-full mt-3 text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Skip
        </Button>
      </div>
    </div>
  );
}
