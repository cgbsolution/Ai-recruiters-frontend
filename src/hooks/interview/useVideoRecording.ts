"use client";

import { useCallback, useRef, useState } from "react";

interface VideoRecordingHook {
  isRecording: boolean;
  startRecording: (stream: MediaStream) => void;
  stopRecording: () => Promise<{ blob: Blob; duration: string } | null>;
}

export function useVideoRecording(): VideoRecordingHook {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback((stream: MediaStream) => {
    if (!stream || !MediaRecorder) return;
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;

    chunksRef.current = [];

    // Prefer webm/vp8 — widely supported in Chrome/Edge
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";

    const options = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorderRef.current = recorder;
    startTimeRef.current = Date.now();
    recorder.start(1000); // collect chunks every second
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((): Promise<{ blob: Blob; duration: string } | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }

      const elapsedMs = Date.now() - startTimeRef.current;
      const totalSec = Math.round(elapsedMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const duration = `${mins}:${secs.toString().padStart(2, "0")}`;

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        recorderRef.current = null;
        setIsRecording(false);
        resolve({ blob, duration });
      };

      recorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
}
