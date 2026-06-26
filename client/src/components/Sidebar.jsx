import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import { previewText, timeOf } from '../lib/util.js';

export default function Sidebar({ me, conversations, activeId, presence, onOpen, onNewChat, onProfile, onSearch }) {
  const { logout } = useAuth();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <aside className="sidebar">
      <header className="sidebar-head">
        <button className="me-btn" onClick={onProfile} title="Profile">
          <Avatar name={me.username} src={me.avatar} size={40} />
        </button>
        <div className="sidebar-title">ChatApp</div>
        <div className="head-actions">
          <button className="icon-btn" onClick={onSearch} title="Search messages">🔍</button>
          <button className="icon-btn" onClick={onNewChat} title="New chat">＋</button>
          <div className="menu">
            <button className="icon-btn" onClick={() => setMenuOpen((v) => !v)} title="Menu">⋮</button>
            {menuOpen && (
              <div className="menu-pop" onMouseLeave={() => setMenuOpen(false)}>
                <button onClick={() => { setMenuOpen(false); onProfile(); }}>Profile</button>
                <button onClick={() => { setMenuOpen(false); logout(); }}>Log out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="search-bar">
        <input
          placeholder="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="conv-list">
        {filtered.length === 0 && (
          <div className="empty-hint">
            <p>No chats yet.</p>
            <button className="btn-primary small" onClick={onNewChat}>Start a chat</button>
          </div>
        )}
        {filtered.map((c) => {
          const online = c.type === 'direct' && presence[c.otherUserId]?.online;
          return (
            <button
              key={c.id}
              className={`conv-item ${c.id === activeId ? 'active' : ''}`}
              onClick={() => onOpen(c.id)}
            >
              <Avatar name={c.title} src={c.avatar} group={c.type === 'group'} online={online} />
              <div className="conv-main">
                <div className="conv-row">
                  <span className="conv-title">{c.title}</span>
                  {c.lastMessage && <span className="conv-time">{timeOf(c.lastMessage.createdAt)}</span>}
                </div>
                <div className="conv-row">
                  <span className="conv-preview">
                    {c.lastMessage?.senderId === me.id && 'You: '}
                    {previewText(c.lastMessage) || 'Tap to chat'}
                  </span>
                  {c.unread > 0 && <span className="unread-badge">{c.unread}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
