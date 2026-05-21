"use client";

/**
 * Candidate-side WebRTC publisher for the live observer feature.
 *
 * Opens a WebSocket to the backend signalling endpoint and creates a separate
 * RTCPeerConnection for each observer that joins. Webcam + mic tracks are
 * attached as send-only — the peer connection has no transceivers in the
 * receive direction, so observers physically cannot push audio/video back.
 *
 * Failure-soft: every error is caught and the interview continues unaffected.
 * If the backend is unreachable, observers simply don't connect; the candidate
 * never sees an error.
 */

import { useEffect, useRef } from "react";
import { API_BASE } from "@/lib/api";

interface Options {
  sessionId: number | null;
  interviewToken: string | null;
  webcamStream: MediaStream | null;
  micStream: MediaStream | null;
  enabled: boolean;
}

interface PCEntry {
  pc: RTCPeerConnection;
  observerId: string;
}

function buildWsUrl(sessionId: number, interviewToken: string): string {
  const base = (API_BASE || "").replace(/\/$/, "");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/observe/publish/${sessionId}?interview_token=${encodeURIComponent(interviewToken)}`;
}

export function useObserverPublisher({
  sessionId,
  interviewToken,
  webcamStream,
  micStream,
  enabled,
}: Options) {
  const wsRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<Map<string, PCEntry>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const reconnectAttemptRef = useRef(0);
  const closedByUsRef = useRef(false);

  // Refs over latest streams so we can attach them as observers join later in the call.
  const webcamRef = useRef<MediaStream | null>(webcamStream);
  const micRef = useRef<MediaStream | null>(micStream);
  useEffect(() => { webcamRef.current = webcamStream; }, [webcamStream]);
  useEffect(() => { micRef.current = micStream; }, [micStream]);

  useEffect(() => {
    if (!enabled || !sessionId || !interviewToken) return;

    let aborted = false;
    closedByUsRef.current = false;

    const tearDownPeer = (observerId: string) => {
      const entry = peersRef.current.get(observerId);
      if (entry) {
        try { entry.pc.close(); } catch {}
        peersRef.current.delete(observerId);
      }
    };

    const createPeer = async (observerId: string): Promise<void> => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // Replace any existing PC for this observer (could happen on reconnect).
      tearDownPeer(observerId);

      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      } catch (err) {
        console.warn("[observer-publisher] RTCPeerConnection failed", err);
        return;
      }
      peersRef.current.set(observerId, { pc, observerId });

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        const w = wsRef.current;
        if (!w || w.readyState !== WebSocket.OPEN) return;
        try {
          w.send(JSON.stringify({
            type: "ice",
            to_observer: observerId,
            payload: ev.candidate.toJSON(),
          }));
        } catch {}
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          tearDownPeer(observerId);
        }
      };

      // Attach video track (webcam)
      const cam = webcamRef.current;
      let videoTrackCount = 0;
      if (cam) {
        for (const track of cam.getVideoTracks()) {
          try { pc.addTrack(track, cam); videoTrackCount++; } catch (e) { console.warn("[observer-publisher] addTrack(video) failed", e); }
        }
      }
      // Attach audio track (mic). Prefer micStream from Deepgram (already
      // active during interview); fall back to webcam audio if mic stream
      // is not yet ready.
      const mic = micRef.current;
      const audioSource = mic && mic.getAudioTracks().length > 0 ? mic : cam;
      let audioTrackCount = 0;
      if (audioSource) {
        for (const track of audioSource.getAudioTracks()) {
          try { pc.addTrack(track, audioSource); audioTrackCount++; } catch (e) { console.warn("[observer-publisher] addTrack(audio) failed", e); }
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[observer-publisher] peer for ${observerId}: video=${videoTrackCount} audio=${audioTrackCount} cam=${!!cam} mic=${!!mic}`);
      pc.oniceconnectionstatechange = () => {
        // eslint-disable-next-line no-console
        console.log(`[observer-publisher] ${observerId} iceConnectionState:`, pc.iceConnectionState);
      };

      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);
        const w = wsRef.current;
        if (w && w.readyState === WebSocket.OPEN && pc.localDescription) {
          w.send(JSON.stringify({
            type: "offer",
            to_observer: observerId,
            payload: { sdp: pc.localDescription.sdp, type: pc.localDescription.type },
          }));
        }
      } catch (err) {
        console.warn("[observer-publisher] offer failed", err);
        tearDownPeer(observerId);
      }
    };

    const handleAnswer = async (observerId: string, payload: { sdp: string; type: RTCSdpType }) => {
      const entry = peersRef.current.get(observerId);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload));
      } catch (err) {
        console.warn("[observer-publisher] setRemoteDescription failed", err);
      }
    };

    const handleIce = async (observerId: string, payload: RTCIceCandidateInit) => {
      const entry = peersRef.current.get(observerId);
      if (!entry) return;
      try {
        await entry.pc.addIceCandidate(payload);
      } catch (err) {
        // Late-arriving candidate after PC is closed — safe to ignore.
      }
    };

    const connect = () => {
      if (aborted) return;
      const url = buildWsUrl(sessionId, interviewToken);
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        console.warn("[observer-publisher] WebSocket constructor failed", err);
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }
        const t = msg.type;
        if (t === "ready") {
          if (Array.isArray(msg.ice_servers)) {
            iceServersRef.current = msg.ice_servers;
          }
          return;
        }
        if (t === "observer_join" && typeof msg.observer_id === "string") {
          createPeer(msg.observer_id);
          return;
        }
        if (t === "observer_leave" && typeof msg.observer_id === "string") {
          tearDownPeer(msg.observer_id);
          return;
        }
        if (t === "answer" && typeof msg.from_observer === "string" && msg.payload) {
          handleAnswer(msg.from_observer, msg.payload);
          return;
        }
        if (t === "ice" && typeof msg.from_observer === "string" && msg.payload) {
          handleIce(msg.from_observer, msg.payload);
          return;
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Tear down all peers — the new connection will rebuild them as
        // observers re-join.
        for (const id of Array.from(peersRef.current.keys())) tearDownPeer(id);
        if (!closedByUsRef.current) scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will handle reconnection.
      };
    };

    const scheduleReconnect = () => {
      if (aborted || closedByUsRef.current) return;
      const attempt = ++reconnectAttemptRef.current;
      const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
      window.setTimeout(() => {
        if (!aborted) connect();
      }, delay);
    };

    connect();

    return () => {
      aborted = true;
      closedByUsRef.current = true;
      for (const id of Array.from(peersRef.current.keys())) tearDownPeer(id);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
    };
  }, [enabled, sessionId, interviewToken]);
}
