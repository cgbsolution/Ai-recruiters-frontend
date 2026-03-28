"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, CheckCircle } from "lucide-react";

interface Props {
  webcamStream: MediaStream;
  sessionId: number;
  onCaptured: () => void;
}

export default function CapturePhotoStep({ webcamStream, sessionId, onCaptured }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Keep video element always playing — re-attach on mount and whenever stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !webcamStream) return;
    video.srcObject = webcamStream;
    video.play().catch(() => {});
  }, [webcamStream]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror the image (webcam preview is mirrored via CSS)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(dataUrl);
  }, []);

  const retake = useCallback(() => {
    setCapturedImage(null);
  }, []);

  const saveAndContinue = useCallback(async () => {
    if (!capturedImage || !sessionId) return;
    setUploading(true);
    try {
      const res = await fetch(capturedImage);
      const blob = await res.blob();

      const formData = new FormData();
      formData.append("file", blob, "photo.jpg");

      const { apiUpload } = await import("@/lib/api");
      await apiUpload(`/interview/sessions/${sessionId}/capture-photo`, formData);

      onCaptured();
    } catch (err) {
      console.error("Failed to upload photo:", err);
      onCaptured();
    } finally {
      setUploading(false);
    }
  }, [capturedImage, sessionId, onCaptured]);

  return (
    <div className="flex flex-col items-center min-h-screen bg-white px-6">
      {/* Photo preview or live webcam */}
      <div className="flex flex-col items-center w-full max-w-lg flex-1 justify-center space-y-6 py-8">
        {/* Icon + Title */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-3">
            <Camera className="w-10 h-10 text-cyan-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Photo Verification</h1>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            Please capture a clear, well-lit photo of your face. This helps in verifying your identity.
          </p>
        </div>

        {/* Camera preview */}
        <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-gray-200 bg-gray-100 aspect-video">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${capturedImage ? "invisible" : ""}`}
          />
          {!capturedImage && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-32 h-40 rounded-full border-2 border-dashed border-white/50" />
            </div>
          )}
          {capturedImage && (
            <img src={capturedImage} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* Buttons */}
        <div className="flex flex-col gap-3 w-full max-w-sm">
          {!capturedImage ? (
            <Button
              onClick={capture}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 text-base gap-2 rounded-xl"
            >
              <Camera className="w-5 h-5" />
              Capture Photo
            </Button>
          ) : (
            <>
              <Button
                onClick={saveAndContinue}
                disabled={uploading}
                className="w-full bg-green-600 hover:bg-green-500 text-white py-5 text-base gap-2 rounded-xl"
              >
                {uploading ? (
                  <>
                    <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Use This Photo
                  </>
                )}
              </Button>
              <Button
                onClick={retake}
                disabled={uploading}
                variant="ghost"
                className="w-full text-gray-500 hover:text-gray-800 py-4 text-sm gap-2 rounded-xl border border-gray-200"
              >
                <RefreshCw className="w-4 h-4" />
                Re-take Photo
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
