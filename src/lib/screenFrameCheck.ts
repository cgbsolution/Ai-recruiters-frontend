/**
 * Detects a screen share that is "working" but delivers only black frames.
 *
 * The track is live, the browser reports no error, and the recording comes
 * out as 11 minutes of black with perfect audio — session 52 (2026-10-16), a
 * Mac whose Chrome lacked macOS's Screen Recording permission: 6 MB for
 * 11:35, i.e. the audio track and nothing else. Some Windows laptops (two
 * graphics chips) do the same. Nothing noticed until the recruiter pressed
 * play.
 *
 * The check is a 32x18 thumbnail of the frame: a real screen — even a
 * dark-mode one — has text or UI somewhere that lifts a pixel above the
 * threshold; a broken capture is all zeros.
 */

const PROBE_WIDTH = 32;
const PROBE_HEIGHT = 18;
/** Brightest a channel may be (0-255) for a thumbnail pixel to count as black. */
const BLACK_MAX_CHANNEL = 8;

export function createFrameProbe(): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = PROBE_WIDTH;
  canvas.height = PROBE_HEIGHT;
  return canvas.getContext("2d", { willReadFrequently: true });
}

/** true = the current frame is black, false = it has content,
 *  null = no frame to judge yet (or it couldn't be read). */
export function isVideoFrameBlack(
  video: HTMLVideoElement,
  probe: CanvasRenderingContext2D,
): boolean | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  try {
    probe.drawImage(video, 0, 0, PROBE_WIDTH, PROBE_HEIGHT);
    const { data } = probe.getImageData(0, 0, PROBE_WIDTH, PROBE_HEIGHT);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > BLACK_MAX_CHANNEL || data[i + 1] > BLACK_MAX_CHANNEL || data[i + 2] > BLACK_MAX_CHANNEL) {
        return false;
      }
    }
    return true;
  } catch {
    return null;
  }
}

/** Watch a freshly shared screen for a few seconds. Resolves true if it never
 *  showed anything but black (or never produced a frame at all). */
export async function screenShareLooksBlack(stream: MediaStream, timeoutMs = 4000): Promise<boolean> {
  const probe = createFrameProbe();
  if (!probe || stream.getVideoTracks().length === 0) return false;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.play().catch(() => {});
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (isVideoFrameBlack(video, probe) === false) return false;
      await new Promise((r) => setTimeout(r, 250));
    }
    return true;
  } finally {
    video.pause();
    video.srcObject = null;
  }
}
