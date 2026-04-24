"use client";

import { memo, useEffect, useRef } from "react";

export type VoiceMode = "idle" | "listening" | "speaking" | "processing";

interface Props {
  mode: VoiceMode;
  micStream?: MediaStream | null;
  ttsAudio?: HTMLAudioElement | null;
  label?: string;
}

/**
 * 5-bar voice activity visualizer (Siri/iOS speech-bar style).
 *
 * Renders five dark navy capsules whose heights react to frequency data:
 *   - speaking: each bar is one band of the TTS audio output
 *   - listening: each bar is one band of the microphone input
 *   - processing: all bars pulse in a slow rhythm
 *   - idle: all bars sit near a resting baseline with gentle breathing
 *
 * Height transitions use asymmetric smoothing (fast attack, slow decay)
 * so speech spikes feel immediate but bars don't snap back jarringly.
 */
const VoiceVisualizer = memo(function VoiceVisualizer({
  mode,
  micStream,
  ttsAudio,
  label,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const micSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const ttsSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null);

  const modeRef = useRef<VoiceMode>(mode);
  modeRef.current = mode;

  const getAudioContext = () => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        ctxRef.current = new AC();
      } catch {
        return null;
      }
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  };

  // ── Mic stream → analyser ─────────────────────────────────────────────
  useEffect(() => {
    try { micSrcRef.current?.disconnect(); } catch {}
    micSrcRef.current = null;
    micAnalyserRef.current = null;

    if (!micStream) return;
    const ac = getAudioContext();
    if (!ac) return;

    try {
      const src = ac.createMediaStreamSource(micStream);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.6;
      src.connect(an);
      // Intentionally not connected to destination — avoids mic feedback.
      micSrcRef.current = src;
      micAnalyserRef.current = an;
    } catch (err) {
      console.warn("[VoiceVisualizer] mic hookup failed", err);
    }

    return () => {
      try { micSrcRef.current?.disconnect(); } catch {}
      micSrcRef.current = null;
      micAnalyserRef.current = null;
    };
  }, [micStream]);

  // ── TTS audio element → analyser ──────────────────────────────────────
  useEffect(() => {
    // Each HTMLAudioElement can only be wrapped in ONE MediaElementSource
    // across its whole lifetime, so we create a fresh source per element
    // and disconnect the previous one. Old Audio elements are discarded by
    // useGoogleTTS each new speak() call, so this stays balanced.
    try { ttsSrcRef.current?.disconnect(); } catch {}
    try { ttsAnalyserRef.current?.disconnect(); } catch {}
    ttsSrcRef.current = null;
    ttsAnalyserRef.current = null;

    if (!ttsAudio) return;
    const ac = getAudioContext();
    if (!ac) return;

    try {
      const src = ac.createMediaElementSource(ttsAudio);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.55;
      src.connect(an);
      // MUST connect to destination — MediaElementSource reroutes playback
      // through the graph, so without this the TTS would go silent.
      an.connect(ac.destination);
      ttsSrcRef.current = src;
      ttsAnalyserRef.current = an;
    } catch (err) {
      console.warn("[VoiceVisualizer] tts hookup failed", err);
    }
  }, [ttsAudio]);

  // ── Render loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const micBuf = new Uint8Array(new ArrayBuffer(256));
    const ttsBuf = new Uint8Array(new ArrayBuffer(256));

    const start = performance.now();
    // Persist per-bar smoothed heights across frames so bars have a VU-like
    // release instead of snapping.
    const smoothedBars: number[] = [0.25, 0.25, 0.25, 0.25, 0.25];

    // Per-bar frequency band bin ranges. fftSize 512 @ ~48kHz sample rate
    // ≈ 94Hz per bin. Ranges picked to cover voice energy (80Hz–4.5kHz)
    // distributed roughly log-scale so each bar's range doubles.
    const BAND_BINS: ReadonlyArray<readonly [number, number]> = [
      [ 1,  3],   // ~94–280 Hz    (low)
      [ 3,  6],   // ~280–560 Hz   (low-mid)
      [ 6, 12],   // ~560–1120 Hz  (mid)
      [12, 24],   // ~1120–2250 Hz (high-mid)
      [24, 48],   // ~2250–4500 Hz (high)
    ];

    const bandAmp = (buf: Uint8Array<ArrayBuffer>, lo: number, hi: number) => {
      let s = 0;
      for (let i = lo; i < hi; i++) s += buf[i];
      return s / (hi - lo) / 255;
    };

    // Capsule (stadium) path — rounded rect where the short ends are full
    // semicircles. roundRect is in the 2021 Canvas spec and supported in
    // all current browsers (Chrome 99+, Safari 16+, Firefox 113+); we
    // keep a manual path fallback for older runtimes just in case.
    const hasRoundRect = typeof (g as CanvasRenderingContext2D & { roundRect?: unknown }).roundRect === "function";
    const capsulePath = (x: number, y: number, w: number, h: number) => {
      const r = Math.min(w, h) / 2;
      g.beginPath();
      if (hasRoundRect) {
        (g as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void })
          .roundRect(x, y, w, h, r);
      } else {
        g.moveTo(x + r, y);
        g.lineTo(x + w - r, y);
        g.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
        g.lineTo(x + w, y + h - r);
        g.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
        g.lineTo(x + r, y + h);
        g.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
        g.lineTo(x, y + r);
        g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
      }
      g.closePath();
    };

    const BARS = 5;

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;

      // Bar geometry. 5 bars + 4 gaps take up ~68% of canvas width.
      // barW × 5 + (barW × 0.45) × 4 = barW × 6.8. We target 68% of w.
      const usable = w * 0.68;
      const barW = usable / 6.8;
      const gap = barW * 0.45;
      const groupW = BARS * barW + (BARS - 1) * gap;
      const startX = cx - groupW / 2;

      // Height range — floor is a circle (height = barW), ceiling is ~4.5×
      // taller, capped by available canvas height.
      const minH = barW;
      const maxH = Math.min(h * 0.75, barW * 4.5);

      // Read freq data only during speaking — listening is now treated
      // the same as idle per user request (bars sit as dots and breathe).
      // Mic analyser is still wired by the parent; we just don't consume
      // it for bar heights anymore.
      const m = modeRef.current;
      const ttsReady = m === "speaking" && ttsAnalyserRef.current !== null;
      if (ttsReady) ttsAnalyserRef.current!.getByteFrequencyData(ttsBuf);

      // Idle / listening resting target — matches the dot state in the
      // reference. Output is 0..0.09 so barH stays near minH (= barW)
      // and each capsule reads as a circle with very gentle breathing.
      const idleTarget = (i: number) =>
        Math.max(0, 0.04 + 0.05 * Math.sin(t * 1.3 + i * 0.5));

      for (let i = 0; i < BARS; i++) {
        let target: number;
        if (ttsReady) {
          const [lo, hi] = BAND_BINS[i];
          // No minimum floor — during speech pauses the band returns ~0,
          // so the bar collapses to a dot like the reference. Scale 2.2
          // maps typical TTS peaks into a satisfying tall-pill range.
          target = bandAmp(ttsBuf, lo, hi) * 2.2;
        } else if (m === "speaking") {
          // speaking but analyser not wired yet → brief synthetic rhythm
          target = 0.35 + 0.35 * Math.abs(Math.sin(t * 4.5 + i * 0.9));
        } else if (m === "processing") {
          target = 0.40 + 0.22 * Math.sin(t * 3.2 + i * 0.55);
        } else {
          // idle AND listening — identical dot breathing
          target = idleTarget(i);
        }
        target = Math.max(0, Math.min(1, target));

        // Asymmetric smoothing — fast attack (rise immediately on spikes),
        // slow decay (smooth squeeze-down during silences). Mirrors how a
        // real VU meter responds.
        if (target > smoothedBars[i]) {
          smoothedBars[i] += (target - smoothedBars[i]) * 0.50;
        } else {
          smoothedBars[i] += (target - smoothedBars[i]) * 0.16;
        }
      }

      g.clearRect(0, 0, w, h);

      g.fillStyle = "#0a1830"; // dark navy
      for (let i = 0; i < BARS; i++) {
        const x = startX + i * (barW + gap);
        const barH = minH + (maxH - minH) * smoothedBars[i];
        const y = cy - barH / 2;
        capsulePath(x, y, barW, barH);
        g.fill();
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  // Close AudioContext on unmount
  useEffect(() => {
    return () => {
      try { micSrcRef.current?.disconnect(); } catch {}
      try { ttsSrcRef.current?.disconnect(); } catch {}
      try { ttsAnalyserRef.current?.disconnect(); } catch {}
      try { ctxRef.current?.close(); } catch {}
      ctxRef.current = null;
    };
  }, []);

  const effectiveLabel =
    label ??
    (mode === "speaking"
      ? "Speaking..."
      : mode === "listening"
        ? "Listening..."
        : mode === "processing"
          ? "Processing..."
          : "");

  const dotColor =
    mode === "speaking"
      ? "bg-blue-500"
      : mode === "listening"
        ? "bg-green-500"
        : mode === "processing"
          ? "bg-amber-500"
          : "bg-gray-400";

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-label="Voice activity visualizer"
      />
      {effectiveLabel && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 backdrop-blur-sm border border-gray-200/60 shadow-sm">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${mode === "listening" || mode === "processing" ? "animate-pulse" : ""}`} />
          <span className="text-[11px] text-gray-700 font-medium tracking-wide">{effectiveLabel}</span>
        </div>
      )}
    </div>
  );
});

export default VoiceVisualizer;
