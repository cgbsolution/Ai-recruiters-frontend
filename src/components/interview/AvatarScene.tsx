"use client";

import { memo } from "react";
import AvatarCanvas from "./AvatarCanvas";

interface Props {
  isSpeaking: boolean;
  isThinking: boolean;
}

/**
 * Avatar wrapper — memoized to prevent re-mounting on parent re-renders.
 * Re-mounting the 3D canvas causes the avatar to disappear and reload.
 */
const AvatarScene = memo(function AvatarScene({ isSpeaking, isThinking }: Props) {
  return (
    <div className="w-full h-full overflow-hidden">
      <AvatarCanvas isSpeaking={isSpeaking} isThinking={isThinking} />
    </div>
  );
});

export default AvatarScene;
