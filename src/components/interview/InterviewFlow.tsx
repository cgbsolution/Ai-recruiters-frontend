"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInterviewSession, type JobConfig } from "@/hooks/interview/useInterviewSession";
import { useVideoRecording } from "@/hooks/interview/useVideoRecording";
import { useOrphanRecordingRecovery } from "@/hooks/interview/useOrphanRecordingRecovery";
import { useLiveRecordingUpload } from "@/hooks/interview/useLiveRecordingUpload";
import {
  updateMeta as updateRecordingMeta,
  deleteRecording as deleteStoredRecording,
  attachSessionToken as attachRecordingSessionToken,
} from "@/lib/recordingStorage";
import { reportClientEvent, BUILD_ID } from "@/lib/clientTelemetry";
import { checkInterviewCapabilities } from "@/lib/browserCapabilities";
import { API_BASE, getSessionToken } from "@/lib/api";
import { isLowSpecDevice } from "@/lib/deviceCapability";

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
  /** Personal invite secret from ?invite= — verifies this candidate on load. */
  inviteToken?: string;
  /** Legacy ?candidate= email — auto-verify / prefill for older links. */
  candidateEmail?: string;
}

export default function InterviewFlow({ token, inviteToken, candidateEmail }: Props) {
  const [step, setStep] = useState<FlowStep>("LOADING");
  const [loadError, setLoadError] = useState<string | null>(null);
  // Set alongside loadError when its text alone can't classify the ERROR
  // screen: a refused invite link, or a verify failure worth retrying.
  const [loadErrorKind, setLoadErrorKind] = useState<"invalid_invite" | "retryable" | null>(null);
  // Shown inline on the verify form (e.g. "use your personal link").
  const [verifyNotice, setVerifyNotice] = useState<string | undefined>();
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

  // recordingId of the active recording, set when recording starts. Drives the
  // live uploader so the video streams to the server during the interview.
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);

  const session = useInterviewSession();
  const { startRecording, stopRecording, isRecording, replaceScreenStream } = useVideoRecording();

  // Stream the recording to the server WHILE the interview runs, so it survives
  // a tab/browser/laptop close. Returns finalize() to stitch parts at the end.
  const { finalize: finalizeRecordingUpload } = useLiveRecordingUpload({
    recordingId: activeRecordingId,
    sessionId: session.sessionId,
    active: isRecording,
  });

  // Re-upload any recordings that survived a previous crashed / closed session.
  // Only while the candidate is still on the light pre-interview screens and
  // has NOT yet acquired camera/screen. Once media is live (or the interview
  // starts), recovery is disabled so re-assembling old recordings can't pile
  // memory on top of the live recording + avatar and crash the tab.
  const recoveryEnabled = !webcamStream && !screenStream && step !== "INTERVIEW";
  useOrphanRecordingRecovery({ enabled: recoveryEnabled });

  // Build stamp + device report, fired ONCE on interview load. Lets you confirm
  // — from the candidate's console or the client_events table — exactly which
  // build ran and what the machine reported, so "I deployed but it still
  // crashes" can be diagnosed instead of guessed.
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    // eslint-disable-next-line no-console
    console.log(
      `%c[interview-build] ${BUILD_ID}`,
      "color:#0a0;font-weight:bold",
      { deviceMemoryGb: nav.deviceMemory ?? "n/a", cores: navigator.hardwareConcurrency ?? "n/a", lowSpec: isLowSpecDevice() },
    );
    reportClientEvent({
      type: "interview_loaded",
      message: BUILD_ID,
      context: {
        deviceMemoryGb: nav.deviceMemory ?? null,
        cores: navigator.hardwareConcurrency ?? null,
        lowSpec: isLowSpecDevice(),
      },
    });
  }, []);

  // As soon as we know BOTH a recordingId (recording started) and a sessionId
  // (backend session created), link them in IndexedDB. This ensures that if
  // the tab / browser / device dies mid-interview, orphan recovery on the
  // next load has enough info to upload the partial recording.
  //
  // IMPORTANT: depend on `activeRecordingId` (set the moment recording starts),
  // NOT on the stable `getRecordingId` callback. The session id is known BEFORE
  // recording starts, so the old effect ran once (recordingId still null → it
  // bailed) and never re-ran when recording actually began — leaving the
  // recording's meta with sessionId=null. That silently disabled orphan
  // recovery, so any tab/laptop close at the very end lost the video with no
  // error. This was the root cause of the "3-4 lost videos" report.
  //
  // The session token is stored with it: upload-recording requires the token,
  // and recovery runs on a later load where sessionStorage no longer has it.
  useEffect(() => {
    if (!activeRecordingId || !session.sessionId) return;
    const st = getSessionToken();
    void updateRecordingMeta(activeRecordingId, {
      sessionId: session.sessionId,
      ...(st ? { sessionToken: st } : {}),
    });
  }, [session.sessionId, activeRecordingId]);

  // Rejoining a session: recordings a crashed tab left for it (possibly stored
  // before tokens were kept) get the token too, so recovery can upload them.
  useEffect(() => {
    if (!session.sessionId) return;
    const st = getSessionToken();
    if (st) void attachRecordingSessionToken(session.sessionId, st);
  }, [session.sessionId]);
  const isCompletingRef = useRef(false);
  const isResumingRef = useRef(false);
  const autoVerifiedRef = useRef(false);
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  // Guard: if we land on CAPTURE_PHOTO without the required data, skip forward.
  // This must be in an effect — never call setState during render.
  useEffect(() => {
    if (step === "CAPTURE_PHOTO" && (!webcamStream || !session.sessionId)) {
      setStep("PERMISSION_SCREEN");
    }
  }, [step, webcamStream, session.sessionId]);

  // Guard: if we land on DEVICE_TEST without a webcam stream, skip forward.
  useEffect(() => {
    if (step === "DEVICE_TEST" && !webcamStream) {
      setStep(jobConfig?.secondary_cam ? "SECONDARY_CAM" : "PRACTICE_ROUND");
    }
  }, [step, webcamStream, jobConfig?.secondary_cam]);

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

  // Tab close / navigation away while a recording exists — including on the
  // COMPLETION screen, where InterviewRoom's /drop beacon no longer fires
  // (it bails once the interview is complete). Tell the server to assemble the
  // live-uploaded recording parts NOW, so the video isn't left unstitched if
  // the candidate closes the tab the instant the interview ends (the exact
  // "lost video" case). The endpoint is idempotent + size-guarded, and the
  // periodic server sweeper remains the ultimate backstop.
  useEffect(() => {
    if (!session.sessionId || !activeRecordingId) return;
    if (step !== "INTERVIEW" && step !== "COMPLETION") return;
    const sid = session.sessionId;
    const finalizeBeacon = () => {
      const st = getSessionToken();
      const url = `${API_BASE}/interview/sessions/${sid}/recording-finalize-beacon${st ? `?st=${encodeURIComponent(st)}` : ""}`;
      try {
        navigator.sendBeacon(url);
      } catch {
        // best-effort only
      }
    };
    window.addEventListener("pagehide", finalizeBeacon);
    return () => window.removeEventListener("pagehide", finalizeBeacon);
  }, [session.sessionId, activeRecordingId, step]);

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
      invite: inviteToken ? "(personal invite link)" : "(none)",
      candidateEmail: candidateEmail || (inviteToken ? "(none)" : "(none — will show verify form)"),
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });

    session.loadJobConfig(token).then(async (result) => {
      if ("config" in result) {
        const config = result.config;
        setJobConfig(config);
        console.log("[Interview] Job config loaded:", { title: config.title, allowMobile: config.allow_mobile, mode: config.mode });

        // Block mobile devices if allow_mobile is disabled
        const ua = navigator.userAgent || "";
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        if (!config.allow_mobile) {
          if (isMobile) {
            console.warn("[Interview] Mobile device blocked — allow_mobile is disabled");
            setLoadError("Please join using a desktop or laptop. Mobile devices are not supported for this interview.");
            setStep("ERROR");
            return;
          }
        }

        // Block browsers that cannot run the interview at all (e.g. Safari has
        // no WebM MediaRecorder, which transcription + recording depend on).
        // Failing here is far kinder than a dead end 10 minutes into the flow.
        const caps = checkInterviewCapabilities({ requireScreenShare: !isMobile });
        if (!caps.supported) {
          console.warn("[Interview] Unsupported browser:", caps.missing);
          setLoadError(
            "Your browser is not supported for this interview. Please use the latest Google Chrome or Microsoft Edge on a desktop or laptop. " +
            `(Missing: ${caps.missing.join(", ")})`
          );
          setStep("ERROR");
          return;
        }

        // Auto-verify from the link: the personal invite (?invite=) or, for
        // older links, the candidate's email (?candidate=email)
        if ((inviteToken || candidateEmail) && !autoVerifiedRef.current) {
          autoVerifiedRef.current = true;
          const accessResult = await session.verifyAccess(
            token,
            inviteToken ? { invite: inviteToken } : { email: candidateEmail },
          );
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
          } else if (accessResult.access === "invalid_invite") {
            // Wrong / rotated / other-job invite. The email form can't help —
            // the candidate needs their current personal link.
            console.warn("[Interview] Invite link refused:", accessResult.message);
            setLoadError(accessResult.message);
            setLoadErrorKind("invalid_invite");
            setStep("ERROR");
            return;
          } else if (accessResult.access === "error" && inviteToken) {
            // Verify request failed (network / timeout / server). A personal-link
            // candidate can't fall back to the email form (it answers
            // "invite_required"), so offer a retry — reload keeps ?invite=.
            console.warn("[Interview] Invite verification failed:", accessResult.message);
            setLoadError(accessResult.message);
            setLoadErrorKind("retryable");
            setStep("ERROR");
            return;
          } else if (accessResult.access === "invite_required") {
            // Legacy ?candidate= link for a candidate who now has a personal link.
            setVerifyNotice(
              accessResult.message || "Please open the personal interview link from your invitation email.",
            );
          }
          // "apply" / "invite_required" / a failed legacy verify — fall through to verify
          console.log("[Interview] Candidate not verified from link — showing verify/apply form");
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

  // When webcam is not required, request mic-only and skip photo capture — the
  // mic still goes through the device test (mic check) after screen share.
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
      return session.verifyAccess(token, { email });
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
    // Start combined recording: screen (background) + webcam (PIP overlay).
    // Capture the recordingId so the live uploader can stream it to the server
    // during the interview.
    if (webcamStream || screenStream) {
      try {
        const rid = startRecording(webcamStream, screenStream, session.sessionId);
        if (rid) setActiveRecordingId(rid);
      } catch (err) {
        // Recording failure is non-fatal — interview proceeds without recording
        console.error("[InterviewFlow] startRecording failed:", err);
      }
    }
    if (isResumingRef.current && session.sessionStatus === "in_progress") {
      await session.resumeSession();
      isResumingRef.current = false;
    } else {
      await session.startInterview(interviewLanguage);
    }
  }, [session, webcamStream, screenStream, startRecording, interviewLanguage]);

  const handleWarningConfirm = useCallback(async () => {
    // Enter the interview room IMMEDIATELY. The opening question requires a
    // 20–40s LLM call (POST /start); previously we awaited that BEFORE
    // transitioning, so a slow — or, on the un-fixed backend, a pool-exhausted
    // and therefore HUNG — /start left the candidate stranded on the
    // Zero-Tolerance screen staring at a dead "Begin Interview" button.
    //
    // The room renders its own "Starting interview…" indicator and, if no
    // opening message arrives within 30s, a Reload/End escape hatch — so the
    // candidate is never trapped. requestFullscreen()/startRecording() inside
    // handleStartInterview still run within this user-gesture tick because
    // setStep() is synchronous and does not suspend before they're called.
    setStep("INTERVIEW");
    try {
      await handleStartInterview();
    } catch (err) {
      console.error("[InterviewFlow] handleStartInterview failed:", err);
      // The room's own stuck-recovery UI handles this — nothing else to do.
    }
  }, [handleStartInterview]);

  const handleScreenStreamChanged = useCallback((stream: MediaStream) => {
    setScreenStream(stream);
    // "Share Screen Again" mid-interview — the recorder must follow the new
    // share, or the rest of the video is the dead one.
    replaceScreenStream(stream);
  }, [replaceScreenStream]);

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

    // ── STEP 1: mark complete + trigger evaluation IMMEDIATELY ───────────────
    // This only needs the transcript (already on the server), so it must NOT be
    // gated behind the slow, failure-prone video upload below. Previously this
    // ran AFTER the awaited upload, so if the upload stalled/failed — or the
    // candidate closed the "Completion" tab while it was still retrying — this
    // call never fired: the session stayed un-completed and the report had to
    // be generated by hand. Firing it first makes the report reliably auto-run,
    // independent of whether the recording uploads.
    if (!session.evaluation) {
      void session.completeInterview(earlyTermination, terminationReason);
    }

    // ── STEP 2: upload the recording INDEPENDENTLY ───────────────────────────
    // If it fails or the tab is closed, the chunks are safe in IndexedDB and
    // orphan-recovery re-uploads on the next app load. Evaluation (step 1) is
    // already underway regardless. Each outcome is beaconed so an operator can
    // see — in the backend — exactly why a recording is or isn't present.
    if (recording && session.sessionId) {
      const sizeMb = +(recording.sizeBytes / (1024 * 1024)).toFixed(1);
      reportClientEvent({
        type: "recording_upload_started",
        message: `session ${session.sessionId} — ${sizeMb} MB`,
        context: { sessionId: session.sessionId, sizeMb, recordingId: recording.recordingId },
      });
      console.log(
        `[InterviewFlow] Finalizing recording — size: ${sizeMb} MB, recordingId=${recording.recordingId}`,
      );
      // PRIMARY: most of the recording was already streamed to the server during
      // the interview (useLiveRecordingUpload). finalize() drains the tail and
      // asks the server to stitch the parts — fast and resilient to tab close.
      let ok = await finalizeRecordingUpload(recording.duration);
      if (ok && recording.recordingId) {
        // Stitched server-side — chunks are safe; free local IndexedDB so
        // orphan-recovery won't redundantly re-upload them.
        await updateRecordingMeta(recording.recordingId, { uploaded: true });
        await deleteStoredRecording(recording.recordingId);
      } else if (!ok) {
        // FALLBACK: live path didn't confirm (errored / no parts). Assemble the
        // blob lazily ONLY now (not eagerly at stop, which spiked memory) and
        // use the single-shot upload, which has its own retries + IDB safety net.
        console.warn("[InterviewFlow] Live finalize unconfirmed — falling back to single-shot upload.");
        const blob = await recording.getBlob();
        if (blob && blob.size > 0) {
          ok = await session.uploadRecording(
            blob,
            session.sessionId,
            recording.duration,
            recording.recordingId,
          );
        } else {
          console.warn(
            "[InterviewFlow] No assembled blob for fallback upload — chunks remain in IndexedDB for orphan recovery.",
          );
        }
      }
      reportClientEvent({
        type: ok ? "recording_upload_succeeded" : "recording_upload_failed",
        message: `session ${session.sessionId} — ${ok ? "confirmed" : "all paths failed, preserved in IndexedDB"}`,
        context: { sessionId: session.sessionId, sizeMb, recordingId: recording.recordingId },
      });
      if (ok) {
        console.log("[InterviewFlow] Recording saved and confirmed");
      } else {
        // Chunks remain in IndexedDB — orphan-recovery will re-attempt on any
        // future app load until the server confirms a save.
        console.warn(
          "[InterviewFlow] Upload could not be confirmed this session. Recording is safe in IndexedDB and will auto-resume next time the candidate opens the app.",
        );
      }
    } else {
      // No blob at all — this is the "video never recorded" case (e.g. recorder
      // never produced data). Beacon it so it's visible server-side, not silent.
      reportClientEvent({
        type: "recording_missing",
        message: `No recording blob to upload for session ${session.sessionId ?? "(none)"}`,
        context: { hasRecording: !!recording, sessionId: session.sessionId },
      });
      console.warn("[InterviewFlow] No recording to upload:", {
        hasRecording: !!recording,
        sessionId: session.sessionId,
      });
    }
  }, [session, webcamStream, screenStream, stopRecording, finalizeRecordingUpload]);

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

  // NOTE: a "Your device may struggle with this interview" interstitial used to
  // sit here, gated on isLowSpecDevice(). Removed — that heuristic calls
  // anything under 12 CPU threads low-spec, which is most business laptops, so
  // nearly every candidate hit a scary warning before they could start. The
  // actual crash protections are unaffected: they run off the same heuristic
  // independently (recording profile in useVideoRecording, 3D-avatar gate in
  // InterviewRoom) and still degrade quietly in the background.

  if (step === "ERROR") {
    const errLower = (loadError || "").toLowerCase();
    const isExpired = errLower.includes("expired");
    const isNetwork = errLower.includes("failed to fetch") || errLower.includes("network error");
    const isTimeout = errLower.includes("timed out");
    const isTerminated = errLower.includes("terminated") || errLower.includes("contact hr");
    const isCompleted = errLower.includes("already completed");
    const isMobileBlocked = errLower.includes("desktop or laptop") && !errLower.includes("browser is not supported");
    const isUnsupportedBrowser = errLower.includes("browser is not supported");
    const isNotFound = errLower.includes("not found") || errLower.includes("no longer active");
    const isScheduled = errLower.includes("scheduled for") || errLower.includes("come back");
    const isInvalidInvite = loadErrorKind === "invalid_invite";
    const canRetry = isNetwork || isTimeout || loadErrorKind === "retryable";

    let icon = ":/";
    let title = "Something Went Wrong";
    let subtitle = loadError || "An unexpected error occurred.";
    let hint: string | null = null;

    if (isInvalidInvite) {
      icon = "🔗";
      title = "Invalid Interview Link";
      subtitle = loadError || "This interview link is not valid.";
      hint = "Please open the most recent interview link from your invitation email. If it still doesn't work, contact your recruiter.";
    } else if (isNetwork) {
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
    } else if (isUnsupportedBrowser) {
      icon = "🌐";
      title = "Browser Not Supported";
      subtitle = loadError || "Your browser cannot run this interview.";
      hint = "Please copy this link into the latest Google Chrome or Microsoft Edge on a desktop or laptop.";
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
    console.error("[Interview] Error screen shown:", { title, error: loadError, isInvalidInvite, isNetwork, isTimeout, isExpired, isCompleted, isTerminated, isNotFound });

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
          initialError={verifyNotice}
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
        return null; // effect will redirect to PERMISSION_SCREEN
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
          <ScreenShareStep onNext={handleScreenShare} required={true} sessionId={session.sessionId} />
        </PreInterviewLayout>
      );

    case "DEVICE_TEST":
      if (!webcamStream) {
        return null; // effect will redirect to SECONDARY_CAM or PRACTICE_ROUND
      }
      return (
        <PreInterviewLayout currentStep={6}>
          <DeviceTestStep
            stream={webcamStream}
            sessionId={session.sessionId}
            language={interviewLanguage}
            managerEmail={jobConfig.manager_email}
            onNext={() => {
              if (jobConfig.secondary_cam) {
                setStep("SECONDARY_CAM");
              } else {
                setStep("PRACTICE_ROUND");
              }
            }}
          />
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
