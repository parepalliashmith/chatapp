import { useState } from 'react';
import Avatar from './Avatar.jsx';
import { timeOf } from '../lib/util.js';
import { mediaUrl } from '../lib/config.js';

// Read-receipt ticks: 🕓 sending, ✓✓ delivered, ✓✓ (blue) read by all.
function Ticks({ msg, conversation }) {
  if (msg.pending) return <span className="ticks">🕓</span>;
  const recipients = conversation.members.filter((id) => id !== msg.senderId);
  const readByAll = recipients.length > 0 && recipients.every((id) => msg.readBy.includes(id));
  return <span className={`ticks ${readByAll ? 'read' : ''}`}>✓✓</span>;
}

export default function MessageBubble({ msg, me, conversation, onDelete }) {
  const mine = msg.senderId === me.id;
  const sender = conversation.membersInfo.find((m) => m.id === msg.senderId);
  const showSenderName = !mine && conversation.type === 'group';
  const [menuOpen, setMenuOpen] = useState(false);

  // Deleted "for everyone" placeholder
  if (msg.deleted) {
    return (
      <div className={`msg-row ${mine ? 'mine' : 'theirs'}`}>
        <div className={`bubble ${mine ? 'bubble-mine' : 'bubble-theirs'} deleted`}>
          <span className="bubble-text">🚫 This message was deleted</span>
          <span className="bubble-meta"><span className="bubble-time">{timeOf(msg.createdAt)}</span></span>
        </div>
      </div>
    );
  }

  function handleDelete(forEveryone) {
    setMenuOpen(false);
    onDelete?.(msg.id, forEveryone);
  }

  return (
    <div className={`msg-row ${mine ? 'mine' : 'theirs'}`}>
      {!mine && conversation.type === 'group' && (
        <Avatar name={sender?.username || '?'} src={sender?.avatar} size={28} />
      )}
      <div className={`bubble ${mine ? 'bubble-mine' : 'bubble-theirs'}`}>
        {!msg.pending && (
          <div className="bubble-menu">
            <button className="bubble-menu-btn" onClick={() => setMenuOpen((v) => !v)} title="Options">⌄</button>
            {menuOpen && (
              <div className="bubble-menu-pop" onMouseLeave={() => setMenuOpen(false)}>
                <button onClick={() => handleDelete(false)}>Delete for me</button>
                {mine && <button className="danger" onClick={() => handleDelete(true)}>Delete for everyone</button>}
              </div>
            )}
          </div>
        )}

        {showSenderName && <div className="bubble-sender">{sender?.username || 'Unknown'}</div>}

        {msg.media && msg.media.kind === 'image' && (
          <a href={mediaUrl(msg.media.url)} target="_blank" rel="noreferrer">
            <img className="bubble-img" src={mediaUrl(msg.media.url)} alt={msg.media.name} />
          </a>
        )}
        {msg.media && msg.media.kind === 'file' && (
          <a className="bubble-file" href={mediaUrl(msg.media.url)} target="_blank" rel="noreferrer" download>
            <span className="file-ico">📄</span>
            <span className="file-meta">
              <span className="file-name">{msg.media.name}</span>
              <span className="file-size">{Math.max(1, Math.round((msg.media.size || 0) / 1024))} KB</span>
            </span>
          </a>
        )}

        {msg.text && <span className="bubble-text">{msg.text}</span>}

        <span className="bubble-meta">
          <span className="bubble-time">{timeOf(msg.createdAt)}</span>
          {mine && <Ticks msg={msg} conversation={conversation} />}
        </span>
      </div>
    </div>
  );
}
