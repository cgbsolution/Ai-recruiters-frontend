"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Loader2, Mic, RefreshCw, Video, XCircle } from "lucide-react";
import { useDeepgramSTT } from "@/hooks/interview/useDeepgramSTT";
import type { DeepgramDiagnostics } from "@/hooks/interview/useDeepgramSTT";
import { getMicCheckTarget, isSuspiciousMicLabel, matchMicCheck } from "@/lib/micCheck";
import type { MicCheckResult } from "@/lib/micCheck";
import { reportClientEvent } from "@/lib/clientTelemetry";

interface Props {
  stream: MediaStream;
  onNext: () => void;
  sessionId?: number | null;
  language?: string;
  managerEmail?: string | null;
}

/**
 * Device test — the candidate reads one sentence aloud and we verify with the
 * SAME speech-to-text path the interview uses that we actually heard them.
 *
 * Candidates used to arrive at the interview with a dead microphone: the old
 * check showed a level bar fed from the recording's capture and an
 * always-enabled Continue button, so nothing was ever gated.
 *
 * The gate blocks only when the evidence says the microphone is dead while our
 * own speech path is demonstrably healthy:
 *   - no permission / no device / device busy / no sound at all → block, retry
 *     as often as they like, with advice specific to the cause;
 *   - words came back but didn't match the sentence → the microphone is proven
 *     working, so let them through from the 3rd attempt;
 *   - OUR speech service failed (token 401/403/429/5xx, WebSocket exhausted) →
 *     fall back to a local volume-only check, so a vendor outage never blocks a
 *     candidate.
 *
 * NEXT_PUBLIC_MIC_CHECK_MODE switches this without a code revert:
 *   "enforce" (default) gate on the result · "observe" run and log but never
 *   block · "off" the previous simple level-bar screen.
 */

type MicCheckMode = "enforce" | "observe" | "off";

const RAW_MODE = process.env.NEXT_PUBLIC_MIC_CHECK_MODE;
const MIC_CHECK_MODE: MicCheckMode =
  RAW_MODE === "observe" || RAW_MODE === "off" ? RAW_MODE : "enforce";

export default function DeviceTestStep(props: Props) {
  // A module constant, so this branch never changes between renders and the
  // two component bodies keep their own stable hook order.
  if (MIC_CHECK_MODE === "off") return <SimpleDeviceTest {...props} />;
  return <SpokenMicCheck {...props} />;
}

// ── Timings and thresholds (§6.3/§6.4) ───────────────────────────────────────

/** Still "starting" with no listening stream → the microphone hung. */
const START_TIMEOUT_MS = 6000;
/** No voice and no words at all since listening began → go and classify. */
const NO_SPEECH_MS = 8000;
/** Quiet for this long after real speech → they have finished reading. */
const END_OF_SPEECH_MS = 2500;
const MIN_VOICE_BEFORE_EOS_MS = 800;
/** Hard cap on one listening window. */
const LISTEN_MAX_MS = 15000;
/** Let Deepgram's last final result land before closing the socket. */
const DRAIN_MS = 1200;
/** An interim match must hold this long before we auto-pass on it. */
const MATCH_HOLD_MS = 600;
/** Volume-only fallback window. */
const ENERGY_WINDOW_MS = 10000;
const RETRY_COOLDOWN_MS = 2000;
/** mismatch + no_words failures share this counter; the 3rd one soft-passes. */
const SOFT_PASS_AFTER = 3;

const METER_INTERVAL_MS = 50;
const FFT_SIZE = 1024;
/** Median of the first 400 ms is the noise floor. */
const NOISE_FRAMES = Math.round(400 / METER_INTERVAL_MS);
const VOICE_ABS_DB = -50;
const VOICE_OVER_FLOOR_DB = 10;
/** E1 — "reliable, speech-like local volume". */
const E1_VOICED_MS = 1500;
const E1_STD_DB = 4;
/** Digital silence: a hardware- or OS-muted microphone produces zeros. */
const SILENCE_SAMPLE = 1e-5;
const LEVEL_MIN_DB = -60;
const LEVEL_MAX_DB = -10;

type CheckState =
  | "idle"
  | "starting"
  | "listening"
  | "verifying"
  | "energy_only"
  | "passed"
  | "soft_passed"
  | "energy_passed"
  | "failed";

type FailReason =
  | "mic_not_allowed"
  | "mic_not_found"
  | "mic_busy"
  | "recorder"
  | "session_invalid"
  | "silent"
  | "noise_no_speech"
  | "no_words"
  | "mismatch"
  | "mic_start_timeout";

type Outcome = "passed" | "soft_passed" | "energy_passed" | "failed";

/** Everything the local volume meter accumulates over one attempt. */
interface MeterStats {
  frames: number;
  peakDb: number;
  noiseFloorDb: number;
  voicedMs: number;
  voicedDbs: number[];
  noiseSamples: number[];
  nonZeroSeen: boolean;
  lastVoiceAt: number;
  /** ctx.state === "running": if it isn't, volume never decides anything. */
  reliable: boolean;
}

function freshStats(): MeterStats {
  return {
    frames: 0,
    peakDb: -100,
    noiseFloorDb: -100,
    voicedMs: 0,
    voicedDbs: [],
    noiseSamples: [],
    nonZeroSeen: false,
    lastVoiceAt: 0,
    reliable: false,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return -100;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(variance);
}

/** Speech-like local volume — the only evidence that can pass a candidate when
 *  our speech service is down. Never trusted unless the AudioContext ran. */
function hasVoiceEnergy(s: MeterStats): boolean {
  return s.reliable && s.voicedMs >= E1_VOICED_MS && stdDev(s.voicedDbs) >= E1_STD_DB;
}

function round1(n: number): number | null {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function SpokenMicCheck({ stream, onNext, sessionId, language = "en", managerEmail }: Props) {
  // The hook, used exactly as the interview room uses it — same constraints,
  // same default device, same MediaRecorder format, same token endpoint with
  // the session token, same WebSocket settings and language model. Anything
  // that would break "Start Speaking" breaks here first, which is the point.
  const stt = useDeepgramSTT(language, sessionId);
  const target = getMicCheckTarget(language);
  const sttEnabled = sessionId != null;
  const hasVideo = stream.getVideoTracks().length > 0;

  const [state, setState] = useState<CheckState>("idle");
  const [reason, setReason] = useState<FailReason | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [micLabel, setMicLabel] = useState("");
  const [retryReady, setRetryReady] = useState(true);
  const [sttDown, setSttDown] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Audio graph. One AudioContext per attempt, created inside the Start click
  // (a user gesture) and closed again when the attempt ends — Chrome caps how
  // many AudioContexts a page may hold.
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Explicitly backed by an ArrayBuffer (not ArrayBufferLike), which is what
  // getFloatTimeDomainData accepts — same pattern as VoiceVisualizer.
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const meteredRef = useRef<MediaStream | null>(null);

  const statsRef = useRef<MeterStats>(freshStats());
  const stateRef = useRef<CheckState>("idle");
  const phaseStartRef = useRef(0);
  const attemptStartRef = useRef(0);
  const listenStartRef = useRef(0);
  const matchSinceRef = useRef(0);
  const attemptRef = useRef(0);
  const softFailsRef = useRef(0);
  const everConnectedRef = useRef(false);
  const sttDownRef = useRef(false);
  const sttDownReportedRef = useRef(false);
  const micLabelRef = useRef("");

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drainRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The interval calls through this, so it always runs the latest closure and
   *  can never read a stale `stt`, `language` or `stream`. */
  const latestTickRef = useRef<() => void>(() => {});
  const latestTeardownRef = useRef<() => void>(() => {});

  const busy =
    state === "starting" || state === "listening" || state === "verifying" || state === "energy_only";
  const passedState = state === "passed" || state === "soft_passed" || state === "energy_passed";
  const observeMode = MIC_CHECK_MODE === "observe";

  // ── Audio plumbing ─────────────────────────────────────────────────────────

  const openAudioContext = (): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    if (typeof window === "undefined") return null;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctxRef.current = new AC();
      bufRef.current = new Float32Array(new ArrayBuffer(FFT_SIZE * 4));
      return ctxRef.current;
    } catch {
      return null;
    }
  };

  const detachMeter = () => {
    try { sourceRef.current?.disconnect(); } catch {}
    sourceRef.current = null;
    analyserRef.current = null;
    meteredRef.current = null;
  };

  /** Point the meter at a stream. NEVER stops its tracks: for the volume-only
   *  fallback this can be the webcam stream, whose audio the recording needs. */
  const attachMeter = (src: MediaStream) => {
    if (meteredRef.current === src && analyserRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx || src.getAudioTracks().length === 0) return;
    detachMeter();
    try {
      const node = ctx.createMediaStreamSource(src);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      // Deliberately NOT connected to ctx.destination — that would feed the
      // microphone back out of the speakers.
      node.connect(analyser);
      sourceRef.current = node;
      analyserRef.current = analyser;
      meteredRef.current = src;
      statsRef.current = freshStats();
    } catch (err) {
      console.warn("[MicCheck] could not meter the stream", err);
    }
  };

  const closeAudio = () => {
    detachMeter();
    const ctx = ctxRef.current;
    ctxRef.current = null;
    bufRef.current = null;
    if (ctx) {
      try { void ctx.close(); } catch {}
    }
  };

  const sampleMeter = () => {
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    const ctx = ctxRef.current;
    if (!analyser || !buf || !ctx) return;

    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    let maxAbs = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
    }
    const rms = Math.sqrt(sum / buf.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;

    const s = statsRef.current;
    s.frames += 1;
    s.reliable = ctx.state === "running";
    if (maxAbs >= SILENCE_SAMPLE) s.nonZeroSeen = true;
    if (db > s.peakDb) s.peakDb = db;

    if (s.frames <= NOISE_FRAMES) {
      s.noiseSamples.push(db);
      if (s.frames === NOISE_FRAMES) s.noiseFloorDb = median(s.noiseSamples);
    } else if (db > Math.max(VOICE_ABS_DB, s.noiseFloorDb + VOICE_OVER_FLOOR_DB)) {
      s.voicedMs += METER_INTERVAL_MS;
      s.voicedDbs.push(db);
      s.lastVoiceAt = Date.now();
    }

    const pct = Math.max(
      0,
      Math.min(100, Math.round(((db - LEVEL_MIN_DB) / (LEVEL_MAX_DB - LEVEL_MIN_DB)) * 100)),
    );
    setLevel((prev) => (prev === pct ? prev : pct));
  };

  // ── Timers ─────────────────────────────────────────────────────────────────

  const stopTimers = () => {
    if (tickerRef.current != null) { clearInterval(tickerRef.current); tickerRef.current = null; }
    if (drainRef.current != null) { clearTimeout(drainRef.current); drainRef.current = null; }
  };

  const startTicker = () => {
    if (tickerRef.current != null) return;
    tickerRef.current = setInterval(() => latestTickRef.current(), METER_INTERVAL_MS);
  };

  const goto = (next: CheckState) => {
    stateRef.current = next;
    phaseStartRef.current = Date.now();
    setState(next);
  };

  /** Release the microphone. Safe to call more than once. */
  const safeStop = (): string => {
    try {
      return stt.stop();
    } catch {
      return "";
    }
  };

  // ── Outcomes ───────────────────────────────────────────────────────────────

  const finish = (
    outcome: Outcome,
    failReason: FailReason | null,
    match: MicCheckResult | null,
    diag: DeepgramDiagnostics | null,
    text: string,
  ) => {
    stopTimers();
    safeStop();

    const s = statsRef.current;
    // Never blocks — just recorded. If a candidate switched microphone in site
    // settings after the permission step, speech-to-text uses the new device
    // while the recording still mixes the old track.
    const recTrack = stream.getAudioTracks()[0] || null;
    const recordingDeviceMismatch = !!(
      recTrack && recTrack.label && micLabelRef.current && recTrack.label !== micLabelRef.current
    );

    const n = attemptRef.current;
    reportClientEvent({
      type: outcome === "failed" ? "mic_check_failed" : "mic_check_passed",
      // The attempt number keeps repeats from being dropped by the 10 s
      // same-type/same-message dedupe in reportClientEvent.
      message: `attempt ${n} ${outcome}/${failReason ?? "ok"} score=${(match?.recall ?? 0).toFixed(2)}`,
      context: {
        sessionId,
        language,
        attempt: n,
        outcome,
        reason: failReason,
        recall: match ? Math.round(match.recall * 100) / 100 : null,
        keyHits: match?.keyHits ?? null,
        tokens: match?.tokens ?? null,
        transcript: text.slice(0, 200),
        speechStartedCount: diag?.speechStartedCount ?? null,
        connected: diag?.connected ?? null,
        everConnected: everConnectedRef.current,
        errorKind: diag?.errorKind ?? null,
        tokenStatus: diag?.tokenStatus ?? null,
        peakDb: round1(s.peakDb),
        noiseFloorDb: round1(s.noiseFloorDb),
        voicedMs: s.voicedMs,
        voicedDbStd: round1(stdDev(s.voicedDbs)),
        energyReliable: s.reliable,
        allZero: !s.nonZeroSeen && s.frames >= 1000 / METER_INTERVAL_MS,
        micLabel: micLabelRef.current || null,
        recordingTrackState: recTrack?.readyState ?? null,
        recordingTrackMuted: recTrack?.muted ?? null,
        recordingDeviceMismatch,
        durationMs: Date.now() - attemptStartRef.current,
        enforced: MIC_CHECK_MODE === "enforce",
      },
    });

    closeAudio();
    setHeard(text);
    setReason(failReason);
    setLevel(0);

    if (outcome === "failed") {
      setRetryReady(false);
      if (cooldownRef.current != null) clearTimeout(cooldownRef.current);
      cooldownRef.current = setTimeout(() => setRetryReady(true), RETRY_COOLDOWN_MS);
      goto("failed");
      return;
    }
    goto(outcome === "passed" ? "passed" : outcome === "soft_passed" ? "soft_passed" : "energy_passed");
  };

  /** mismatch / no_words: the microphone is proven to work, only recognition
   *  fell short. Blocking these would reject accents and speech differences —
   *  and the interview already lets candidates correct their transcript. */
  const finishRecognitionFailure = (
    failReason: "mismatch" | "no_words",
    match: MicCheckResult | null,
    diag: DeepgramDiagnostics | null,
    text: string,
  ) => {
    softFailsRef.current += 1;
    if (softFailsRef.current >= SOFT_PASS_AFTER) {
      finish("soft_passed", failReason, match, diag, text);
    } else {
      finish("failed", failReason, match, diag, text);
    }
  };

  /** Our speech service failed. Measure volume instead — an outage on our side
   *  must never block a candidate, but a dead microphone still must. */
  const enterEnergyOnly = (diag: DeepgramDiagnostics | null) => {
    sttDownRef.current = true;
    setSttDown(true);

    if (!sttDownReportedRef.current) {
      sttDownReportedRef.current = true;
      reportClientEvent({
        type: "mic_check_stt_unavailable",
        message: `attempt ${attemptRef.current} errorKind=${diag?.errorKind ?? "none"} tokenStatus=${diag?.tokenStatus ?? "none"}`,
        context: {
          sessionId,
          language,
          attempt: attemptRef.current,
          errorKind: diag?.errorKind ?? null,
          tokenStatus: diag?.tokenStatus ?? null,
          everConnected: everConnectedRef.current,
        },
      });
    }

    // Keep metering the speech-to-text capture if it is still live, otherwise
    // fall back to the webcam stream's audio track — whose tracks we must not
    // stop, because the interview recording needs them.
    const sttStream = stt.micStream;
    const sttLive = !!sttStream && sttStream.getAudioTracks().some((t) => t.readyState === "live");
    if (!sttLive) safeStop();
    attachMeter(sttLive && sttStream ? sttStream : stream);

    if (drainRef.current != null) { clearTimeout(drainRef.current); drainRef.current = null; }
    goto("energy_only");
    startTicker();
  };

  const finishEnergyWindow = () => {
    const diag = sttEnabled ? stt.getDiagnostics() : null;
    if (hasVoiceEnergy(statsRef.current)) {
      finish("energy_passed", null, null, diag, "");
    } else {
      finish("failed", "silent", null, diag, "");
    }
  };

  /** Stop listening, let the last final result land, then classify (§6.5). */
  const toVerifying = () => {
    if (stateRef.current === "verifying") return;
    goto("verifying");
    if (drainRef.current != null) clearTimeout(drainRef.current);
    drainRef.current = setTimeout(() => {
      drainRef.current = null;
      classify();
    }, DRAIN_MS);
  };

  const classify = () => {
    // Read diagnostics BEFORE stop(), which closes the socket and clears
    // `connected`.
    const diag = sttEnabled ? stt.getDiagnostics() : null;
    const snapshot = stt.getSnapshot();
    const text = safeStop() || snapshot;
    const match = matchMicCheck(language, text);
    const s = statsRef.current;

    if (match.pass) {
      finish("passed", null, match, diag, text);
      return;
    }
    // E3 — words came back, so the microphone works end to end.
    if (match.tokens > 0) {
      finishRecognitionFailure("mismatch", match, diag, text);
      return;
    }
    // E2 — Deepgram detected speech but produced no words.
    if (diag && diag.speechStartedCount > 0) {
      finishRecognitionFailure("no_words", match, diag, text);
      return;
    }
    // No words and no voice event. If our socket never even opened we have no
    // right to blame the candidate's microphone — measure volume instead.
    if (sttEnabled && !everConnectedRef.current) {
      sttDownRef.current = true;
      setSttDown(true);
      if (hasVoiceEnergy(s)) finish("energy_passed", null, match, diag, text);
      else finish("failed", "silent", match, diag, text);
      return;
    }
    // E1 — Deepgram was connected and heard sound, but no speech in it.
    if (hasVoiceEnergy(s)) {
      finish("failed", "noise_no_speech", match, diag, text);
      return;
    }
    // E0 — the real-world dead-microphone case.
    finish("failed", "silent", match, diag, text);
  };

  // ── The per-attempt driver, re-created every render so it never goes stale ──

  const tick = () => {
    sampleMeter();
    const now = Date.now();
    const st = stateRef.current;

    if (st === "starting" || st === "listening") {
      const diag = stt.getDiagnostics();
      if (diag.connected) everConnectedRef.current = true;
      if (diag.errorKind) {
        switch (diag.errorKind) {
          case "mic_not_allowed":
          case "mic_not_found":
          case "mic_busy":
          case "recorder":
            finish("failed", diag.errorKind, null, diag, "");
            return;
          case "token":
            // 401/403 is the session, not the microphone: reloading re-runs
            // verify-access, which shows completed/terminated states properly.
            if (diag.tokenStatus === 401 || diag.tokenStatus === 403) {
              finish("failed", "session_invalid", null, diag, "");
              return;
            }
            enterEnergyOnly(diag);
            return;
          case "ws":
            enterEnergyOnly(diag);
            return;
        }
      }
    }

    if (st === "starting") {
      if (stt.isListening) {
        listenStartRef.current = now;
        matchSinceRef.current = 0;
        goto("listening");
      } else if (now - phaseStartRef.current > START_TIMEOUT_MS) {
        finish("failed", "mic_start_timeout", null, stt.getDiagnostics(), "");
      }
      return;
    }

    if (st === "listening") {
      const snapshot = stt.getSnapshot();
      setHeard((prev) => (prev === snapshot ? prev : snapshot));

      const match = matchMicCheck(language, snapshot);
      if (match.pass) {
        // Auto-pass as soon as the match is trustworthy: either it came from a
        // final result, or an interim match has held steady.
        const fromFinal = matchMicCheck(language, stt.finalTranscript).pass;
        if (matchSinceRef.current === 0) matchSinceRef.current = now;
        if (fromFinal || now - matchSinceRef.current >= MATCH_HOLD_MS) {
          const diag = stt.getDiagnostics();
          const text = safeStop() || snapshot;
          const finalMatch = matchMicCheck(language, text);
          finish("passed", null, finalMatch.pass ? finalMatch : match, diag, text);
          return;
        }
      } else {
        matchSinceRef.current = 0;
      }

      const s = statsRef.current;
      const elapsed = now - listenStartRef.current;
      if (s.voicedMs === 0 && match.tokens === 0 && elapsed > NO_SPEECH_MS) {
        toVerifying();
        return;
      }
      if (
        s.voicedMs >= MIN_VOICE_BEFORE_EOS_MS &&
        s.lastVoiceAt > 0 &&
        now - s.lastVoiceAt >= END_OF_SPEECH_MS
      ) {
        toVerifying();
        return;
      }
      if (elapsed > LISTEN_MAX_MS) toVerifying();
      return;
    }

    if (st === "energy_only" && now - phaseStartRef.current > ENERGY_WINDOW_MS) {
      finishEnergyWindow();
    }
  };
  latestTickRef.current = tick;

  latestTeardownRef.current = () => {
    stopTimers();
    if (cooldownRef.current != null) { clearTimeout(cooldownRef.current); cooldownRef.current = null; }
    safeStop();
    closeAudio();
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleStart = () => {
    if (busy) return;
    attemptRef.current += 1;
    setAttempt(attemptRef.current);
    attemptStartRef.current = Date.now();
    matchSinceRef.current = 0;
    everConnectedRef.current = false;
    micLabelRef.current = "";
    statsRef.current = freshStats();
    setMicLabel("");
    setHeard("");
    setReason(null);
    setLevel(0);
    setRetryReady(false);

    // The AudioContext MUST be created here: this click is the user gesture
    // that lets it start in the "running" state.
    openAudioContext();

    if (!sttEnabled) {
      // No session id — nothing to authorize speech-to-text with, so fall
      // straight through to the volume-only check (not an outage).
      attachMeter(stream);
      const track = stream.getAudioTracks()[0];
      if (track) { micLabelRef.current = track.label || ""; setMicLabel(track.label || ""); }
      goto("energy_only");
      startTicker();
      return;
    }

    if (!stt.isSupported) {
      finish("failed", "recorder", null, null, "");
      return;
    }

    goto("starting");
    void stt.start();
    startTicker();
  };

  const handleContinue = () => {
    latestTeardownRef.current();
    onNext();
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (hasVideo && videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, hasVideo]);

  // The speech-to-text capture appears asynchronously after start(); meter that
  // stream, because it is the one the interview will actually transcribe.
  useEffect(() => {
    const micStream = stt.micStream;
    if (!micStream) return;
    const track = micStream.getAudioTracks()[0];
    const label = track?.label || "";
    micLabelRef.current = label;
    setMicLabel(label);
    attachMeter(micStream);
    // attachMeter/refs are stable for this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.micStream]);

  // Every exit path releases the microphone and closes the AudioContext. The
  // webcam stream's tracks are never touched — the recording needs them.
  useEffect(() => {
    return () => latestTeardownRef.current();
  }, []);

  // ── Copy ───────────────────────────────────────────────────────────────────

  const subtitle = (() => {
    switch (state) {
      case "idle":
        return "Click Start, then read this sentence aloud in your normal voice:";
      case "starting":
        return "Connecting to your microphone…";
      case "listening":
        return "Listening — read the sentence now.";
      case "verifying":
        return "Checking…";
      case "energy_only":
        return sttDown
          ? "Our speech check is temporarily unavailable. Please read the sentence aloud so we can check your microphone volume instead."
          : "Please read the sentence aloud so we can check that your microphone is picking up your voice.";
      default:
        return "";
    }
  })();

  const showSentence =
    state === "idle" || state === "starting" || state === "listening" || state === "energy_only" || state === "failed";
  const showMeter = state === "listening" || state === "energy_only";
  const suspiciousLabel = isSuspiciousMicLabel(micLabel);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Microphone check</h2>
      {subtitle && <p className="text-gray-500 text-center mb-6 text-sm max-w-md">{subtitle}</p>}

      <div className="w-full max-w-md space-y-5">
        {/* Camera preview — only when there is a camera. Mic-only jobs used to
            get an empty black box with a green "Live" badge. */}
        {hasVideo && (
          <div className="bg-gray-900 rounded-2xl overflow-hidden aspect-[4/3] relative border border-gray-200">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain" />
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1">
              <Video className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400">Live</span>
            </div>
          </div>
        )}

        {showSentence && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center">
            <p className="text-lg font-semibold text-gray-900 leading-relaxed">{target.display}</p>
            {target.roman && <p className="text-sm text-gray-600 mt-1.5">{target.roman}</p>}
            {target.gloss && <p className="text-xs text-gray-400 mt-1">{target.gloss}</p>}
          </div>
        )}

        {showMeter && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mic className="w-4 h-4 text-gray-500" />
              <span className="text-gray-700 text-sm font-medium">Microphone level</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${level}%`,
                  background: level > 60 ? "#22c55e" : level > 30 ? "#eab308" : "#3b82f6",
                }}
              />
            </div>
            {micLabel && <p className="text-xs text-gray-400 mt-2 break-words">Microphone: {micLabel}</p>}
          </div>
        )}

        {state === "listening" && heard && (
          <p className="text-sm text-gray-600 text-center break-words">
            We heard: &ldquo;{heard}&rdquo;
          </p>
        )}

        {suspiciousLabel && !passedState && (
          <InfoBox tone="amber">
            <p>
              The selected microphone ({micLabel}) looks like a system-audio device, not a microphone.
              If we can&apos;t hear you, choose your real microphone in Site settings.
            </p>
          </InfoBox>
        )}

        {state === "verifying" && (
          <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking…
          </div>
        )}

        {state === "energy_only" && (
          <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Listening for your voice…
          </div>
        )}

        {/* ── Results ── */}

        {state === "passed" && (
          <InfoBox tone="green">
            <p className="font-semibold">Microphone working — we heard you clearly.</p>
          </InfoBox>
        )}

        {state === "soft_passed" && (
          <InfoBox tone="green">
            <p className="font-semibold">Your microphone is working.</p>
            <p className="mt-1">
              We couldn&apos;t match every word, and that&apos;s okay — you can continue. During the
              interview, check your answer text before you send it.
            </p>
          </InfoBox>
        )}

        {state === "energy_passed" && (
          <InfoBox tone="green">
            <p className="font-semibold">Your microphone is picking up your voice, so you can continue.</p>
            {sttDown && (
              <p className="mt-1">
                Our speech service had a problem — if your answers don&apos;t appear as text during
                the interview, tell your recruiter.
              </p>
            )}
          </InfoBox>
        )}

        {state === "failed" && reason && (
          <FailureBox reason={reason} micLabel={micLabel} heard={heard} />
        )}

        {/* ── Buttons ── */}

        {(state === "idle" || (state === "failed" && reason !== "session_invalid")) && (
          <Button
            onClick={handleStart}
            disabled={busy || !retryReady}
            className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2"
          >
            {state === "idle" ? <Mic className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
            {state === "idle" ? "Start microphone check" : "Try again"}
          </Button>
        )}

        {state === "failed" && reason === "session_invalid" && (
          <Button
            onClick={() => window.location.reload()}
            className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reload page
          </Button>
        )}

        {(state === "starting" || state === "verifying") && (
          <Button disabled className="w-full h-12 bg-blue-600 text-white rounded-xl gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {state === "starting" ? "Connecting…" : "Checking…"}
          </Button>
        )}

        {state === "listening" && (
          <Button
            variant="ghost"
            onClick={toVerifying}
            className="w-full h-12 text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl"
          >
            I&apos;ve finished reading
          </Button>
        )}

        {passedState && (
          <Button
            onClick={handleContinue}
            className="w-full h-12 bg-green-600 hover:bg-green-500 text-white rounded-xl gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Continue
          </Button>
        )}

        {/* Observe mode: the whole check and its telemetry still run, but the
            candidate is never held up by the result. */}
        {observeMode && !passedState && (
          <Button
            variant="ghost"
            onClick={handleContinue}
            disabled={busy}
            className="w-full h-12 text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl"
          >
            Continue
          </Button>
        )}

        {state === "failed" && attempt >= 3 && (
          <p className="text-xs text-gray-500 text-center">
            Still not working? Contact your recruiter
            {managerEmail ? ` at ${managerEmail}` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Presentational helpers ───────────────────────────────────────────────────

function InfoBox({ tone, children }: { tone: "green" | "amber" | "red"; children: React.ReactNode }) {
  const styles =
    tone === "green"
      ? "bg-green-50 border-green-200 text-green-700"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-red-50 border-red-200 text-red-700";
  const Icon = tone === "green" ? CheckCircle : tone === "amber" ? AlertTriangle : XCircle;
  const iconColor =
    tone === "green" ? "text-green-500" : tone === "amber" ? "text-amber-500" : "text-red-500";
  return (
    <div className={`border rounded-xl px-4 py-3 text-left text-sm ${styles}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * Exact candidate-facing copy per failure mode. Plain, friendly, and always
 * ending in something the candidate can actually do.
 */
function FailureBox({ reason, micLabel, heard }: { reason: FailReason; micLabel: string; heard: string }) {
  const device = micLabel || "your microphone";

  switch (reason) {
    case "mic_not_allowed":
      return (
        <InfoBox tone="red">
          <p className="font-semibold">Microphone access is blocked.</p>
          <p className="mt-1">
            Click the icon to the left of the web address, set Microphone to Allow, then click Try
            again. On Windows, also open Settings &gt; Privacy &amp; security &gt; Microphone and make
            sure your browser is allowed.
          </p>
        </InfoBox>
      );
    case "mic_not_found":
      return (
        <InfoBox tone="red">
          <p className="font-semibold">No microphone found.</p>
          <p className="mt-1">Connect a microphone or headset, then click Try again.</p>
        </InfoBox>
      );
    case "mic_busy":
      return (
        <InfoBox tone="red">
          <p className="font-semibold">Your microphone is being used by another app.</p>
          <p className="mt-1">
            Close apps that might be using it (for example Zoom, Microsoft Teams, Google Meet or
            WhatsApp), then click Try again.
          </p>
        </InfoBox>
      );
    case "recorder":
      return (
        <InfoBox tone="red">
          <p className="font-semibold">Your browser can&apos;t record audio for this interview.</p>
          <p className="mt-1">
            Please open this link in the latest Google Chrome or Microsoft Edge on a desktop or
            laptop.
          </p>
        </InfoBox>
      );
    case "session_invalid":
      return (
        <InfoBox tone="red">
          <p className="font-semibold">We couldn&apos;t verify your interview session.</p>
          <p className="mt-1">Please reload this page to continue.</p>
        </InfoBox>
      );
    case "silent":
      return (
        <InfoBox tone="red">
          <p className="font-semibold">We can&apos;t hear anything from your microphone.</p>
          <ul className="mt-1.5 list-disc list-outside pl-4 space-y-1">
            <li>
              Check that your microphone isn&apos;t muted. Many laptops have a mute key (often F4, or
              a key showing a microphone with a line through it), and headsets often have a mute
              switch.
            </li>
            <li>If you&apos;re using a headset or earphones, make sure they&apos;re connected.</li>
            <li>
              Microphone in use: {device}. To change it, click the icon to the left of the web
              address, open Site settings, choose a different microphone, then click Try again.
            </li>
          </ul>
        </InfoBox>
      );
    case "noise_no_speech":
      return (
        <InfoBox tone="red">
          <p className="font-semibold">We picked up sound, but not your voice.</p>
          <p className="mt-1">
            Make sure the right microphone is selected (currently: {device}), speak towards it, and
            move somewhere quieter if you can.
          </p>
        </InfoBox>
      );
    case "no_words":
      return (
        <InfoBox tone="amber">
          <p className="font-semibold">We could hear you speaking, but couldn&apos;t make out the words.</p>
          <p className="mt-1">Please read the sentence again, a little slower and clearly.</p>
        </InfoBox>
      );
    case "mismatch":
      return (
        <InfoBox tone="amber">
          <p className="font-semibold">We heard you, but the words didn&apos;t match the sentence.</p>
          <p className="mt-1 break-words">
            We heard: &ldquo;{heard}&rdquo;. Please read the sentence again, slowly and clearly.
          </p>
        </InfoBox>
      );
    case "mic_start_timeout":
      return (
        <InfoBox tone="red">
          <p className="font-semibold">Your microphone is taking too long to start.</p>
          <p className="mt-1">Click Try again. If this keeps happening, reload the page.</p>
        </InfoBox>
      );
  }
}

/**
 * NEXT_PUBLIC_MIC_CHECK_MODE="off" — the previous screen: a level bar on the
 * permission stream and an always-enabled Continue. Kept so the spoken check
 * can be switched off in production without a code revert. The camera preview
 * is still hidden for mic-only jobs; that black box was always a bug.
 */
function SimpleDeviceTest({ stream, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [micLevel, setMicLevel] = useState(0);
  const animRef = useRef<number | null>(null);
  const hasVideo = stream.getVideoTracks().length > 0;

  useEffect(() => {
    if (hasVideo && videoRef.current) videoRef.current.srcObject = stream;
    let audioCtx: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    const dataArray = new Uint8Array(256);
    try {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      source?.disconnect();
      audioCtx?.close();
    };
  }, [stream, hasVideo]);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Device Test</h2>
      <p className="text-gray-500 text-center mb-8 text-sm">Make sure your camera and microphone are working correctly.</p>

      <div className="w-full max-w-md space-y-5">
        {/* Camera preview */}
        {hasVideo && (
          <div className="bg-gray-900 rounded-2xl overflow-hidden aspect-[4/3] relative border border-gray-200">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain" />
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1">
              <Video className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400">Live</span>
            </div>
          </div>
        )}

        {/* Mic level */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700 text-sm font-medium">Microphone Level</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{ width: `${micLevel}%`, background: micLevel > 60 ? "#22c55e" : micLevel > 30 ? "#eab308" : "#3b82f6" }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {micLevel > 5 ? "Microphone is picking up audio" : "Speak to test your microphone"}
          </p>
        </div>

        <Button onClick={onNext} className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2">
          <CheckCircle className="w-4 h-4" />
          Looks Good, Continue
        </Button>
      </div>
    </div>
  );
}
