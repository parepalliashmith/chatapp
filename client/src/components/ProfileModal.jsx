import { useState, useRef, useEffect } from 'react';
import Avatar from './Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';

// Friendly message for a getUserMedia failure.
function friendlyMediaError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "Access was blocked. Click the camera icon in your browser's address bar, allow it, then try again.";
    case 'NotFoundError':
      return 'No integrated camera or microphone was found on this device.';
    case 'NotReadableError':
      return 'Your camera is already in use by another app. Close it and try again.';
    default:
      return err?.message || 'Could not access the camera.';
  }
}

export default function ProfileModal({ onClose }) {
  const { user, setUser, logout } = useAuth();
  const [about, setAbout] = useState(user.about || '');
  const [busy, setBusy] = useState(false);

  // Camera & microphone permission test
  const [camStream, setCamStream] = useState(null);
  const [camError, setCamError] = useState('');
  const [camStatus, setCamStatus] = useState('idle'); // idle | requesting | granted
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && camStream) videoRef.current.srcObject = camStream;
  }, [camStream]);

  // Always stop the camera when the modal unmounts (light turns off).
  useEffect(() => () => { camStream?.getTracks().forEach((t) => t.stop()); }, [camStream]);

  async function enableCamera() {
    setCamError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCamError('Camera needs a secure connection — open the app on https:// or http://localhost.');
      return;
    }
    setCamStatus('requesting');
    try {
      // This line pops the browser's permission prompt for your integrated camera + mic.
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setCamStream(stream);
      setCamStatus('granted');
    } catch (err) {
      setCamError(friendlyMediaError(err));
      setCamStatus('idle');
    }
  }

  function stopCamera() {
    camStream?.getTracks().forEach((t) => t.stop());
    setCamStream(null);
    setCamStatus('idle');
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const up = await api.upload(file);
      const { user: updated } = await api.updateMe({ avatar: up.url });
      setUser(updated);
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAbout() {
    setBusy(true);
    try {
      const { user: updated } = await api.updateMe({ about });
      setUser(updated);
      onClose();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Profile</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </header>

        <div className="profile-avatar">
          <label className="avatar-edit">
            <Avatar name={user.username} src={user.avatar} size={96} />
            <input type="file" hidden accept="image/*" onChange={uploadAvatar} disabled={busy} />
            <span className="avatar-edit-hint">Change</span>
          </label>
          <div className="profile-name">{user.username}</div>
        </div>

        <label className="field-label">About</label>
        <textarea
          className="modal-input"
          rows={3}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={200}
        />

        {/* --- Camera & microphone permission --- */}
        <label className="field-label">Camera &amp; microphone</label>
        <div className="cam-test">
          {camStatus === 'granted' ? (
            <>
              <video ref={videoRef} className="cam-preview" autoPlay playsInline muted />
              <div className="cam-row">
                <span className="cam-ok">✅ Access granted — your integrated camera works.</span>
                <button className="btn-ghost slim" onClick={stopCamera}>Turn off</button>
              </div>
            </>
          ) : (
            <>
              <p className="cam-hint">Allow ChatApp to use your integrated camera and microphone for video &amp; voice calls.</p>
              <button className="btn-primary" onClick={enableCamera} disabled={camStatus === 'requesting'}>
                {camStatus === 'requesting' ? 'Requesting…' : '🎥 Enable camera & microphone'}
              </button>
            </>
          )}
          {camError && <div className="auth-error">{camError}</div>}
        </div>

        <button className="btn-primary" onClick={saveAbout} disabled={busy}>Save</button>
        <button className="btn-ghost" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}
