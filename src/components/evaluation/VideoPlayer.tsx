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
import { Button } from "@/components/ui/button";
import {
  Slider,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from "@/components/ui/slider";

interface Props {
  src: string;
}

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
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
  const [resolving, setResolving] = useState(true); // loading state while resolving duration
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedRef = useRef(false);

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
    ([v]: number[]) => {
      if (!video) return;
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
      if (!video || !progressRef.current || duration <= 0) return;
      const rect = progressRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      video.currentTime = pct * duration;
    },
    [video, duration]
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

  /**
   * Resolve WebM duration — MediaRecorder WebM files often report Infinity.
   * Strategy: seek to a huge time (1e10), browser clamps to actual end,
   * then read either the now-finite duration or use currentTime as fallback.
   */
  const resolveDuration = useCallback((v: HTMLVideoElement) => {
    if (resolvedRef.current) return;

    const finishResolve = (dur: number) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setDuration(dur);
      // Reset to beginning
      v.currentTime = 0;
      setCurrentTime(0);
      setResolving(false);
    };

    // If duration is already finite, we're good
    if (v.duration && isFinite(v.duration) && v.duration > 0.5) {
      finishResolve(v.duration);
      return;
    }

    // WebM workaround: seek to a very large time
    const onSeeked = () => {
      v.removeEventListener("seeked", onSeeked);

      if (v.duration && isFinite(v.duration) && v.duration > 0.5) {
        finishResolve(v.duration);
      } else if (v.currentTime > 0.5) {
        // duration is still Infinity, but currentTime got clamped to the actual end
        finishResolve(v.currentTime);
      } else {
        // Last resort: try using buffered ranges
        if (v.buffered.length > 0) {
          finishResolve(v.buffered.end(v.buffered.length - 1));
        } else {
          // Give up — set a minimal duration so controls still work
          setResolving(false);
        }
      }
    };

    v.addEventListener("seeked", onSeeked);
    // Use 1e10 instead of MAX_SAFE_INTEGER — more browser-friendly
    v.currentTime = 1e10;

    // Safety timeout: if seeked never fires within 3s, give up gracefully
    setTimeout(() => {
      if (!resolvedRef.current) {
        v.removeEventListener("seeked", onSeeked);
        // Try reading whatever we have
        if (v.duration && isFinite(v.duration) && v.duration > 0.5) {
          finishResolve(v.duration);
        } else if (v.currentTime > 0.5) {
          finishResolve(v.currentTime);
        } else if (v.buffered.length > 0) {
          finishResolve(v.buffered.end(v.buffered.length - 1));
        } else {
          resolvedRef.current = true;
          v.currentTime = 0;
          setResolving(false);
        }
      }
    }, 3000);
  }, []);

  // Sync state from video events
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Reset resolve state when src changes
    resolvedRef.current = false;
    setResolving(true);
    setDuration(0);
    setCurrentTime(0);

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(v.currentTime);
      // Also update duration if it becomes finite during playback
      if (!resolvedRef.current && v.duration && isFinite(v.duration) && v.duration > 0.5) {
        resolvedRef.current = true;
        setDuration(v.duration);
        setResolving(false);
      }
    };
    const onMeta = () => resolveDuration(v);
    const onDurationChange = () => {
      if (v.duration && isFinite(v.duration) && v.duration > 0.5) {
        if (!resolvedRef.current) {
          resolvedRef.current = true;
          setResolving(false);
        }
        setDuration(v.duration);
      }
    };
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);

    // If video is already loaded (cached), resolve immediately
    if (v.readyState >= 1) {
      resolveDuration(v);
    }

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onDurationChange);
    document.addEventListener("fullscreenchange", onFsChange);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onDurationChange);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [src, resolveDuration]);

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
        if (resolving) return; // Don't toggle during duration resolve
        togglePlay();
      }}
    >
      <video ref={videoRef} src={src} className="w-full block" preload="metadata" />

      {/* Loading overlay while resolving duration */}
      {resolving && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto mb-2" />
            <p className="text-white/60 text-xs">Loading video...</p>
          </div>
        </div>
      )}

      {/* Big center play icon when paused */}
      {!playing && !resolving && (
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
          <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors size-8">
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>

          {/* Volume */}
          <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:text-blue-400 transition-colors size-8">
            {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
          <Slider
            value={[muted ? 0 : volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={handleVolumeChange}
            className="w-16 cursor-pointer"
          >
            <SliderTrack className="h-1 bg-white/25">
              <SliderRange className="bg-blue-500" />
            </SliderTrack>
            <SliderThumb className="size-3 border-blue-500" />
          </Slider>

          {/* Time */}
          <span className="text-white/80 text-xs tabular-nums ml-1">
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <div className="flex-1" />

          {/* Speed */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeedMenu((p) => !p);
              }}
              className="text-white/80 hover:text-white text-xs font-medium h-6 w-auto px-2 rounded border border-white/20 hover:border-white/40 transition-colors"
            >
              {speed}x
            </Button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg py-1 shadow-xl z-10">
                {SPEEDS.map((s) => (
                  <Button
                    key={s}
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeed(s);
                    }}
                    className={`block w-full justify-start rounded-none px-4 py-1.5 text-xs whitespace-nowrap transition-colors ${
                      s === speed
                        ? "text-blue-400 bg-blue-500/10"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {s}x
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:text-blue-400 transition-colors size-8">
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
