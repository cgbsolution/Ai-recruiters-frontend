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
                stroke={(hovered || rating) >= star ? "#facc15" : "#4b5563"}
              />
            </Button>
          ))}
        </div>

        <div className="space-y-4 mb-8">
          {/* Comment */}
          <div>
            <Label className="block text-gray-300 text-sm font-medium mb-1">
              Any comments? (optional)
            </Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
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
            <Label htmlFor="technical-issues" className="text-gray-300 text-sm cursor-pointer">
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
            <Label htmlFor="would-recommend" className="text-gray-300 text-sm cursor-pointer">
              I would recommend this platform to others
            </Label>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Feedback"}
        </Button>

        <Button
          variant="ghost"
          onClick={onDone}
          className="w-full mt-3 text-gray-500 text-sm hover:text-gray-300 transition-colors"
        >
          Skip
        </Button>
      </div>
    </div>
  );
}
