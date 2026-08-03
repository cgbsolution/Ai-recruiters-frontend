"use client";

import { useCallback, useRef, useState } from "react";
import {
  newRecordingId,
  initMeta,
  saveChunk,
  assembleBlob,
  getMeta,
} from "@/lib/recordingStorage";
import { isLowSpecDevice } from "@/lib/deviceCapability";
import { reportClientEvent } from "@/lib/clientTelemetry";

interface VideoRecordingHook {
  isRecording: boolean;
  /** Returns a recordingId used to track/retrieve durable chunks. */
  startRecording: (
    webcamStream: MediaStream | null,
    screenStream: MediaStream | null,
  ) => string | null;
  stopRecording: () => Promise<{
    /** Assemble the full recording Blob on demand. Only the single-shot upload
     *  FALLBACK needs it; the primary path stitches parts server-side, so we
     *  avoid materialising hundreds of MB in RAM at the fragile completion
     *  moment unless it's actually required. Returns null if assembly fails. */
    getBlob: () => Promise<Blob | null>;
    /** Total recorded bytes, read from durable IndexedDB meta (no RAM blob). */
    sizeBytes: number;
    duration: string;
    recordingId: string;
  } | null>;
  /** Returns the current recording id (if any), so callers can persist it. */
  getRecordingId: () => string | null;
}

// Recording is proctoring evidence: a reviewer has to be able to READ the text
// on the candidate's shared screen. Everything here serves that.
//
// THE CANVAS IS 1080p AND THE SCREEN IS NEVER RESCALED.
// Any resampling softens text, and text is the whole point. The capture is
// already capped at 1920x1080 in useScreenShare, and the canvas matches it
// exactly, so a 1080p monitor is copied pixel-for-pixel. Smaller screens
// (1366x768, 1440x900) are drawn at their NATIVE size and letterboxed rather
// than stretched up — upscaling invents no detail, it just costs bitrate and
// adds blur. Draw offsets are rounded to whole pixels for the same reason: a
// fractional dx/dy forces the compositor to resample an otherwise 1:1 blit.
//
// History: this was 960x540 (480x270 on weak machines) with the webcam eating a
// full-width strip along the bottom, so a 1080p screen landed at 0.375 / 0.183
// scale and 14px UI text became 5.2px / 2.6px. It then went to 720p with the
// webcam as a corner PiP, which was readable but still visibly soft at 0.667.
//
// RESOLUTION IS NOT TIERED AND NEVER CHANGES. A rejoin mints a NEW recording
// segment, and the server stitches segments with ffmpeg's concat demuxer under
// `-c copy`, which requires every segment to share one resolution. So the
// weak-device knob is fps + bitrate, never pixels — which is the right trade
// anyway, since frame rate barely matters for proctoring and resolution is
// exactly what makes text readable.
//
// The headroom comes from the OOM work: in-browser MediaPipe (~300 MB) was
// removed entirely, the 3D avatar is gated off on weak devices (sound-bar
// visualizer instead), and the webcam is no longer composited (below).
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
// Floor for adaptive degradation — below ~2 fps the recording stops being
// usable as evidence of what the candidate was doing.
const MIN_ADAPTIVE_FPS = 2;

// Only fps and bitrate tier off the shared low-spec heuristic (the same one
// that gates the 3D avatar, so the two can never disagree the way they once
// did — an 8 GB / i5-1035G1 laptop used to get the light avatar but the HEAVY
// recording profile and crashed anyway).
//
// The bitrates look generous for the frame rate, and that is deliberate: they
// are a CEILING, not a target. Screen content at a few fps is mostly static, so
// inter-frame prediction keeps the real output far below the cap — but when a
// frame DOES change (scrolling code, switching tabs) there has to be enough
// budget to encode the new text sharply instead of smearing it.
//   strong → 1080p @ 8 fps, up to 4.0 Mbps
//   weak   → 1080p @ 4 fps, up to 2.5 Mbps  (same sharpness, half the frames)
function recordingProfile() {
  const low = isLowSpecDevice();
  return low
    ? { fps: 4, videoBps: 2_500_000 }
    : { fps: 8, videoBps: 4_000_000 };
}
// Audio is speech — 64 kbps is ample on any device.
const AUDIO_BITS_PER_SECOND = 64_000;
// Upper bound on how much of the recording we keep in the JS heap. IndexedDB is
// the durable source of truth (and what stop/recovery actually upload); the
// in-memory copy is only a last-resort fallback for when IDB itself fails. For
// a long interview, retaining every chunk in memory is a slow leak that helps
// crash the tab, so we stop retaining past this cap and rely on IDB.
const MAX_IN_MEMORY_FALLBACK_BYTES = 48 * 1024 * 1024; // 48 MB

export function useVideoRecording(): VideoRecordingHook {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkIndexRef = useRef(0);
  const retainedBytesRef = useRef(0);
  const recordingIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  // Kept so we can close() it on stop. Chrome hard-caps AudioContexts per page
  // (~6); leaking one per resume eventually makes new recordings fail.
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startRecording = useCallback(
    (webcamStream: MediaStream | null, screenStream: MediaStream | null): string | null => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        return recordingIdRef.current;
      }
      if (!webcamStream && !screenStream) return null;

      // Pick the recording profile at runtime (navigator is available here) from
      // the shared low-spec heuristic, so weak laptops record fewer frames.
      // Resolution is fixed at 720p for everyone — see the note above.
      const { fps: FPS, videoBps: VIDEO_BITS_PER_SECOND } = recordingProfile();

      chunksRef.current = [];
      chunkIndexRef.current = 0;
      retainedBytesRef.current = 0;

      // Create off-screen canvas
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      const canvas = canvasRef.current;
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      // alpha:false lets the compositor skip per-pixel blending and store the
      // backing buffer without an alpha channel — a free CPU/memory saving that
      // matters more now that the buffer is 720p. Deliberately NOT using
      // `desynchronized:true`: it has known interactions with captureStream, and
      // the recording is proctoring evidence — not the place for a clever flag.
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return null;
      // The screen capture gets scaled DOWN into the canvas every frame; medium
      // quality keeps small text from turning to mush without the cost of high.
      ctx.imageSmoothingQuality = "medium";

      // Create hidden video elements to feed the canvas
      if (screenStream) {
        const sv = document.createElement("video");
        sv.srcObject = screenStream;
        sv.muted = true;
        sv.playsInline = true;
        sv.play().catch(() => {});
        screenVideoRef.current = sv;
      }

      // The webcam is NOT composited into the recording. The candidate's face is
      // already visible inside the screen capture itself (the interview UI shows
      // their camera tile), so a second copy in the corner was redundant, ate
      // frame area, and cost a whole extra video decode per drawn frame.
      // Its AUDIO is still mixed in below — that part is essential.
      //
      // The one exception is a session with no screen share at all (denied or
      // failed): a black rectangle would be worthless as evidence, so we fall
      // back to recording the camera full-frame.
      if (webcamStream && !screenStream) {
        const wv = document.createElement("video");
        wv.srcObject = webcamStream;
        wv.muted = true;
        wv.playsInline = true;
        wv.play().catch(() => {});
        webcamVideoRef.current = wv;
      }

      // Draw the source at native size when it fits, centred on whole pixels.
      // `Math.min(1, ...)` is what stops a 1366x768 laptop screen from being
      // stretched to 1920x1080: upscaling adds no detail and only softens text.
      // Rounding dx/dy keeps a same-size blit free of resampling.
      const drawFitted = (src: HTMLVideoElement, srcW: number, srcH: number) => {
        const scale = Math.min(1, CANVAS_WIDTH / srcW, CANVAS_HEIGHT / srcH);
        const dw = Math.round(srcW * scale);
        const dh = Math.round(srcH * scale);
        const dx = Math.round((CANVAS_WIDTH - dw) / 2);
        const dy = Math.round((CANVAS_HEIGHT - dh) / 2);
        ctx.drawImage(src, dx, dy, dw, dh);
      };

      // Draw loop: the screen capture, and nothing else.
      const drawFrame = () => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const sv = screenVideoRef.current;
        if (sv && sv.readyState >= 2) {
          drawFitted(sv, sv.videoWidth || CANVAS_WIDTH, sv.videoHeight || CANVAS_HEIGHT);
          return;
        }

        // Fallback only — no screen share in this session (see above).
        const wv = webcamVideoRef.current;
        if (wv && wv.readyState >= 2) {
          drawFitted(wv, wv.videoWidth || 640, wv.videoHeight || 480);
        }
      };

      // ── Adaptive frame-rate governor ──────────────────────────────────────
      // The profile used to be picked once at start and then held for the whole
      // interview, so a machine that got into trouble mid-session had no way to
      // shed load and just crashed. Now the draw rate backs off as the heap
      // fills.
      //
      // FPS is the ONLY thing that adapts. Dropping resolution mid-recording
      // would change the frame size inside a single WebM segment and break the
      // server-side `-c copy` stitching, and it is also the wrong trade: text
      // legibility is exactly what we are trying to protect. Fewer frames per
      // second of a readable screen beats a smooth stream of unreadable mush.
      let activeFps = FPS;
      let tickCount = 0;

      const scheduleDraw = (fps: number) => {
        if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = setInterval(loopTick, 1000 / fps);
      };

      const targetFpsForHeap = (): number => {
        const mem = (performance as Performance & {
          memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        }).memory;
        // Unmeasurable (non-Chromium) → stay at the profile rate; the profile is
        // already conservative on anything we detect as low-spec.
        if (!mem || !mem.jsHeapSizeLimit) return FPS;
        const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
        if (ratio >= 0.75) return MIN_ADAPTIVE_FPS;
        if (ratio >= 0.55) return Math.max(MIN_ADAPTIVE_FPS, Math.floor(FPS / 2));
        return FPS;
      };

      const loopTick = () => {
        drawFrame();
        // Re-evaluate roughly every 4 seconds of wall clock, not every frame.
        if (++tickCount % Math.max(1, Math.round(activeFps * 4)) !== 0) return;
        const want = targetFpsForHeap();
        if (want === activeFps) return;
        const prev = activeFps;
        activeFps = want;
        scheduleDraw(want);
        console.warn(`[useVideoRecording] adaptive fps ${prev} → ${want} (heap pressure)`);
        reportClientEvent({
          type: "load_shed",
          message: `recording fps ${prev} → ${want} under heap pressure`,
          context: { from: prev, to: want, profileFps: FPS, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        });
      };

      scheduleDraw(activeFps);

      // Capture the canvas stream
      let canvasStream: MediaStream;
      try {
        canvasStream = canvas.captureStream(FPS);
      } catch (err) {
        console.error("[useVideoRecording] canvas.captureStream failed:", err);
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
        return null;
      }

      // Mix audio from webcam (mic) + screen (system/avatar) using AudioContext
      const micTracks = webcamStream ? webcamStream.getAudioTracks() : [];
      const sysTracks = screenStream ? screenStream.getAudioTracks() : [];

      if (micTracks.length > 0 || sysTracks.length > 0) {
        try {
          // Close any context left over from a previous start before opening
          // a new one, so resumes don't accumulate AudioContexts.
          if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {});
            audioCtxRef.current = null;
          }
          const audioCtx = new AudioContext();
          audioCtxRef.current = audioCtx;
          const dest = audioCtx.createMediaStreamDestination();

          if (micTracks.length > 0) {
            const micSource = audioCtx.createMediaStreamSource(
              new MediaStream(micTracks),
            );
            micSource.connect(dest);
          }

          if (sysTracks.length > 0) {
            const sysSource = audioCtx.createMediaStreamSource(
              new MediaStream(sysTracks),
            );
            sysSource.connect(dest);
          }

          for (const track of dest.stream.getAudioTracks()) {
            canvasStream.addTrack(track);
          }
        } catch {
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

      const options: MediaRecorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      };
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(canvasStream, options);
      } catch (err) {
        console.error("[useVideoRecording] MediaRecorder constructor failed:", err);
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
        return null;
      }

      // Mint a durable recording id and seed metadata BEFORE any chunks arrive.
      const recordingId = newRecordingId();
      recordingIdRef.current = recordingId;
      initMeta(recordingId, mimeType || "video/webm").catch(() => {});

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          // Persist to IndexedDB FIRST — this is the durable source of truth
          // that survives a tab close, crash, or upload failure, and what
          // stop/recovery actually upload. Fire-and-forget: saveChunk swallows
          // errors internally so it can never break recording.
          const idx = chunkIndexRef.current++;
          void saveChunk(recordingId, idx, e.data);
          // Additionally keep an in-memory copy as a last-resort fallback for
          // the immediate post-stop path, but only up to a bound — past it we
          // rely solely on IDB so a long interview can't leak the heap to death.
          if (retainedBytesRef.current < MAX_IN_MEMORY_FALLBACK_BYTES) {
            chunksRef.current.push(e.data);
            retainedBytesRef.current += e.data.size;
          }
        }
      };

      recorder.onerror = (e) => {
        console.error("[useVideoRecording] MediaRecorder error:", e);
      };

      recorderRef.current = recorder;
      startTimeRef.current = Date.now();
      try {
        recorder.start(1000);
      } catch (err) {
        console.error("[useVideoRecording] recorder.start() failed:", err);
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
        recorderRef.current = null;
        return null;
      }
      setIsRecording(true);
      return recordingId;
    },
    [],
  );

  const stopRecording = useCallback((): Promise<{
    getBlob: () => Promise<Blob | null>;
    sizeBytes: number;
    duration: string;
    recordingId: string;
  } | null> => {
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
      const recordingId = recordingIdRef.current;
      if (!recorder || recorder.state === "inactive" || !recordingId) {
        resolve(null);
        return;
      }

      const elapsedMs = Date.now() - startTimeRef.current;
      const totalSec = Math.round(elapsedMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const duration = `${mins}:${secs.toString().padStart(2, "0")}`;

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "video/webm";
        // Capture the in-memory fallback chunks for lazy assembly, then drop the
        // refs so the heap isn't holding two copies past stop.
        const inMemoryChunks = chunksRef.current;
        chunksRef.current = [];
        chunkIndexRef.current = 0;
        retainedBytesRef.current = 0;
        recorderRef.current = null;
        canvasRef.current = null;
        // Release the audio graph so the AudioContext doesn't leak across resumes.
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        setIsRecording(false);

        // Report size from the durable IndexedDB meta instead of materialising
        // the whole video Blob in RAM here. Assembling a long recording
        // (hundreds of MB) at the exact moment the interview ends — while the
        // avatar, MediaPipe and media streams are still tearing down — was a
        // memory-spike crash trigger. The primary upload path stitches the parts
        // server-side and never needs this Blob; only the rarely-hit single-shot
        // fallback does, so we assemble lazily via getBlob() on demand.
        let sizeBytes = 0;
        try {
          const meta = await getMeta(recordingId);
          sizeBytes = meta?.sizeBytes ?? 0;
        } catch {
          // sizeBytes stays 0 — non-fatal (used only for a log line)
        }

        const getBlob = async (): Promise<Blob | null> => {
          // Prefer the IDB-assembled blob (byte-for-byte the durable bytes).
          // Fall back to the retained in-memory chunks only if IDB fails
          // (e.g. Safari private mode).
          let blob: Blob | null = null;
          try {
            blob = await assembleBlob(recordingId);
          } catch {
            blob = null;
          }
          if ((!blob || blob.size === 0) && inMemoryChunks.length > 0) {
            blob = new Blob(inMemoryChunks, { type: mimeType });
          }
          return blob;
        };

        resolve({ getBlob, sizeBytes, duration, recordingId });
      };

      // Force the final buffered chunk out before stopping, so the last ~1s of
      // the answer isn't lost (requestData triggers ondataavailable → IDB save
      // before onstop runs).
      try {
        if (recorder.state === "recording") recorder.requestData();
      } catch {
        // not all implementations support requestData — onstop still flushes
      }
      recorder.stop();
    });
  }, []);

  const getRecordingId = useCallback(() => recordingIdRef.current, []);

  return { isRecording, startRecording, stopRecording, getRecordingId };
}
