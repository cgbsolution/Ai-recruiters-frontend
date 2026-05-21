"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInterviewSession, type JobConfig } from "@/hooks/interview/useInterviewSession";
import { useVideoRecording } from "@/hooks/interview/useVideoRecording";
import { useOrphanRecordingRecovery } from "@/hooks/interview/useOrphanRecordingRecovery";
import { updateMeta as updateRecordingMeta } from "@/lib/recordingStorage";

import WelcomeStep from "./steps/WelcomeStep";
import EmailVerifyStep from "./steps/EmailVerifyStep";
import ApplyForJobStep from "./steps/ApplyForJobStep";
import LanguageStep from "./steps/LanguageStep";
import WhatToExpectStep from "./steps/WhatToExpectStep";
import PracticeRoundStep from "./steps/PracticeRoundStep";
import PermissionStep from "./steps/PermissionStep";
import ScreenShareStep from "./steps/ScreenShareStep";
import DeviceTestStep from "./steps/DeviceTestStep";
import InstructionsStep from "./steps/InstructionsStep";
import WarningStep from "./steps/WarningStep";
import CapturePhotoStep from "./steps/CapturePhotoStep";
import InterviewRoom from "./InterviewRoom";
import SecondaryCamStep from "./steps/SecondaryCamStep";

import PreInterviewLayout from "./PreInterviewLayout";
import CompletionScreen from "./CompletionScreen";
import FeedbackForm from "./FeedbackForm";
import MeetingScheduler from "./MeetingScheduler";

type FlowStep =
  | "LOADING"
  | "ERROR"
  | "WELCOME"
  | "LANGUAGE"
  | "WHAT_TO_EXPECT"
  | "VERIFY_EMAIL"
  | "APPLY"
  | "PERMISSION_CAM_MIC"
  | "CAPTURE_PHOTO"
  | "PERMISSION_SCREEN"
  | "DEVICE_TEST"
  | "SECONDARY_CAM"
  | "PRACTICE_ROUND"
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

  // Candidate name (from verify response)
  const [candidateName, setCandidateName] = useState<string | undefined>();
  // Interview language
  const [interviewLanguage, setInterviewLanguage] = useState("en");

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
  const { startRecording, stopRecording, getRecordingId } = useVideoRecording();
  // Re-upload any recordings that survived a previous crashed / closed session.
  useOrphanRecordingRecovery();

  // As soon as we know BOTH a recordingId (recording started) and a sessionId
  // (backend session created), link them in IndexedDB. This ensures that if
  // the tab / browser / device dies mid-interview, orphan recovery on the
  // next load has enough info to upload the partial recording.
  useEffect(() => {
    const rid = getRecordingId();
    if (!rid || !session.sessionId) return;
    void updateRecordingMeta(rid, { sessionId: session.sessionId });
  }, [session.sessionId, getRecordingId]);
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
    console.log("[Interview] Initializing interview flow", {
      token: token.slice(0, 8) + "...",
      candidateEmail: candidateEmail || "(none — will show verify form)",
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });

    session.loadJobConfig(token).then(async (result) => {
      if ("config" in result) {
        const config = result.config;
        setJobConfig(config);
        console.log("[Interview] Job config loaded:", { title: config.title, allowMobile: config.allow_mobile, mode: config.mode });

        // Block mobile devices if allow_mobile is disabled
        if (!config.allow_mobile) {
          const ua = navigator.userAgent || "";
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
          if (isMobile) {
            console.warn("[Interview] Mobile device blocked — allow_mobile is disabled");
            setLoadError("Please join using a desktop or laptop. Mobile devices are not supported for this interview.");
            setStep("ERROR");
            return;
          }
        }

        // Auto-verify if candidateEmail is in the URL (?candidate=email)
        if (candidateEmail && !autoVerifiedRef.current) {
          autoVerifiedRef.current = true;
          const accessResult = await session.verifyAccess(token, candidateEmail);
          console.log("[Interview] Auto-verify result:", accessResult.access, accessResult.message);

          if (accessResult.access === "granted") {
            const sInfo = {
              interviewDate: accessResult.interviewDate,
              interviewTimezone: accessResult.interviewTimezone,
              joiningFlexibility: accessResult.joiningFlexibility,
              allowJoiningEarly: accessResult.allowJoiningEarly,
            };
            setSchedulingInfo(sInfo);

            const blockMsg = checkJoiningAllowed(sInfo);
            if (blockMsg) {
              console.warn("[Interview] Candidate blocked by schedule:", blockMsg);
              setLoadError(blockMsg);
              setStep("ERROR");
              return;
            }

            if (accessResult.candidateName) {
              setCandidateName(accessResult.candidateName);
            }
            if (accessResult.canResume) {
              isResumingRef.current = true;
            }
            setStep("WELCOME");
            return;
          } else if (accessResult.access === "completed" || accessResult.access === "terminated") {
            console.warn("[Interview] Access denied:", accessResult.access, accessResult.message);
            setLoadError(accessResult.message);
            setStep("ERROR");
            return;
          }
          // access === "apply" — fall through to verify
          console.log("[Interview] Candidate not invited — showing verify/apply form");
        }

        setStep("VERIFY_EMAIL");
      } else {
        console.error("[Interview] Failed to load job config:", result.error);
        setLoadError(result.error);
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
  // Store the mic stream so recording can use its audio tracks
  const handleMicOnlyGranted = useCallback((stream: MediaStream) => {
    setWebcamStream(stream); // contains mic audio tracks even without video
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
  }, name?: string) => {
    if (name) setCandidateName(name);
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
    setStep("WELCOME");
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
      await session.startInterview(interviewLanguage);
    }
  }, [session, webcamStream, screenStream, startRecording, interviewLanguage]);

  const handleWarningConfirm = useCallback(async () => {
    setStep("INTERVIEW");
    await handleStartInterview();
  }, [handleStartInterview]);

  const handleScreenStreamChanged = useCallback((stream: MediaStream) => {
    setScreenStream(stream);
  }, []);

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

    // Stop recording FIRST (before killing streams) so the blob is complete
    const recording = await stopRecording();

    // Now stop media streams
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

    // Show completion screen immediately
    setStep("COMPLETION");

    // Upload recording FIRST (with retry), then trigger evaluation.
    // The uploadRecording function handles its own beforeunload protection
    // so users are warned if they try to close during upload.
    if (recording && session.sessionId) {
      console.log(
        `[InterviewFlow] Starting recording upload — blob size: ${(recording.blob.size / (1024 * 1024)).toFixed(1)} MB, recordingId=${recording.recordingId}`,
      );
      const ok = await session.uploadRecording(
        recording.blob,
        session.sessionId,
        recording.duration,
        recording.recordingId,
      );
      if (ok) {
        console.log("[InterviewFlow] Recording upload completed and confirmed");
      } else {
        // Chunks remain in IndexedDB — orphan-recovery will re-attempt on any
        // future app load until the server confirms a save.
        console.warn(
          "[InterviewFlow] Upload could not be confirmed this session. Recording is safe in IndexedDB and will auto-resume next time the candidate opens the app.",
        );
      }
    } else {
      console.warn("[InterviewFlow] No recording to upload:", {
        hasRecording: !!recording,
        sessionId: session.sessionId,
      });
    }

    // Trigger backend completion & evaluation polling AFTER recording is saved
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
    const errLower = (loadError || "").toLowerCase();
    const isExpired = errLower.includes("expired");
    const isNetwork = errLower.includes("failed to fetch") || errLower.includes("network error");
    const isTimeout = errLower.includes("timed out");
    const isTerminated = errLower.includes("terminated") || errLower.includes("contact hr");
    const isCompleted = errLower.includes("already completed");
    const isMobileBlocked = errLower.includes("desktop or laptop");
    const isNotFound = errLower.includes("not found") || errLower.includes("no longer active");
    const isScheduled = errLower.includes("scheduled for") || errLower.includes("come back");
    const canRetry = isNetwork || isTimeout;

    let icon = ":/";
    let title = "Something Went Wrong";
    let subtitle = loadError || "An unexpected error occurred.";
    let hint: string | null = null;

    if (isNetwork) {
      icon = "📡";
      title = "Connection Error";
      subtitle = "Unable to connect to the interview server.";
      hint = "Please check your internet connection, disable any VPN or ad-blocker, and try again. If the issue persists, try a different network (e.g. mobile hotspot).";
    } else if (isTimeout) {
      icon = "⏱";
      title = "Connection Slow";
      subtitle = "The server took too long to respond. This usually happens on slow or unstable networks.";
      hint = "Please try again. If the problem continues, switch to a stronger Wi-Fi or mobile data connection.";
    } else if (isExpired) {
      icon = "⏰";
      title = "Interview Link Expired";
      subtitle = loadError || "This interview link is no longer valid.";
      hint = "Please contact your recruiter to get a new interview link.";
    } else if (isCompleted) {
      icon = "✅";
      title = "Interview Already Completed";
      subtitle = loadError || "You have already completed your interview for this position.";
      hint = "If you believe this is an error, please contact your recruiter.";
    } else if (isTerminated) {
      icon = "🚫";
      title = "Interview Session Ended";
      subtitle = loadError || "Your interview session was ended.";
      hint = "Please contact your recruiter for next steps.";
    } else if (isMobileBlocked) {
      icon = "💻";
      title = "Desktop Required";
      subtitle = loadError || "This interview requires a desktop or laptop computer.";
      hint = "Please open this link on a computer with a webcam and microphone.";
    } else if (isNotFound) {
      icon = "🔍";
      title = "Interview Not Found";
      subtitle = loadError || "This interview link is invalid or no longer active.";
      hint = "Please check the link or contact your recruiter.";
    } else if (isScheduled) {
      icon = "📅";
      title = "Interview Not Yet Available";
      subtitle = loadError || "Your interview is scheduled for a later time.";
    }

    // Log full error details to console for debugging
    console.error("[Interview] Error screen shown:", { title, error: loadError, isNetwork, isTimeout, isExpired, isCompleted, isTerminated, isNotFound });

    return (
      <div className="flex items-center justify-center min-h-screen px-6 text-center bg-white">
        <div className="max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">{icon}</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-500">{subtitle}</p>
          {hint && (
            <p className="text-gray-400 text-sm mt-3">{hint}</p>
          )}
          {canRetry && (
            <button
              onClick={() => window.location.reload()}
              className="mt-5 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!jobConfig) return null;

  switch (step) {
    case "VERIFY_EMAIL":
      return (
        <EmailVerifyStep
          // Prefill from the ?candidate= URL param so a candidate following
          // the link emailed by the recruiter doesn't have to retype their
          // address (and so that submit just works once they hit it).
          initialEmail={candidateEmail}
          onVerify={handleVerifyAccess}
          onAccessGranted={handleAccessGranted}
          onShowApply={handleShowApply}
        />
      );

    case "WELCOME":
      return (
        <PreInterviewLayout currentStep={1}>
          <WelcomeStep
            jobConfig={jobConfig}
            candidateName={candidateName}
            onNext={() => setStep("LANGUAGE")}
          />
        </PreInterviewLayout>
      );

    case "LANGUAGE":
      return (
        <PreInterviewLayout currentStep={2}>
          <LanguageStep
            onConfirm={(lang) => {
              setInterviewLanguage(lang);
              setStep("WHAT_TO_EXPECT");
            }}
          />
        </PreInterviewLayout>
      );

    case "WHAT_TO_EXPECT":
      return (
        <PreInterviewLayout currentStep={3}>
          <WhatToExpectStep
            jobConfig={jobConfig}
            onNext={() => setStep("PERMISSION_CAM_MIC")}
          />
        </PreInterviewLayout>
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
        <PreInterviewLayout currentStep={4}>
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
        <PreInterviewLayout currentStep={5}>
          <CapturePhotoStep
            webcamStream={webcamStream}
            sessionId={session.sessionId}
            onCaptured={() => setStep("PERMISSION_SCREEN")}
          />
        </PreInterviewLayout>
      );

    case "PERMISSION_SCREEN":
      return (
        <PreInterviewLayout currentStep={5}>
          <ScreenShareStep onNext={handleScreenShare} required={true} />
        </PreInterviewLayout>
      );

    case "DEVICE_TEST":
      if (!webcamStream) {
        // No webcam — skip device test
        if (jobConfig.secondary_cam) {
          setStep("SECONDARY_CAM");
        } else {
          setStep("PRACTICE_ROUND");
        }
        return null;
      }
      return (
        <PreInterviewLayout currentStep={6}>
          <DeviceTestStep stream={webcamStream} onNext={() => {
            if (jobConfig.secondary_cam) {
              setStep("SECONDARY_CAM");
            } else {
              setStep("PRACTICE_ROUND");
            }
          }} />
        </PreInterviewLayout>
      );

    case "SECONDARY_CAM":
      return (
        <PreInterviewLayout currentStep={6}>
          <SecondaryCamStep
            sessionId={session.sessionId!}
            onVerified={() => setStep("PRACTICE_ROUND")}
          />
        </PreInterviewLayout>
      );

    case "PRACTICE_ROUND":
      return (
        <PreInterviewLayout currentStep={7}>
          <PracticeRoundStep
            onStart={() => setStep("INSTRUCTIONS")}
            onSkip={() => setStep("INSTRUCTIONS")}
          />
        </PreInterviewLayout>
      );

    case "INSTRUCTIONS":
      return (
        <PreInterviewLayout currentStep={8}>
          <InstructionsStep jobConfig={jobConfig} onNext={() => setStep("WARNING")} />
        </PreInterviewLayout>
      );

    case "WARNING":
      return (
        <PreInterviewLayout currentStep={8}>
          <WarningStep onConfirm={handleWarningConfirm} />
        </PreInterviewLayout>
      );

    case "INTERVIEW":
      // manual_interview no longer shortcuts to a "human recruiter will call
      // you" screen — it runs the same AI interview flow as the avatar path,
      // but InterviewRoom renders a VoiceVisualizer in place of the 3D avatar.
      return session.sessionId ? (
        <InterviewRoom
          sessionId={session.sessionId}
          interviewToken={token}
          jobConfig={jobConfig}
          messages={session.messages}
          questionStates={session.questionStates}
          isThinking={session.isAiThinking}
          isInterviewComplete={session.isInterviewComplete}
          onSendMessage={handleSendMessage}
          onSkipQuestion={handleSkipQuestion}
          onComplete={handleInterviewComplete}
          onScreenStreamChanged={handleScreenStreamChanged}
          webcamStream={webcamStream}
          screenStream={screenStream}
          interviewLanguage={interviewLanguage}
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
