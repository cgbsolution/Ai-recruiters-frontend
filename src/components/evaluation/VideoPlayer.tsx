"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
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
  const [resolving, setResolving] = useState(true);
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

  const skipForward = useCallback(() => {
    if (!video) return;
    video.currentTime = Math.min(video.currentTime + 10, duration);
  }, [video, duration]);

  const skipBackward = useCallback(() => {
    if (!video) return;
    video.currentTime = Math.max(video.currentTime - 10, 0);
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

  const seekTo = useCallback(
    (clientX: number) => {
      if (!videoRef.current || !progressRef.current || duration <= 0) return;
      const rect = progressRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      videoRef.current.currentTime = pct * duration;
      setCurrentTime(pct * duration);
    },
    [duration]
  );

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => seekTo(e.clientX),
    [seekTo]
  );

  const handleSeekDragStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      seekTo(e.clientX);
      const onMove = (ev: MouseEvent) => seekTo(ev.clientX);
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [seekTo]
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!videoRef.current) return;
      // Don't capture if user is typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          skipForward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skipBackward();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [togglePlay, skipForward, skipBackward, toggleMute, toggleFullscreen]);

  /**
   * Resolve WebM duration — MediaRecorder WebM files often report Infinity.
   * Seek to a huge time -> browser clamps -> read back real duration.
   */
  const resolveDuration = useCallback((v: HTMLVideoElement) => {
    if (resolvedRef.current) return;

    const finishResolve = (dur: number) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setDuration(dur);
      v.currentTime = 0;
      setCurrentTime(0);
      setResolving(false);
    };

    if (v.duration && isFinite(v.duration) && v.duration > 0.5) {
      finishResolve(v.duration);
      return;
    }

    const onSeeked = () => {
      v.removeEventListener("seeked", onSeeked);
      if (v.duration && isFinite(v.duration) && v.duration > 0.5) {
        finishResolve(v.duration);
      } else if (v.currentTime > 0) {
        finishResolve(v.currentTime);
      } else {
        resolvedRef.current = true;
        setResolving(false);
      }
    };
    v.addEventListener("seeked", onSeeked, { once: true });
    v.currentTime = 1e15;

    setTimeout(() => {
      if (!resolvedRef.current) {
        v.removeEventListener("seeked", onSeeked);
        resolvedRef.current = true;
        if (v.duration && isFinite(v.duration)) {
          setDuration(v.duration);
        }
        v.currentTime = 0;
        setResolving(false);
      }
    }, 5000);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    resolvedRef.current = false;
    setResolving(true);
    setDuration(0);
    setCurrentTime(0);
    v.load();

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(v.currentTime);
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
        if ((e.target as HTMLElement).closest("[data-controls]")) return;
        if (resolving) return;
        togglePlay();
      }}
    >
      <video ref={videoRef} className="w-full block" preload="auto" crossOrigin="anonymous">
        <source src={src} type="video/webm;codecs=vp9,opus" />
        <source src={src} type="video/webm;codecs=vp8,opus" />
        <source src={src} type="video/webm" />
      </video>

      {/* Loading overlay */}
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
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-3 px-3 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="h-1.5 bg-white/25 rounded-full cursor-pointer group/progress hover:h-2.5 transition-all"
          onClick={handleSeek}
          onMouseDown={handleSeekDragStart}
        >
          <div
            className="h-full bg-blue-500 rounded-full relative"
            style={{ width: `${pct}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/progress:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Time below progress bar */}
        <div className="flex justify-between px-0.5 mt-1 mb-1.5">
          <span className="text-white/70 text-[11px] tabular-nums">{fmt(currentTime)}</span>
          <span className="text-white/70 text-[11px] tabular-nums">{fmt(duration)}</span>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-1">
          {/* Volume */}
          <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:text-blue-400 transition-colors size-8">
            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Slider
            value={[muted ? 0 : volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={handleVolumeChange}
            className="w-14 cursor-pointer"
          >
            <SliderTrack className="h-1 bg-white/25">
              <SliderRange className="bg-blue-500" />
            </SliderTrack>
            <SliderThumb className="size-3 border-blue-500" />
          </Slider>

          <div className="flex-1" />

          {/* Skip backward 10s */}
          <Button variant="ghost" size="icon" onClick={skipBackward} className="text-white hover:text-blue-400 transition-colors size-8" title="Back 10s">
            <RotateCcw className="w-4 h-4" />
          </Button>

          {/* Play / Pause */}
          <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors size-9">
            {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
          </Button>

          {/* Skip forward 10s */}
          <Button variant="ghost" size="icon" onClick={skipForward} className="text-white hover:text-blue-400 transition-colors size-8" title="Forward 10s">
            <RotateCw className="w-4 h-4" />
          </Button>

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
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
