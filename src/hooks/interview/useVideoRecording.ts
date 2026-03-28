"use client";

import { useCallback, useRef, useState } from "react";

interface VideoRecordingHook {
  isRecording: boolean;
  startRecording: (webcamStream: MediaStream | null, screenStream: MediaStream | null) => void;
  stopRecording: () => Promise<{ blob: Blob; duration: string } | null>;
}

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
// Webcam strip at bottom-center: 320x180
const CAM_WIDTH = 320;
const CAM_HEIGHT = 180;
const FPS = 15;

export function useVideoRecording(): VideoRecordingHook {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

  const startRecording = useCallback((webcamStream: MediaStream | null, screenStream: MediaStream | null) => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;
    if (!webcamStream && !screenStream) return;

    chunksRef.current = [];

    // Create off-screen canvas
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Create hidden video elements to feed the canvas
    if (screenStream) {
      const sv = document.createElement("video");
      sv.srcObject = screenStream;
      sv.muted = true;
      sv.playsInline = true;
      sv.play().catch(() => {});
      screenVideoRef.current = sv;
    }

    if (webcamStream) {
      const wv = document.createElement("video");
      wv.srcObject = webcamStream;
      wv.muted = true;
      wv.playsInline = true;
      wv.play().catch(() => {});
      webcamVideoRef.current = wv;
    }

    // Draw loop: screen (top) + webcam strip (bottom-center)
    drawIntervalRef.current = setInterval(() => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const sv = screenVideoRef.current;
      const wv = webcamVideoRef.current;
      const hasCam = wv && wv.readyState >= 2;
      const hasScreen = sv && sv.readyState >= 2;

      // Screen area = top portion, webcam strip at bottom
      const screenAreaH = hasCam ? CANVAS_HEIGHT - CAM_HEIGHT : CANVAS_HEIGHT;

      // Draw screen share
      if (hasScreen) {
        const sw = sv.videoWidth || CANVAS_WIDTH;
        const sh = sv.videoHeight || CANVAS_HEIGHT;
        const scale = Math.min(CANVAS_WIDTH / sw, screenAreaH / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const dx = (CANVAS_WIDTH - dw) / 2;
        const dy = (screenAreaH - dh) / 2;
        ctx.drawImage(sv, dx, dy, dw, dh);
      }

      // Draw webcam as bottom-center strip
      if (hasCam) {
        const camY = CANVAS_HEIGHT - CAM_HEIGHT;
        // Center the webcam horizontally, maintaining aspect ratio
        const camAspect = (wv.videoWidth || 4) / (wv.videoHeight || 3);
        const drawW = Math.min(CAM_WIDTH, CAM_HEIGHT * camAspect);
        const drawX = (CANVAS_WIDTH - drawW) / 2;

        // Dark background behind camera strip
        ctx.fillStyle = "#111";
        ctx.fillRect(0, camY, CANVAS_WIDTH, CAM_HEIGHT);

        // Separator line
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, camY);
        ctx.lineTo(CANVAS_WIDTH, camY);
        ctx.stroke();

        // Draw camera feed centered
        ctx.drawImage(wv, drawX, camY, drawW, CAM_HEIGHT);
      } else if (wv && !hasScreen) {
        // No screen stream — draw webcam as the main content
        ctx.drawImage(wv, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    }, 1000 / FPS);

    // Capture the canvas stream
    const canvasStream = canvas.captureStream(FPS);

    // Mix audio from webcam (mic) + screen (system/avatar) using AudioContext
    const micTracks = webcamStream ? webcamStream.getAudioTracks() : [];
    const sysTracks = screenStream ? screenStream.getAudioTracks() : [];

    if (micTracks.length > 0 || sysTracks.length > 0) {
      try {
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();

        if (micTracks.length > 0) {
          const micSource = audioCtx.createMediaStreamSource(
            new MediaStream(micTracks)
          );
          micSource.connect(dest);
        }

        if (sysTracks.length > 0) {
          const sysSource = audioCtx.createMediaStreamSource(
            new MediaStream(sysTracks)
          );
          sysSource.connect(dest);
        }

        // Add the mixed audio track to the canvas stream
        for (const track of dest.stream.getAudioTracks()) {
          canvasStream.addTrack(track);
        }
      } catch {
        // Fallback: add tracks directly without mixing
        for (const t of micTracks) canvasStream.addTrack(t);
        for (const t of sysTracks) canvasStream.addTrack(t);
      }
    }

    // Prefer webm/vp8
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";

    const options = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(canvasStream, options);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorderRef.current = recorder;
    startTimeRef.current = Date.now();
    recorder.start(1000);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((): Promise<{ blob: Blob; duration: string } | null> => {
    return new Promise((resolve) => {
      // Stop the draw loop
      if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = null;
      }

      // Clean up video elements
      if (screenVideoRef.current) {
        screenVideoRef.current.pause();
        screenVideoRef.current.srcObject = null;
        screenVideoRef.current = null;
      }
      if (webcamVideoRef.current) {
        webcamVideoRef.current.pause();
        webcamVideoRef.current.srcObject = null;
        webcamVideoRef.current = null;
      }

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
        canvasRef.current = null;
        setIsRecording(false);
        resolve({ blob, duration });
      };

      recorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
}
