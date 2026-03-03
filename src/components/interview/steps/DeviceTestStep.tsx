"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Video } from "lucide-react";

interface Props {
  stream: MediaStream;
  onNext: () => void;
}

export default function DeviceTestStep({ stream, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [micLevel, setMicLevel] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    // Mic level meter via AudioContext
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
    } catch {
      // AudioContext may not be available
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      source?.disconnect();
      audioCtx?.close();
    };
  }, [stream]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <h2 className="text-3xl font-bold text-white mb-2 text-center">Device Test</h2>
      <p className="text-gray-400 text-center mb-8">
        Make sure your camera and microphone are working correctly.
      </p>

      <div className="w-full max-w-md space-y-6">
        {/* Camera preview — 4:3 shows full face + upper body */}
        <div className="bg-black rounded-2xl overflow-hidden aspect-[4/3] relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain"
          />
          <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1">
            <Video className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">Live</span>
          </div>
        </div>

        {/* Mic level */}
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-4 h-4 text-gray-400" />
            <span className="text-gray-300 text-sm font-medium">Microphone Level</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${micLevel}%`,
                background: micLevel > 60 ? "#22c55e" : micLevel > 30 ? "#eab308" : "#3b82f6",
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {micLevel > 5 ? "Microphone is picking up audio" : "Speak to test your microphone"}
          </p>
        </div>

        <Button
          onClick={onNext}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700"
        >
          Looks Good, Continue
        </Button>
      </div>
    </div>
  );
}
