"use client";

/**
 * Candidate-side: low-frame-rate JPEG streamer for the live observer feature.
 *
 * Captures the candidate's webcam at a few frames per second by drawing the
 * <video> element to an offscreen <canvas>, encodes as JPEG, and sends the
 * blob over a WebSocket to the backend. The backend fans the binary frames
 * out to every connected observer.
 *
 * Why JPEG-over-WebSocket instead of WebRTC: WebRTC requires direct P2P
 * connectivity (or paid TURN) and frequently fails on real-world networks.
 * This path goes through your own backend — no NAT traversal, no third-party,
 * works on any network where the candidate can reach your site.
 *
 * Trade-offs (acceptable for an interview observer):
 *   - 3-5 fps "video" — fluid enough to see expressions, not for fast motion.
 *   - No audio. Audio could be added later via MediaSource Extensions.
 *   - Bandwidth: candidate uploads ~30-150 KB/s; server fans out the same to N observers.
 *
 * Failure-soft: every error is caught. If the WS can't connect, the
 * candidate sees nothing wrong — observers just won't see video.
 */

import { useEffect, useRef } from "react";
import { API_BASE, getSessionToken } from "@/lib/api";

interface Options {
  sessionId: number | null;
  interviewToken: string | null;
  webcamStream: MediaStream | null;
  enabled: boolean;
  /** Frames per second. Default 4. */
  fps?: number;
  /** Max width in pixels — height auto-scaled to keep aspect ratio. Default 480. */
  maxWidth?: number;
  /** JPEG quality 0..1. Default 0.6. */
  quality?: number;
}

function buildWsUrl(sessionId: number, interviewToken: string): string {
  const base = (API_BASE || "").replace(/\/$/, "");
  const wsBase = base.replace(/^http/, "ws");
  // The job-wide interview token doesn't prove which candidate is publishing —
  // the server also requires this session's token (?st=; a WebSocket can't set headers).
  const st = getSessionToken();
  return `${wsBase}/observe/publish-frames/${sessionId}?interview_token=${encodeURIComponent(interviewToken)}${st ? `&st=${encodeURIComponent(st)}` : ""}`;
}

export function useFrameStreamer({
  sessionId,
  interviewToken,
  webcamStream,
  enabled,
  fps = 4,
  maxWidth = 480,
  quality = 0.6,
}: Options) {
  const streamRef = useRef<MediaStream | null>(webcamStream);
  useEffect(() => { streamRef.current = webcamStream; }, [webcamStream]);

  useEffect(() => {
    if (!enabled || !sessionId || !interviewToken) return;

    let aborted = false;
    let ws: WebSocket | null = null;
    let reconnectAttempt = 0;
    let intervalId: number | null = null;
    let videoEl: HTMLVideoElement | null = null;
    let canvasEl: HTMLCanvasElement | null = null;
    let lastStreamId: string | null = null;

    const ensureVideoBoundToStream = async () => {
      const s = streamRef.current;
      if (!s) return null;
      if (!videoEl) {
        videoEl = document.createElement("video");
        videoEl.muted = true;
        videoEl.playsInline = true;
        // We don't attach to DOM — drawing from a detached video works.
      }
      if (videoEl.srcObject !== s || lastStreamId !== s.id) {
        videoEl.srcObject = s;
        lastStreamId = s.id;
        try {
          await videoEl.play();
        } catch {
          // Some browsers block detached play; retry on next tick.
        }
      }
      if (!canvasEl) {
        canvasEl = document.createElement("canvas");
      }
      return videoEl;
    };

    const captureAndSend = async () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const v = await ensureVideoBoundToStream();
      if (!v || !canvasEl) return;
      if (v.videoWidth === 0 || v.videoHeight === 0) return; // not ready yet
      const ratio = v.videoHeight / v.videoWidth;
      const w = Math.min(maxWidth, v.videoWidth);
      const h = Math.round(w * ratio);
      if (canvasEl.width !== w) canvasEl.width = w;
      if (canvasEl.height !== h) canvasEl.height = h;
      const ctx = canvasEl.getContext("2d");
      if (!ctx) return;
      try {
        ctx.drawImage(v, 0, 0, w, h);
      } catch {
        return;
      }
      canvasEl.toBlob(
        (blob) => {
          if (!blob || !ws || ws.readyState !== WebSocket.OPEN) return;
          blob.arrayBuffer().then((buf) => {
            try {
              ws!.send(buf);
            } catch {}
          }).catch(() => {});
        },
        "image/jpeg",
        quality,
      );
    };

    const startTicking = () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      const periodMs = Math.max(50, Math.round(1000 / fps));
      intervalId = window.setInterval(() => {
        captureAndSend();
      }, periodMs);
    };

    const stopTicking = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const connect = () => {
      if (aborted) return;
      const url = buildWsUrl(sessionId, interviewToken);
      try {
        ws = new WebSocket(url);
      } catch (err) {
        console.warn("[frame-streamer] WS open failed", err);
        scheduleReconnect();
        return;
      }
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        reconnectAttempt = 0;
        startTicking();
      };
      ws.onclose = () => {
        stopTicking();
        ws = null;
        if (!aborted) scheduleReconnect();
      };
      ws.onerror = () => {
        // onclose handles reconnection.
      };
    };

    const scheduleReconnect = () => {
      if (aborted) return;
      reconnectAttempt++;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempt));
      window.setTimeout(() => {
        if (!aborted) connect();
      }, delay);
    };

    connect();

    return () => {
      aborted = true;
      stopTicking();
      try { ws?.close(); } catch {}
      ws = null;
      if (videoEl) {
        try { videoEl.srcObject = null; } catch {}
        videoEl = null;
      }
      canvasEl = null;
    };
  }, [enabled, sessionId, interviewToken, fps, maxWidth, quality]);
}
