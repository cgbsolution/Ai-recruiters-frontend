"use client";

import { useEffect, useState } from "react";
import AvatarCanvas from "./AvatarCanvas";
import RealisticAvatar from "./RealisticAvatar";

interface Props {
  isSpeaking: boolean;
  isThinking: boolean;
  realistic?: boolean;
}

/**
 * Avatar wrapper — switches between:
 * - 3D RPM avatar (AvatarCanvas) — default
 * - Realistic human video loops (RealisticAvatar) — when realistic=true
 *
 * Auto-detects realistic mode if video files exist at /avatar/idle.mp4
 */
export default function AvatarScene({ isSpeaking, isThinking, realistic }: Props) {
  const [useRealistic, setUseRealistic] = useState(realistic ?? false);

  // Auto-detect: if /avatar/idle.mp4 exists, use realistic mode
  useEffect(() => {
    if (realistic !== undefined) return; // explicit prop overrides
    fetch("/avatar/idle.mp4", { method: "HEAD" })
      .then((res) => {
        if (res.ok) setUseRealistic(true);
      })
      .catch(() => {});
  }, [realistic]);

  return (
    <div className="w-full h-full overflow-hidden">
      {useRealistic ? (
        <RealisticAvatar isSpeaking={isSpeaking} isThinking={isThinking} />
      ) : (
        <AvatarCanvas isSpeaking={isSpeaking} isThinking={isThinking} />
      )}
    </div>
  );
}
