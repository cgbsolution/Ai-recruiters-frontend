"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VoiceVisualizer, { type VoiceMode } from "@/components/interview/VoiceVisualizer";

const MODES: VoiceMode[] = ["idle", "listening", "speaking", "processing"];

export default function VoiceDebugPage() {
  const [mode, setMode] = useState<VoiceMode>("idle");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [size, setSize] = useState(360);

  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsAudio, setTtsAudio] = useState<HTMLAudioElement | null>(null);

  const enableMic = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setMicStream(stream);
    } catch (e: any) {
      setMicError(e?.message || "Microphone access denied");
    }
  }, []);

  const disableMic = useCallback(() => {
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    setMicStream(null);
  }, [micStream]);

  // Simple oscillator-backed "speaking" test — drives a real AnalyserNode so
  // the orb pulses off a live frequency stream instead of the synthetic
  // fallback. Click "Speak test tone" to hear/see it.
  const [testPlaying, setTestPlaying] = useState(false);
  const playTestTone = useCallback(async () => {
    if (testPlaying) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const masterGain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();

      // Modulate amplitude with an LFO so the waveform isn't a flat sine —
      // this gives the visualizer something speech-like to react to.
      lfo.frequency.value = 3;
      lfoGain.gain.value = 0.25;
      lfo.connect(lfoGain).connect(masterGain.gain);
      masterGain.gain.value = 0.35;

      osc.type = "sine";
      osc.frequency.value = 220;
      osc.connect(masterGain).connect(ctx.destination);
      masterGain.connect(dest);

      osc.start();
      lfo.start();

      // Play the stream via an HTMLAudioElement and hand it to the
      // visualizer — mirrors how the real TTS hook exposes its audio.
      const audio = new Audio();
      audio.srcObject = dest.stream;
      audio.muted = true; // avoid double-playing through ctx.destination
      audio.play().catch(() => {});
      ttsAudioRef.current = audio;
      setTtsAudio(audio);
      setTestPlaying(true);

      // Stop after 5s
      setTimeout(() => {
        try { osc.stop(); lfo.stop(); ctx.close(); } catch {}
        try { audio.pause(); } catch {}
        ttsAudioRef.current = null;
        setTtsAudio(null);
        setTestPlaying(false);
      }, 5000);
    } catch (e) {
      console.error("[VoiceDebug] test tone failed", e);
    }
  }, [testPlaying]);

  useEffect(() => {
    return () => {
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      if (ttsAudioRef.current) { try { ttsAudioRef.current.pause(); } catch {} }
    };
  }, [micStream]);

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Visualizer viewport */}
      <div className="flex-1 relative flex items-center justify-center">
        <div
          className="rounded-2xl overflow-hidden bg-white"
          style={{ width: size, height: size }}
        >
          <VoiceVisualizer
            mode={mode}
            micStream={micStream}
            ttsAudio={ttsAudio}
          />
        </div>
      </div>

      {/* Controls panel */}
      <div className="w-80 bg-gray-900 border-l border-gray-800 p-5 flex flex-col gap-5 overflow-y-auto">
        <div>
          <h2 className="text-white text-lg font-bold">Voice Visualizer Debug</h2>
          <p className="text-gray-500 text-xs mt-1">
            Test the orb across modes and with live audio sources.
          </p>
        </div>

        {/* Mode selector */}
        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Mode</h3>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  mode === m
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Size slider */}
        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
            Canvas size <span className="text-gray-500 font-normal">{size}px</span>
          </h3>
          <input
            type="range"
            min={200}
            max={600}
            step={10}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Microphone controls */}
        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
            Microphone
          </h3>
          {micStream ? (
            <button
              onClick={disableMic}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
            >
              Stop microphone
            </button>
          ) : (
            <button
              onClick={enableMic}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors"
            >
              Enable microphone
            </button>
          )}
          {micError && (
            <p className="text-red-400 text-xs mt-2">{micError}</p>
          )}
          <p className="text-gray-500 text-[11px] mt-2">
            Enable then switch to <span className="text-gray-300">listening</span> — the orb reacts to your voice.
          </p>
        </div>

        {/* Test tone */}
        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
            TTS audio (simulated)
          </h3>
          <button
            onClick={playTestTone}
            disabled={testPlaying}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              testPlaying
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-500"
            }`}
          >
            {testPlaying ? "Playing test tone…" : "Play 5-second test tone"}
          </button>
          <p className="text-gray-500 text-[11px] mt-2">
            Switch to <span className="text-gray-300">speaking</span> first — routes a modulated 220Hz tone through an AnalyserNode, mirroring how the real TTS audio is wired.
          </p>
        </div>

        {/* State readout */}
        <div className="border-t border-gray-800 pt-4 mt-auto">
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Current State</h3>
          <div className="flex flex-col gap-1 text-xs">
            <Row label="Mode" value={mode} valueColor="text-blue-400" />
            <Row label="Mic stream" value={micStream ? "connected" : "—"} valueColor={micStream ? "text-green-400" : "text-gray-600"} />
            <Row label="TTS audio" value={ttsAudio ? "wired" : "—"} valueColor={ttsAudio ? "text-purple-400" : "text-gray-600"} />
            <Row label="Canvas" value={`${size}×${size}`} valueColor="text-gray-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={valueColor}>{value}</span>
    </div>
  );
}
