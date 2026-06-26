import { useEffect, useState } from 'react';
import Avatar from './Avatar.jsx';
import { api } from '../lib/api.js';

export default function NewChatModal({ me, onClose, onCreated }) {
  const [tab, setTab] = useState('direct'); // 'direct' | 'group'
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]); // user ids (group)
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.users().then(({ users }) => setUsers(users)).catch(() => {});
  }, []);

  const filtered = users.filter((u) => u.username.includes(query.trim().toLowerCase()));

  async function startDirect(userId) {
    setBusy(true);
    setError('');
    try {
      const { conversation } = await api.createConversation({ type: 'direct', memberIds: [userId] });
      onCreated(conversation);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  function toggle(userId) {
    setSelected((prev) => (prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]));
  }

  async function createGroup() {
    if (!groupName.trim() || selected.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const { conversation } = await api.createConversation({
        type: 'group',
        name: groupName.trim(),
        memberIds: selected,
      });
      onCreated(conversation);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>New chat</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </header>

        <div className="auth-tabs in-modal">
          <button className={tab === 'direct' ? 'active' : ''} onClick={() => setTab('direct')}>Direct</button>
          <button className={tab === 'group' ? 'active' : ''} onClick={() => setTab('group')}>Group</button>
        </div>

        {tab === 'group' && (
          <input
            className="modal-input"
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}

        <input
          className="modal-input"
          placeholder="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="none"
        />

        {error && <div className="auth-error">{error}</div>}

        <div className="user-list">
          {filtered.length === 0 && <div className="empty-hint"><p>No other users yet. Register a second account to chat.</p></div>}
          {filtered.map((u) => (
            <button
              key={u.id}
              className="user-item"
              onClick={() => (tab === 'direct' ? startDirect(u.id) : toggle(u.id))}
              disabled={busy}
            >
              <Avatar name={u.username} src={u.avatar} size={40} online={u.online} />
              <div className="user-meta">
                <span className="user-name">{u.username}</span>
                <span className="user-about">{u.about}</span>
              </div>
              {tab === 'group' && (
                <span className={`check ${selected.includes(u.id) ? 'on' : ''}`}>
                  {selected.includes(u.id) ? '✓' : ''}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'group' && (
          <button
            className="btn-primary"
            disabled={busy || !groupName.trim() || selected.length === 0}
            onClick={createGroup}
          >
            Create group{selected.length ? ` (${selected.length})` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
