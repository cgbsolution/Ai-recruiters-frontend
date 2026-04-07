"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, User } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/interview/useSpeechRecognition";

const PRACTICE_QUESTION =
  "Tell me a little about yourself — where you're based and what kind of work you enjoy most.";

interface Props {
  onStart: () => void;
  onSkip: () => void;
}

export default function PracticeRoundStep({ onStart, onSkip }: Props) {
  const [phase, setPhase] = useState<"intro" | "listening" | "done">("intro");
  const [simulating, setSimulating] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const charIndex = useRef(0);

  const { transcript, isListening, start, stop, isSupported } = useSpeechRecognition();

  // Simulate "speaking" the question character by character
  const simulateSpeak = useCallback(() => {
    setSimulating(true);
    setDisplayedText("");
    charIndex.current = 0;
    const interval = setInterval(() => {
      charIndex.current++;
      setDisplayedText(PRACTICE_QUESTION.slice(0, charIndex.current));
      if (charIndex.current >= PRACTICE_QUESTION.length) {
        clearInterval(interval);
        setSimulating(false);
        setPhase("listening");
      }
    }, 30);
    return () => clearInterval(interval);
  }, []);

  // Auto-simulate on mount
  useEffect(() => {
    const cleanup = simulateSpeak();
    return cleanup;
  }, [simulateSpeak]);

  const handleStartSpeaking = () => {
    if (isSupported) start();
  };

  const handleStopSpeaking = () => {
    stop();
    setPhase("done");
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Practice round</h1>
          <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1 rounded-full">
            Not scored
          </span>
        </div>
        <p className="text-gray-500 text-sm mb-8">
          Get familiar with Nira and the format. This does not affect your interview.
        </p>

        {/* Nira speaking */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-900">Nira</span>
              <span className="text-xs text-gray-400">· AI Interviewer</span>
            </div>
            {simulating && (
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs text-violet-500 font-medium">Speaking...</span>
                <div className="flex items-center gap-0.5">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-violet-400 rounded-full animate-pulse"
                      style={{
                        height: `${8 + Math.random() * 8}px`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: `${0.4 + Math.random() * 0.3}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Question text */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 mb-8">
          <p className="text-sm text-gray-700 italic leading-relaxed">
            &ldquo;{displayedText || PRACTICE_QUESTION}&rdquo;
          </p>
        </div>

        {/* Live transcript */}
        {(isListening || transcript || phase === "done") && (
          <div className="mb-8">
            <p className="text-sm font-semibold text-gray-900 mb-2">Live transcript</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 min-h-[60px]">
              <p className="text-sm text-gray-600 leading-relaxed">
                {transcript || (
                  <span className="text-gray-400 italic">Your words will appear here...</span>
                )}
                {isListening && <span className="animate-pulse text-violet-500">|</span>}
              </p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3 mb-8">
          {phase === "listening" && !isListening && (
            <Button
              variant="outline"
              onClick={handleStartSpeaking}
              disabled={!isSupported}
              className="gap-2 border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              <Mic className="w-4 h-4" />
              Click to speak
            </Button>
          )}
          {isListening && (
            <Button
              onClick={handleStopSpeaking}
              className="gap-2 bg-red-500 hover:bg-red-400 text-white"
            >
              <Square className="w-3 h-3 fill-current" />
              Stop
            </Button>
          )}
          {phase !== "intro" && !isListening && (
            <Button
              variant="outline"
              onClick={simulateSpeak}
              className="border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100"
            >
              Simulate
            </Button>
          )}
        </div>

        {/* Action buttons */}
        <Button
          onClick={onStart}
          className="w-full h-13 text-base bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-md shadow-violet-200 mb-3"
        >
          I&apos;m comfortable — start real interview
        </Button>
        <button
          onClick={onSkip}
          className="w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
        >
          Skip practice and start →
        </button>
      </div>
    </div>
  );
}
