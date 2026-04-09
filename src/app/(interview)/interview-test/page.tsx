"use client";

import { useState, useCallback } from "react";
import InterviewRoom from "@/components/interview/InterviewRoom";
import type { Message, QuestionState, JobConfig } from "@/hooks/interview/useInterviewSession";

/**
 * Test page: exact same InterviewRoom component as production.
 * URL: /interview-test
 * No backend, no session, no violations, no API calls.
 */

const MOCK_CONFIG: JobConfig = {
  job_id: 1,
  title: "Senior Software Developer",
  department: "Engineering",
  location: "Remote",
  experience_level: "3-5 Years",
  experience_min: 3,
  experience_max: 5,
  max_questions: 5,
  mode: "SCENARIO",
  virtual_avatar: true,
  webcam_required: false,
  face_match: false,
  resume_based: false,
  code_editor_required: false,
  allow_mobile: true,
  secondary_cam: false,
  manual_interview: false,
  special_instructions: "",
  auto_skip_timeout: 0,
  skills: ["React", "Node.js", "TypeScript", "CSS"],
};

const AI_RESPONSES = [
  "Great, thanks for sharing that! Now, imagine you're working on a React project and a client reports that a specific page loads very slowly on mobile. You check and find the page has 50+ components rendering on mount. Walk me through what steps you'd take to diagnose and fix the performance issue.",
  "Good approach. Let's say you're building a REST API with Node.js and Express. A teammate pushes code that causes the API to return 500 errors intermittently — sometimes it works, sometimes it doesn't. How would you debug this? What tools would you use?",
  "Interesting. Now imagine you're reviewing a pull request from a junior developer. The code works but has no error handling, uses var instead of const/let, and has deeply nested callbacks. How would you give feedback without discouraging them?",
  "Nice answer. One last question — your team needs to choose between Next.js and Remix for a new project. The client needs SEO, fast page loads, and real-time features. What would you recommend and why?",
  "Thank you for your time! That concludes our interview. We'll be in touch soon.",
];

export default function InterviewTestPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      content: "Hi there! I'm Nira, your AI interviewer for the Senior Software Developer position. Before we begin, could you take a moment to introduce yourself? Tell me about your background and what you've been working on recently.",
      questionIndex: 0,
    },
  ]);
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [qCount, setQCount] = useState(0);
  const [language, setLanguage] = useState("en");

  const handleSend = useCallback(async (text: string): Promise<boolean> => {
    setMessages((p) => [...p, { role: "candidate", content: text, questionIndex: qCount }]);
    setIsThinking(true);
    await new Promise((r) => setTimeout(r, 1500));

    const next = qCount + 1;
    const aiText = AI_RESPONSES[Math.min(next - 1, AI_RESPONSES.length - 1)];
    const done = next >= AI_RESPONSES.length;

    setMessages((p) => [...p, { role: "ai", content: aiText, questionIndex: next }]);
    setQuestionStates((p) => [...p, { index: next, status: "active", aiMessage: aiText }]);
    setQCount(next);
    setIsThinking(false);
    if (done) setIsComplete(true);
    return true;
  }, [qCount]);

  const handleSkip = useCallback(async (): Promise<boolean> => {
    return handleSend("[SKIP] Candidate skipped this question.");
  }, [handleSend]);

  return (
    <div className="h-screen flex flex-col">
      {/* Test bar */}
      <div className="bg-gray-900 text-white px-4 py-1.5 flex items-center gap-4 text-[11px] shrink-0 z-50">
        <span className="font-bold text-yellow-400">TEST MODE</span>
        <span className="text-gray-500">No backend / No violations / No session</span>
        <span className="text-gray-500">|</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5"
        >
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>
        <button
          onClick={() => {
            setMessages([{ role: "ai", content: "Hi! I'm Nira. Tell me about yourself.", questionIndex: 0 }]);
            setQuestionStates([]);
            setIsThinking(false);
            setIsComplete(false);
            setQCount(0);
          }}
          className="bg-red-600 hover:bg-red-500 px-3 py-0.5 rounded"
        >
          Reset
        </button>
      </div>

      {/* Exact same InterviewRoom as production */}
      <div className="flex-1 overflow-hidden">
        <InterviewRoom
          sessionId={0}
          jobConfig={MOCK_CONFIG}
          messages={messages}
          questionStates={questionStates}
          isThinking={isThinking}
          isInterviewComplete={isComplete}
          onSendMessage={handleSend}
          onSkipQuestion={handleSkip}
          onComplete={() => setIsComplete(true)}
          webcamStream={null}
          screenStream={null}
          interviewLanguage={language}
        />
      </div>
    </div>
  );
}
