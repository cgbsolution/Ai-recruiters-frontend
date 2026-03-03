"use client";

import AvatarCanvas from "./AvatarCanvas";

interface Props {
  isSpeaking: boolean;
  isThinking: boolean;
}

export default function AvatarScene({ isSpeaking, isThinking }: Props) {
  return (
    <div className="w-full h-full overflow-hidden">
      <AvatarCanvas isSpeaking={isSpeaking} isThinking={isThinking} />
    </div>
  );
}
