import { useState } from 'react';
import Avatar from './Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';

export default function ProfileModal({ onClose }) {
  const { user, setUser, logout } = useAuth();
  const [about, setAbout] = useState(user.about || '');
  const [busy, setBusy] = useState(false);

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

        <button className="btn-primary" onClick={saveAbout} disabled={busy}>Save</button>
        <button className="btn-ghost" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}
