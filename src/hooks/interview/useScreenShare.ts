"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ScreenShareHook {
  screenStream: MediaStream | null;
  isSharing: boolean;
  requestScreenShare: () => Promise<MediaStream | null>;
  stopScreenShare: () => void;
}

export function useScreenShare(): ScreenShareHook {
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Monitor the video track for unexpected stops
  useEffect(() => {
    if (!screenStream) {
      setIsSharing(false);
      return;
    }

    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) {
      setIsSharing(false);
      return;
    }

    setIsSharing(true);

    const handleEnded = () => {
      setIsSharing(false);
    };

    videoTrack.addEventListener("ended", handleEnded);
    return () => {
      videoTrack.removeEventListener("ended", handleEnded);
    };
  }, [screenStream]);

  const requestScreenShare = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" } as any,
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings() as any;

      // Check if entire screen was selected (not a window or tab)
      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        stream.getTracks().forEach((t) => t.stop());
        return null; // Signal wrong surface
      }

      streamRef.current = stream;
      setScreenStream(stream);
      setIsSharing(true);
      return stream;
    } catch {
      return null;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScreenStream(null);
    setIsSharing(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { screenStream, isSharing, requestScreenShare, stopScreenShare };
}
