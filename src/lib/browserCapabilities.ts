/**
 * Browser capability detection for the interview flow.
 *
 * The interview is built around Chromium desktop APIs. Instead of letting a
 * Firefox/Safari candidate invest 10 minutes in the pre-interview flow and
 * then hit a dead end (e.g. an unsatisfiable "share system audio" loop), we
 * detect capabilities up front and degrade or block with a clear message.
 */

export function isFirefox(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Firefox");
}

export function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|chromium|crios|android|edg/i.test(ua);
}

/**
 * Whether this browser can realistically include system audio in
 * getDisplayMedia. Firefox cannot capture system audio at all; Safari has no
 * system-audio support either. Only enforce the "Also share system audio"
 * requirement where the browser can actually satisfy it (Chromium).
 */
export function canCaptureSystemAudio(): boolean {
  return !isFirefox() && !isSafari();
}

export interface CapabilityCheck {
  supported: boolean;
  missing: string[];
}

/**
 * Hard requirements for the interview room. Called once at flow start so an
 * unsupported browser gets a clear "use Chrome/Edge" screen instead of a
 * mid-flow failure (Safari's MediaRecorder cannot produce WebM, which both
 * the STT pipeline and the interview recording depend on).
 */
export function checkInterviewCapabilities(opts: { requireScreenShare: boolean }): CapabilityCheck {
  const missing: string[] = [];
  if (typeof navigator === "undefined") return { supported: true, missing };

  if (!navigator.mediaDevices?.getUserMedia) {
    missing.push("microphone/camera access (getUserMedia)");
  }
  if (typeof MediaRecorder === "undefined") {
    missing.push("media recording (MediaRecorder)");
  } else if (
    typeof MediaRecorder.isTypeSupported === "function" &&
    !MediaRecorder.isTypeSupported("audio/webm") &&
    !MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
  ) {
    missing.push("WebM audio recording (required for live transcription)");
  }
  if (typeof WebSocket === "undefined") {
    missing.push("WebSocket");
  }
  if (opts.requireScreenShare && !navigator.mediaDevices?.getDisplayMedia) {
    missing.push("screen sharing (getDisplayMedia)");
  }
  return { supported: missing.length === 0, missing };
}
