"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

interface Props {
  src: string;
}

function fmt(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayer({ src }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const video = videoRef.current;

  const togglePlay = useCallback(() => {
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, [video]);

  const toggleMute = useCallback(() => {
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, [video]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!video) return;
      const v = parseFloat(e.target.value);
      video.volume = v;
      setVolume(v);
      if (v === 0) {
        video.muted = true;
        setMuted(true);
      } else if (video.muted) {
        video.muted = false;
        setMuted(false);
      }
    },
    [video]
  );

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!video || !progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      video.currentTime = pct * video.duration;
    },
    [video]
  );

  const handleSpeed = useCallback(
    (s: number) => {
      if (!video) return;
      video.playbackRate = s;
      setSpeed(s);
      setShowSpeedMenu(false);
    },
    [video]
  );

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  // Sync state from video events
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(v.currentTime);
    const onMeta = () => setDuration(v.duration);
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    document.addEventListener("fullscreenchange", onFsChange);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

  // Auto-hide controls during playback
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (!playing) {
      setShowControls(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    }
  }, [playing]);

  // Close speed menu on outside click
  useEffect(() => {
    if (!showSpeedMenu) return;
    const close = () => setShowSpeedMenu(false);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [showSpeedMenu]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative group rounded-lg overflow-hidden bg-black select-none"
      onMouseMove={resetHideTimer}
      onClick={(e) => {
        // Only toggle play if clicking the video area, not controls
        if ((e.target as HTMLElement).closest("[data-controls]")) return;
        togglePlay();
      }}
    >
      <video ref={videoRef} src={src} className="w-full block" preload="metadata" />

      {/* Big center play icon when paused */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-7 h-7 text-white ml-1" />
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div
        data-controls
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-2 px-3 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="h-1.5 bg-white/25 rounded-full cursor-pointer mb-2 group/progress hover:h-2.5 transition-all"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-blue-500 rounded-full relative"
            style={{ width: `${pct}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/progress:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Play / Pause */}
          <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors p-1">
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          {/* Volume */}
          <button onClick={toggleMute} className="text-white hover:text-blue-400 transition-colors p-1">
            {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 accent-blue-500 cursor-pointer"
          />

          {/* Time */}
          <span className="text-white/80 text-xs tabular-nums ml-1">
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <div className="flex-1" />

          {/* Speed */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeedMenu((p) => !p);
              }}
              className="text-white/80 hover:text-white text-xs font-medium px-2 py-0.5 rounded border border-white/20 hover:border-white/40 transition-colors"
            >
              {speed}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg py-1 shadow-xl z-10">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeed(s);
                    }}
                    className={`block w-full text-left px-4 py-1.5 text-xs whitespace-nowrap transition-colors ${
                      s === speed
                        ? "text-blue-400 bg-blue-500/10"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="text-white hover:text-blue-400 transition-colors p-1">
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
