"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInterviewSession, type JobConfig } from "@/hooks/interview/useInterviewSession";
import { useVideoRecording } from "@/hooks/interview/useVideoRecording";

import WelcomeStep from "./steps/WelcomeStep";
import LoginStep from "./steps/LoginStep";
import RegistrationStep from "./steps/RegistrationStep";
import PermissionStep from "./steps/PermissionStep";
import ScreenShareStep from "./steps/ScreenShareStep";
import DeviceTestStep from "./steps/DeviceTestStep";
import InstructionsStep from "./steps/InstructionsStep";
import WarningStep from "./steps/WarningStep";
import InterviewRoom from "./InterviewRoom";
import CompletionScreen from "./CompletionScreen";
import FeedbackForm from "./FeedbackForm";
import MeetingScheduler from "./MeetingScheduler";

type FlowStep =
  | "LOADING"
  | "ERROR"
  | "WELCOME"
  | "LOGIN"
  | "REGISTER"
  | "PERMISSION_CAM_MIC"
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
}

export default function InterviewFlow({ token }: Props) {
  const [step, setStep] = useState<FlowStep>("LOADING");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [jobConfig, setJobConfig] = useState<JobConfig | null>(null);

  const session = useInterviewSession();
  const { startRecording, stopRecording } = useVideoRecording();
  const isCompletingRef = useRef(false);
  const isResumingRef = useRef(false);

  // Load job config on mount
  useEffect(() => {
    session.loadJobConfig(token).then((config) => {
      if (config) {
        setJobConfig(config);
        setStep("WELCOME");
      } else {
        setLoadError("This interview link is invalid or has expired.");
        setStep("ERROR");
      }
    });
  }, [token]);

  const handlePermissionsGranted = useCallback((stream: MediaStream) => {
    setWebcamStream(stream);
    setStep("PERMISSION_SCREEN");
  }, []);

  const handleScreenShare = useCallback((stream?: MediaStream) => {
    if (stream) setScreenStream(stream);
    setStep("DEVICE_TEST");
  }, []);

  const handleLogin = useCallback(
    async (email: string) => {
      const result = await session.loginCandidate(token, email);
      if (result === "ok") {
        setStep("PERMISSION_CAM_MIC");
      } else if (result === "resume") {
        isResumingRef.current = true;
        setStep("PERMISSION_CAM_MIC");
      }
      return result;
    },
    [token, session]
  );

  const handleRegister = useCallback(
    async (
      name: string,
      email: string,
      phone: string,
      resumePath: string,
      extraFields: Record<string, string>
    ) => {
      const result = await session.registerCandidate(
        token, name, email, phone || undefined, resumePath, extraFields
      );
      if (result === true) {
        // Check if this is a returning candidate with a resumable session
        if (session.canResume) {
          isResumingRef.current = true;
        }
        setStep("PERMISSION_CAM_MIC");
      }
      return result;
    },
    [token, session]
  );

  const handleStartInterview = useCallback(async () => {
    // Enter fullscreen for cheating detection
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // non-fatal
    }
    // Start video recording
    if (webcamStream) {
      startRecording(webcamStream);
    }

    // If resuming an in-progress session, load existing messages instead of starting fresh
    if (isResumingRef.current && session.sessionStatus === "in_progress") {
      await session.resumeSession();
      isResumingRef.current = false;
    } else {
      await session.startInterview();
    }
  }, [session, webcamStream, startRecording]);

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

  // Stop all streams, recording, upload, then show completion
  const handleInterviewComplete = useCallback(async () => {
    // Guard: prevent double-call
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    // Stop recording and upload to server
    const recording = await stopRecording();
    if (recording && session.sessionId) {
      await session.uploadRecording(recording.blob, session.sessionId, recording.duration);
    }

    // Stop camera + mic tracks
    if (webcamStream) {
      webcamStream.getTracks().forEach((t) => t.stop());
    }

    // Stop screen share tracks
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }

    // Exit fullscreen
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // ignore
    }

    // Determine termination reason
    const earlyTermination = !session.isInterviewComplete;
    let terminationReason: string | undefined;
    if (earlyTermination) {
      // The user clicked "End Interview" manually
      terminationReason = "ended_by_candidate";
    }

    // Always generate evaluation
    if (!session.evaluation) {
      await session.completeInterview(earlyTermination, terminationReason);
    }
    setStep("COMPLETION");
  }, [session, webcamStream, screenStream, stopRecording]);

  if (step === "LOADING") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (step === "ERROR") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6 text-center">
        <div>
          <div className="text-5xl mb-6">:/</div>
          <h2 className="text-2xl font-bold text-white mb-2">Interview Not Found</h2>
          <p className="text-gray-400">{loadError || "This link is invalid or has expired."}</p>
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
          onNext={() => setStep("REGISTER")}
        />
      );

    case "LOGIN":
      return (
        <LoginStep
          onLogin={handleLogin}
          onSwitchToRegister={() => setStep("REGISTER")}
          onBack={() => setStep("WELCOME")}
        />
      );

    case "REGISTER":
      return (
        <RegistrationStep
          preInterviewFields={jobConfig.pre_interview_fields}
          jobId={jobConfig.job_id}
          onRegister={handleRegister}
          onSwitchToLogin={() => setStep("LOGIN")}
          onBack={() => setStep("WELCOME")}
        />
      );

    case "PERMISSION_CAM_MIC":
      return <PermissionStep onPermissionsGranted={handlePermissionsGranted} />;

    case "PERMISSION_SCREEN":
      return <ScreenShareStep onNext={handleScreenShare} required={true} />;

    case "DEVICE_TEST":
      return webcamStream ? (
        <DeviceTestStep stream={webcamStream} onNext={() => setStep("INSTRUCTIONS")} />
      ) : null;

    case "INSTRUCTIONS":
      return <InstructionsStep jobConfig={jobConfig} onNext={() => setStep("WARNING")} />;

    case "WARNING":
      return <WarningStep onConfirm={handleWarningConfirm} />;

    case "INTERVIEW":
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
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
          <div className="text-6xl mb-6">&#127881;</div>
          <h2 className="text-2xl font-bold text-white mb-3">Interview Completed!</h2>
          <p className="text-gray-400 max-w-sm">
            You have successfully completed your interview. Our team will review your performance
            and be in touch soon.
          </p>
        </div>
      );

    default:
      return null;
  }
}
