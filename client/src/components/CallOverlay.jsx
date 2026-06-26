import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';

export default function CallOverlay({ call, localStream, remoteStream, onAccept, onReject, onHangup }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (call.status === 'idle') return null;
  const isVideo = call.callType === 'video';
  const hasLocalVideo = !!localStream && localStream.getVideoTracks().length > 0;

  function toggleMute() {
    const next = !muted;
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  }

  function toggleVideo() {
    const next = !videoOff;
    localStream?.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setVideoOff(next);
  }

  // Incoming call ringing screen
  if (call.status === 'incoming') {
    return (
      <div className="call-overlay">
        <div className="call-card">
          <Avatar name={call.peer.username} src={call.peer.avatar} size={104} />
          <h2>{call.peer.username}</h2>
          <p className="call-sub">Incoming {isVideo ? 'video' : 'voice'} call…</p>
          <div className="call-actions">
            <button className="call-btn reject" onClick={onReject} title="Decline">✕</button>
            <button className="call-btn accept" onClick={onAccept} title="Accept">{isVideo ? '📹' : '📞'}</button>
          </div>
        </div>
      </div>
    );
  }

  // Active / dialing screen
  return (
    <div className="call-overlay">
      <div className={`call-stage ${isVideo ? 'is-video' : 'is-voice'}`}>
        {isVideo ? (
          <>
            <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
            {hasLocalVideo ? (
              <video ref={localVideoRef} className="local-video" autoPlay playsInline muted />
            ) : (
              <div className="local-video no-cam">No camera</div>
            )}
            <div className="call-overlay-top">
              <span className="call-peer-name">{call.peer.username}</span>
              <span className="call-status-text">{call.status === 'calling' ? 'Calling…' : 'Connected'}</span>
            </div>
          </>
        ) : (
          <div className="voice-stage">
            <Avatar name={call.peer.username} src={call.peer.avatar} size={130} />
            <h2>{call.peer.username}</h2>
            <p className="call-sub">{call.status === 'calling' ? 'Calling…' : 'On call'}</p>
            <audio ref={remoteAudioRef} autoPlay />
          </div>
        )}

        <div className="call-actions floating">
          <button className={`call-btn ${muted ? 'active' : ''}`} onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🎙️'}
          </button>
          {isVideo && (
            <button className={`call-btn ${videoOff ? 'active' : ''}`} onClick={toggleVideo} title="Toggle camera">
              {videoOff ? '📷' : '📹'}
            </button>
          )}
          <button className="call-btn reject" onClick={onHangup} title="Hang up">📵</button>
        </div>
      </div>
    </div>
  );
}
