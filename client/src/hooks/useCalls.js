import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket.js';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Free public TURN relays — needed when peers are on different networks
    // (e.g. home Wi-Fi <-> mobile data) and a direct connection can't form.
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

// Turn a getUserMedia error into a friendly, actionable message.
function mediaErrorMessage(err, wantVideo) {
  const device = wantVideo ? 'camera and microphone' : 'microphone';
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Permission to use your ${device} was blocked. Click the 🔒/camera icon in your browser's address bar and allow access, then try again.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No ${device} was found on this device.`;
    case 'NotReadableError':
      return `Your ${device} is already in use by another app. Close it and try again.`;
    default:
      return `Could not access your ${device}: ${err?.message || 'unknown error'}`;
  }
}

// Encapsulates 1-to-1 WebRTC calls (voice & video) with Socket.IO signaling.
export function useCalls() {
  const [call, setCall] = useState({ status: 'idle' }); // idle | calling | incoming | connected
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingIce = useRef([]);
  const callRef = useRef(call);
  callRef.current = call;

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    pendingIce.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCall({ status: 'idle' });
  }, []);

  const createPc = useCallback((peerId) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = (e) => {
      if (e.candidate) getSocket()?.emit('call:ice', { to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pcRef.current = pc;
    return pc;
  }, []);

  // Acquire mic/camera and wire the tracks onto the peer connection.
  // - Pops the browser permission prompt.
  // - Falls back to audio-only when no camera exists, so a laptop without a
  //   webcam can still join a video call and SEE/HEAR the other person.
  // - As the caller, adds a recv-only video lane when we have no camera, so the
  //   other side's video can still reach us.
  async function setupLocalMedia(pc, callType, isCaller) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Camera/microphone need a secure connection. Open the app on https:// or http://localhost.'
      );
    }
    const wantVideo = callType === 'video';
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo });
    } catch (err) {
      // Device-missing/busy problems → retry audio-only. Permission denials are real errors.
      const recoverable = ['NotFoundError', 'NotReadableError', 'OverconstrainedError'];
      if (wantVideo && recoverable.includes(err?.name)) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (err2) {
          throw new Error(mediaErrorMessage(err2, false));
        }
      } else {
        throw new Error(mediaErrorMessage(err, wantVideo));
      }
    }

    localStreamRef.current = stream;
    setLocalStream(stream);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    // Video call but no local camera: still negotiate a lane to RECEIVE video.
    if (isCaller && wantVideo && stream.getVideoTracks().length === 0) {
      try { pc.addTransceiver('video', { direction: 'recvonly' }); } catch { /* ignore */ }
    }
    return stream;
  }

  const startCall = useCallback(async (peer, callType, conversationId) => {
    try {
      setCall({ status: 'calling', peer, callType, conversationId });
      const pc = createPc(peer.id);
      await setupLocalMedia(pc, callType, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket()?.emit('call:offer', { to: peer.id, offer, callType, conversationId });
    } catch (e) {
      alert('Could not start call: ' + e.message);
      cleanup();
    }
  }, [createPc, cleanup]);

  const acceptCall = useCallback(async () => {
    const c = callRef.current;
    if (c.status !== 'incoming') return;
    try {
      const pc = createPc(c.peer.id);
      // Apply the caller's offer first so our local tracks attach to the
      // already-negotiated audio/video lanes (this is what makes our video
      // reach the caller even if the caller has no camera).
      await pc.setRemoteDescription(new RTCSessionDescription(c.offer));
      await setupLocalMedia(pc, c.callType, false);
      for (const cand of pendingIce.current) {
        try { await pc.addIceCandidate(cand); } catch { /* ignore */ }
      }
      pendingIce.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket()?.emit('call:answer', { to: c.peer.id, answer });
      setCall({ ...c, status: 'connected' });
    } catch (e) {
      alert('Could not accept call: ' + e.message);
      cleanup();
    }
  }, [createPc, cleanup]);

  const rejectCall = useCallback(() => {
    const c = callRef.current;
    if (c.peer) getSocket()?.emit('call:reject', { to: c.peer.id });
    cleanup();
  }, [cleanup]);

  const hangup = useCallback(() => {
    const c = callRef.current;
    if (c.peer) getSocket()?.emit('call:end', { to: c.peer.id });
    cleanup();
  }, [cleanup]);

  // Signaling listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onIncoming = ({ fromUser, offer, callType, conversationId, from }) => {
      if (callRef.current.status !== 'idle') {
        socket.emit('call:reject', { to: from });
        return;
      }
      setCall({ status: 'incoming', peer: fromUser, callType, conversationId, offer });
    };

    const onAnswered = async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      for (const cand of pendingIce.current) {
        try { await pc.addIceCandidate(cand); } catch { /* ignore */ }
      }
      pendingIce.current = [];
      setCall((c) => ({ ...c, status: 'connected' }));
    };

    const onIce = async ({ candidate }) => {
      const pc = pcRef.current;
      const cand = new RTCIceCandidate(candidate);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(cand); } catch { /* ignore */ }
      } else {
        pendingIce.current.push(cand);
      }
    };

    const onRejected = () => { cleanup(); };
    const onEnded = () => cleanup();

    socket.on('call:incoming', onIncoming);
    socket.on('call:answered', onAnswered);
    socket.on('call:ice', onIce);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('call:ice', onIce);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
    };
  }, [cleanup]);

  return { call, localStream, remoteStream, startCall, acceptCall, rejectCall, hangup };
}
