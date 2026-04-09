"use client";

import { useEffect, useRef } from "react";

interface Props {
  isSpeaking: boolean;
  isThinking: boolean;
}

/**
 * Realistic human avatar using pre-recorded video loops.
 *
 * Place these files in public/avatar/:
 *   - idle.mp4     (5s loop — person sitting naturally, blinking)
 *   - speaking.mp4  (5s loop — person talking with mouth movement)
 *   - thinking.mp4  (5s loop — person looking thoughtful)
 *
 * The component crossfades between videos based on isSpeaking/isThinking state.
 */
export default function RealisticAvatar({ isSpeaking, isThinking }: Props) {
  const idleRef = useRef<HTMLVideoElement>(null);
  const speakingRef = useRef<HTMLVideoElement>(null);
  const thinkingRef = useRef<HTMLVideoElement>(null);

  // Determine which video should be active
  const activeState = isSpeaking ? "speaking" : isThinking ? "thinking" : "idle";

  // Crossfade between videos on state change
  useEffect(() => {
    const videos = {
      idle: idleRef.current,
      speaking: speakingRef.current,
      thinking: thinkingRef.current,
    };

    // Play the active video, pause others
    Object.entries(videos).forEach(([state, video]) => {
      if (!video) return;
      if (state === activeState) {
        video.style.opacity = "1";
        video.play().catch(() => {});
      } else {
        video.style.opacity = "0";
        // Don't pause immediately — let crossfade finish
        setTimeout(() => {
          if (video.style.opacity === "0") {
            video.pause();
            video.currentTime = 0;
          }
        }, 400);
      }
    });
  }, [activeState]);

  // Auto-play idle on mount
  useEffect(() => {
    if (idleRef.current) {
      idleRef.current.play().catch(() => {});
    }
  }, []);

  const videoClass =
    "absolute inset-0 w-full h-full object-cover transition-opacity duration-300";

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#eef0f8] rounded-2xl">
      {/* Idle video — default state */}
      <video
        ref={idleRef}
        src="/avatar/idle.mp4"
        className={videoClass}
        style={{ opacity: activeState === "idle" ? 1 : 0 }}
        loop
        muted
        playsInline
        preload="auto"
      />

      {/* Speaking video — shown when TTS is active */}
      <video
        ref={speakingRef}
        src="/avatar/speaking.mp4"
        className={videoClass}
        style={{ opacity: activeState === "speaking" ? 1 : 0 }}
        loop
        muted
        playsInline
        preload="auto"
      />

      {/* Thinking video — shown when AI is processing */}
      <video
        ref={thinkingRef}
        src="/avatar/thinking.mp4"
        className={videoClass}
        style={{ opacity: activeState === "thinking" ? 1 : 0 }}
        loop
        muted
        playsInline
        preload="auto"
      />

      {/* Speaker icon overlay when speaking */}
      {isSpeaking && (
        <button className="absolute bottom-3 left-3 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm border border-gray-200/50">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        </button>
      )}
    </div>
  );
}
