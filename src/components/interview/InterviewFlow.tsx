"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInterviewSession, type JobConfig } from "@/hooks/interview/useInterviewSession";
import { useVideoRecording } from "@/hooks/interview/useVideoRecording";

import WelcomeStep from "./steps/WelcomeStep";
import EmailVerifyStep from "./steps/EmailVerifyStep";
import ApplyForJobStep from "./steps/ApplyForJobStep";
import PermissionStep from "./steps/PermissionStep";
import ScreenShareStep from "./steps/ScreenShareStep";
import DeviceTestStep from "./steps/DeviceTestStep";
import InstructionsStep from "./steps/InstructionsStep";
import WarningStep from "./steps/WarningStep";
import CapturePhotoStep from "./steps/CapturePhotoStep";
import InterviewRoom from "./InterviewRoom";
import PreInterviewLayout from "./PreInterviewLayout";
import CompletionScreen from "./CompletionScreen";
import FeedbackForm from "./FeedbackForm";
import MeetingScheduler from "./MeetingScheduler";

type FlowStep =
  | "LOADING"
  | "ERROR"
  | "WELCOME"
  | "VERIFY_EMAIL"
  | "APPLY"
  | "PERMISSION_CAM_MIC"
  | "CAPTURE_PHOTO"
  | "PERMISSION_SCREEN"
  | "DEVICE_TEST"
  | "INSTRUCTIONS"
  | "WARNING"
  | "INTERVIEW"
  | "COMPLETION"
  | "FEEDBACK"
  | "SCHEDULE_MEETING"
  | "DONE";

interface Props {
  token: string;
  candidateEmail?: string;
}

export default function InterviewFlow({ token, candidateEmail }: Props) {
  const [step, setStep] = useState<FlowStep>("LOADING");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [jobConfig, setJobConfig] = useState<JobConfig | null>(null);

  // For Apply step
  const [applyEmail, setApplyEmail] = useState("");
  const [applyPrefillName, setApplyPrefillName] = useState<string | undefined>();

  // Scheduling enforcement state
  const [schedulingInfo, setSchedulingInfo] = useState<{
    interviewDate?: string;
    interviewTimezone?: string;
    joiningFlexibility?: string;
    allowJoiningEarly?: boolean;
  } | null>(null);

  const session = useInterviewSession();
  const { startRecording, stopRecording } = useVideoRecording();
  const isCompletingRef = useRef(false);
  const isResumingRef = useRef(false);
  const autoVerifiedRef = useRef(false);
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  // Warn user before closing tab during processing phase
  useEffect(() => {
    if (step !== "COMPLETION" || session.evaluationStatus !== "processing") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Your interview is being processed. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step, session.evaluationStatus]);

  // Re-enter fullscreen when candidate returns to tab during interview
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return;
      if (stepRef.current !== "INTERVIEW") return;
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen().catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  /**
   * Check if the candidate is allowed to join now based on scheduling settings.
   * Returns null if allowed, or an error message if not.
   */
  const checkJoiningAllowed = useCallback((info: typeof schedulingInfo): string | null => {
    if (!info || !info.interviewDate || info.joiningFlexibility === "anytime") {
      return null; // "anytime" or no date set → always allowed
    }
    const scheduled = new Date(info.interviewDate);
    const now = new Date();
    const diffMs = scheduled.getTime() - now.getTime();
    const diffMin = diffMs / (1000 * 60);

    // If scheduled time is in the past → always allow
    if (diffMin <= 0) return null;

    // Allow 10 min early if setting is on
    if (info.allowJoiningEarly && diffMin <= 10) return null;

    // Not yet time
    const hours = Math.floor(diffMin / 60);
    const mins = Math.round(diffMin % 60);
    if (hours > 0) {
      return `Your interview is scheduled for ${scheduled.toLocaleString()}. Please come back in ${hours}h ${mins}m.`;
    }
    return `Your interview is scheduled for ${scheduled.toLocaleString()}. Please come back in ${mins} minutes.`;
  }, []);

  // Load job config on mount
  useEffect(() => {
    session.loadJobConfig(token).then(async (config) => {
      if (config) {
        setJobConfig(config);

        // Block mobile devices if allow_mobile is disabled
        if (!config.allow_mobile) {
          const ua = navigator.userAgent || "";
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
          if (isMobile) {
            setLoadError("Please join using a desktop or laptop. Mobile devices are not supported for this interview.");
            setStep("ERROR");
            return;
          }
        }

        // Auto-verify if candidateEmail is in the URL (?candidate=email)
        if (candidateEmail && !autoVerifiedRef.current) {
          autoVerifiedRef.current = true;
          const result = await session.verifyAccess(token, candidateEmail);
          if (result.access === "granted") {
            // Store scheduling settings for enforcement
            const sInfo = {
              interviewDate: result.interviewDate,
              interviewTimezone: result.interviewTimezone,
              joiningFlexibility: result.joiningFlexibility,
              allowJoiningEarly: result.allowJoiningEarly,
            };
            setSchedulingInfo(sInfo);

            // Check if candidate is allowed to join now
            const blockMsg = checkJoiningAllowed(sInfo);
            if (blockMsg) {
              setLoadError(blockMsg);
              setStep("ERROR");
              return;
            }

            if (result.canResume) {
              isResumingRef.current = true;
            }
            setStep("PERMISSION_CAM_MIC");
            return;
          } else if (result.access === "completed" || result.access === "terminated") {
            setLoadError(result.message);
            setStep("ERROR");
            return;
          }
          // access === "apply" — fall through to welcome
        }

        setStep("WELCOME");
      } else {
        setLoadError("This interview link is invalid or has expired.");
        setStep("ERROR");
      }
    });
  }, [token]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handlePermissionsGranted = useCallback((stream: MediaStream) => {
    setWebcamStream(stream);
    setStep("CAPTURE_PHOTO");
  }, []);

  // When webcam is not required, request mic-only and skip device test
  const handleMicOnlyGranted = useCallback((stream: MediaStream) => {
    // No webcam stream — mic-only
    setStep("PERMISSION_SCREEN");
  }, []);

  const handleScreenShare = useCallback((stream?: MediaStream) => {
    if (stream) setScreenStream(stream);
    setStep("DEVICE_TEST");
  }, []);

  const handleVerifyAccess = useCallback(
    async (email: string) => {
      return session.verifyAccess(token, email);
    },
    [token, session]
  );

  const handleAccessGranted = useCallback((canResume: boolean, scheduling?: {
    interviewDate?: string;
    interviewTimezone?: string;
    joiningFlexibility?: string;
    allowJoiningEarly?: boolean;
  }) => {
    if (scheduling) {
      setSchedulingInfo(scheduling);
      const blockMsg = checkJoiningAllowed(scheduling);
      if (blockMsg) {
        setLoadError(blockMsg);
        setStep("ERROR");
        return;
      }
    }
    if (canResume) {
      isResumingRef.current = true;
    }
    setStep("PERMISSION_CAM_MIC");
  }, [checkJoiningAllowed]);

  const handleShowApply = useCallback((email: string, name?: string) => {
    setApplyEmail(email);
    setApplyPrefillName(name);
    setStep("APPLY");
  }, []);

  const handleApplyForJob = useCallback(
    async (name: string, email: string, phone: string | undefined, resumePath: string) => {
      return session.applyForJob(token, name, email, phone, resumePath);
    },
    [token, session]
  );

  const handleStartInterview = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // non-fatal
    }
    // Start combined recording: screen (background) + webcam (PIP overlay)
    if (webcamStream || screenStream) {
      startRecording(webcamStream, screenStream);
    }
    if (isResumingRef.current && session.sessionStatus === "in_progress") {
      await session.resumeSession();
      isResumingRef.current = false;
    } else {
      await session.startInterview();
    }
  }, [session, webcamStream, screenStream, startRecording]);

  const handleWarningConfirm = useCallback(async () => {
    setStep("INTERVIEW");
    await handleStartInterview();
  }, [handleStartInterview]);

  const handleSendMessage = useCallback(
    async (text: string): Promise<boolean> => session.sendMessage(text),
    [session]
  );

  const handleSkipQuestion = useCallback(
    async (): Promise<boolean> => session.skipQuestion(),
    [session]
  );

  const handleInterviewComplete = useCallback(async () => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    // Stop media streams immediately
    if (webcamStream) {
      webcamStream.getTracks().forEach((t) => t.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }

    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // ignore
    }

    const earlyTermination = !session.isInterviewComplete;
    let terminationReason: string | undefined;
    if (earlyTermination) {
      terminationReason = "ended_by_candidate";
    }

    // Show completion screen immediately — don't wait for recording upload
    setStep("COMPLETION");

    // Upload recording in background (non-blocking)
    stopRecording().then((recording) => {
      if (recording && session.sessionId) {
        session.uploadRecording(recording.blob, session.sessionId, recording.duration).catch(() => {});
      }
    }).catch(() => {});

    // Trigger backend completion & evaluation polling
    if (!session.evaluation) {
      session.completeInterview(earlyTermination, terminationReason);
    }
  }, [session, webcamStream, screenStream, stopRecording]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (step === "LOADING") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (step === "ERROR") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6 text-center bg-white">
        <div>
          <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">:/</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Not Found</h2>
          <p className="text-gray-500 max-w-md">{loadError || "This link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  if (!jobConfig) return null;

  switch (step) {
    case "WELCOME":
      return (
        <WelcomeStep
          jobConfig={jobConfig}
          onNext={() => setStep("VERIFY_EMAIL")}
        />
      );

    case "VERIFY_EMAIL":
      return (
        <EmailVerifyStep
          onVerify={handleVerifyAccess}
          onAccessGranted={handleAccessGranted}
          onShowApply={handleShowApply}
          onBack={() => setStep("WELCOME")}
        />
      );

    case "APPLY":
      return (
        <ApplyForJobStep
          token={token}
          email={applyEmail}
          prefillName={applyPrefillName}
          jobTitle={jobConfig.title}
          onApply={handleApplyForJob}
          onBack={() => setStep("VERIFY_EMAIL")}
        />
      );

    case "PERMISSION_CAM_MIC":
      return (
        <PreInterviewLayout currentStep={1}>
          {jobConfig.webcam_required ? (
            <PermissionStep onPermissionsGranted={handlePermissionsGranted} />
          ) : (
            <PermissionStep micOnly onPermissionsGranted={handleMicOnlyGranted} />
          )}
        </PreInterviewLayout>
      );

    case "CAPTURE_PHOTO":
      if (!webcamStream || !session.sessionId) {
        // No webcam — skip photo capture
        setStep("PERMISSION_SCREEN");
        return null;
      }
      return (
        <PreInterviewLayout currentStep={2}>
          <CapturePhotoStep
            webcamStream={webcamStream}
            sessionId={session.sessionId}
            onCaptured={() => setStep("PERMISSION_SCREEN")}
          />
        </PreInterviewLayout>
      );

    case "PERMISSION_SCREEN":
      return (
        <PreInterviewLayout currentStep={2}>
          <ScreenShareStep onNext={handleScreenShare} required={true} />
        </PreInterviewLayout>
      );

    case "DEVICE_TEST":
      if (!webcamStream) {
        // No webcam — skip device test
        setStep("INSTRUCTIONS");
        return null;
      }
      return (
        <PreInterviewLayout currentStep={3}>
          <DeviceTestStep stream={webcamStream} onNext={() => setStep("INSTRUCTIONS")} />
        </PreInterviewLayout>
      );

    case "INSTRUCTIONS":
      return (
        <PreInterviewLayout currentStep={4}>
          <InstructionsStep jobConfig={jobConfig} onNext={() => setStep("WARNING")} />
        </PreInterviewLayout>
      );

    case "WARNING":
      return (
        <PreInterviewLayout currentStep={4}>
          <WarningStep onConfirm={handleWarningConfirm} />
        </PreInterviewLayout>
      );

    case "INTERVIEW":
      if (jobConfig.manual_interview) {
        return (
          <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
            <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-6">
              <span className="text-3xl">📹</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Manual Interview</h2>
            <p className="text-gray-500 max-w-md mb-6">
              This interview will be conducted by a human recruiter via video call.
              A meeting link has been sent to your email. Please check your inbox and join the meeting at the scheduled time.
            </p>
            <p className="text-gray-400 text-sm">
              If you haven&apos;t received the link, please contact the recruiter directly.
            </p>
          </div>
        );
      }
      return session.sessionId ? (
        <InterviewRoom
          sessionId={session.sessionId}
          jobConfig={jobConfig}
          messages={session.messages}
          questionStates={session.questionStates}
          isThinking={session.isAiThinking}
          isInterviewComplete={session.isInterviewComplete}
          onSendMessage={handleSendMessage}
          onSkipQuestion={handleSkipQuestion}
          onComplete={handleInterviewComplete}
          webcamStream={webcamStream}
          screenStream={screenStream}
        />
      ) : null;

    case "COMPLETION":
      return (
        <CompletionScreen
          evaluation={session.evaluation}
          evaluationStatus={session.evaluationStatus}
          onRetry={session.retryEvaluation}
          onFeedback={() => setStep("FEEDBACK")}
          onSchedule={() => setStep("SCHEDULE_MEETING")}
        />
      );

    case "FEEDBACK":
      return session.sessionId ? (
        <FeedbackForm sessionId={session.sessionId} onDone={() => setStep("DONE")} />
      ) : null;

    case "SCHEDULE_MEETING":
      return (
        <MeetingScheduler
          onLoadSlots={session.loadMeetingSlots}
          onSchedule={session.scheduleMeeting}
          onDone={() => setStep("DONE")}
        />
      );

    case "DONE":
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
          <div className="w-16 h-16 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mb-6">
            <span className="text-3xl">&#127881;</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Interview Completed!</h2>
          <p className="text-gray-500 max-w-sm">
            You have successfully completed your interview. Our team will review your performance
            and be in touch soon.
          </p>
        </div>
      );

    default:
      return null;
  }
}
