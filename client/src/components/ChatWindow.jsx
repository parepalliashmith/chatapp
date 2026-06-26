import { useEffect, useRef, useState, useMemo } from 'react';
import Avatar from './Avatar.jsx';
import MessageBubble from './MessageBubble.jsx';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { dayLabel, lastSeenLabel } from '../lib/util.js';

export default function ChatWindow({ me, conversation, messages, typingUsers, presence, onBack, onSend, onDelete, onStartCall }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(false);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, conversation?.id, typingUsers]);

  // Reset composer when switching chats.
  useEffect(() => { setText(''); }, [conversation?.id]);

  const otherPresence = conversation?.type === 'direct' ? presence[conversation.otherUserId] : null;

  const typingNames = useMemo(() => {
    if (!conversation || !typingUsers || typingUsers.size === 0) return [];
    const map = new Map(conversation.membersInfo.map((m) => [m.id, m.username]));
    return [...typingUsers].map((id) => map.get(id)).filter(Boolean);
  }, [typingUsers, conversation]);

  function emitTyping(isTyping) {
    const socket = getSocket();
    if (!socket || !conversation) return;
    if (lastTypingSent.current === isTyping) return;
    lastTypingSent.current = isTyping;
    socket.emit('typing', { conversationId: conversation.id, isTyping });
  }

  function onChangeText(e) {
    setText(e.target.value);
    emitTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 1500);
  }

  function submit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(conversation.id, { text: trimmed });
    setText('');
    emitTyping(false);
    clearTimeout(typingTimer.current);
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !conversation) return;
    setUploading(true);
    try {
      const up = await api.upload(file);
      const kind = up.mime?.startsWith('image/') ? 'image' : 'file';
      onSend(conversation.id, { media: { ...up, kind } });
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!conversation) {
    return (
      <section className="chat-window empty">
        <div className="chat-empty">
          <div className="chat-empty-logo">💬</div>
          <h2>ChatApp for Web</h2>
          <p>Select a chat to start messaging, or tap ＋ to begin a new conversation.</p>
        </div>
      </section>
    );
  }

  const subtitle =
    conversation.type === 'group'
      ? conversation.membersInfo.map((m) => (m.id === me.id ? 'You' : m.username)).join(', ')
      : lastSeenLabel(otherPresence);

  // Group messages with date dividers.
  let lastDay = null;

  return (
    <section className="chat-window">
      <header className="chat-head">
        <button className="icon-btn back-btn" onClick={onBack} title="Back">←</button>
        <Avatar
          name={conversation.title}
          src={conversation.avatar}
          group={conversation.type === 'group'}
          online={otherPresence?.online}
          size={40}
        />
        <div className="chat-head-info">
          <div className="chat-head-title">{conversation.title}</div>
          <div className="chat-head-sub">
            {typingNames.length > 0
              ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`
              : subtitle}
          </div>
        </div>
        {conversation.type === 'direct' && (
          <div className="head-actions">
            <button className="icon-btn" title="Voice call" onClick={() => onStartCall(conversation, 'voice')}>📞</button>
            <button className="icon-btn" title="Video call" onClick={() => onStartCall(conversation, 'video')}>📹</button>
          </div>
        )}
      </header>

      <div className="messages" ref={scrollRef}>
        {messages.map((m) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <div className="day-divider"><span>{day}</span></div>}
              <MessageBubble
                msg={m}
                me={me}
                conversation={conversation}
                onDelete={onDelete}
              />
            </div>
          );
        })}
        {typingNames.length > 0 && (
          <div className="typing-bubble"><span></span><span></span><span></span></div>
        )}
      </div>

      <form className="composer" onSubmit={submit}>
        <button
          type="button"
          className="icon-btn"
          onClick={() => fileRef.current?.click()}
          title="Attach"
          disabled={uploading}
        >
          {uploading ? '…' : '📎'}
        </button>
        <input ref={fileRef} type="file" hidden onChange={onPickFile} accept="image/*,application/pdf,.doc,.docx,.txt,.zip" />
        <input
          className="composer-input"
          placeholder="Type a message"
          value={text}
          onChange={onChangeText}
          onBlur={() => emitTyping(false)}
        />
        <button type="submit" className="send-btn" title="Send" disabled={!text.trim()}>➤</button>
      </form>
    </section>
  );
}
