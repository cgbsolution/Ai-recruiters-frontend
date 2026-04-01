"use client";

import { useCallback, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface SpeechSynthesisHook {
  speak: (text: string) => void;
  cancel: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

/**
 * Text-to-Speech hook using backend edge-tts (Indian accent neural voice).
 *
 * Flow:
 * 1. speak(text) → fetch /tts/speak?text=... as streaming audio
 * 2. Play MP3 via HTML5 Audio element
 * 3. Set isSpeaking=true during playback, false when done
 *
 * Falls back to browser Web Speech API if backend TTS fails.
 */
export function useSpeechSynthesis(): SpeechSynthesisHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fallbackUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const cancel = useCallback(() => {
    // Cancel backend audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Cancel browser fallback
    if (fallbackUtteranceRef.current) {
      window.speechSynthesis?.cancel();
      fallbackUtteranceRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speakWithBrowserFallback = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Try to find an English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) =>
      v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural"))
    ) || voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    fallbackUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((text: string) => {
    // Cancel any ongoing speech
    cancel();

    if (!text.trim()) return;

    // Create abort controller for this request
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSpeaking(true);

    // Build TTS URL
    const params = new URLSearchParams({
      text: text.trim(),
      voice: "neerja-expressive",
      rate: "+5%",
    });
    const url = `${API_BASE}/tts/speak?${params.toString()}`;

    // Create audio element and play streamed MP3
    const audio = new Audio();
    audioRef.current = audio;

    audio.onended = () => {
      setIsSpeaking(false);
      audioRef.current = null;
    };

    audio.onerror = () => {
      // Backend TTS failed — fall back to browser Speech API
      console.warn("Backend TTS failed, falling back to browser speech");
      audioRef.current = null;
      speakWithBrowserFallback(text);
    };

    // Use fetch to get audio with abort support, then play via blob URL
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("TTS request failed");
        return res.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        const blobUrl = URL.createObjectURL(blob);
        audio.src = blobUrl;
        audio.play().catch(() => {
          // Autoplay blocked — fall back
          URL.revokeObjectURL(blobUrl);
          speakWithBrowserFallback(text);
        });
        // Clean up blob URL when audio ends
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(blobUrl);
          audioRef.current = null;
        };
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        // Fall back to browser
        speakWithBrowserFallback(text);
      });
  }, [cancel, speakWithBrowserFallback]);

  return {
    speak,
    cancel,
    isSpeaking,
    isSupported: true, // Always supported — backend TTS + browser fallback
  };
}
