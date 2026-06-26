import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import { api } from '../lib/api.js';
import { timeOf, previewText } from '../lib/util.js';

// Highlight the query inside a snippet of message text.
function Highlighted({ text, q }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function SearchModal({ onClose, onOpen }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounce = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    debounce.current = setTimeout(() => {
      api.search(query.trim())
        .then(({ results }) => setResults(results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [query]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Search messages</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </header>

        <input
          ref={inputRef}
          className="modal-input"
          placeholder="Search all your chats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="user-list">
          {loading && <div className="empty-hint"><p>Searching…</p></div>}
          {!loading && query.trim() && results.length === 0 && (
            <div className="empty-hint"><p>No messages found for “{query}”.</p></div>
          )}
          {results.map(({ message, conversation }) => (
            <button
              key={message.id}
              className="user-item"
              onClick={() => onOpen(conversation.id)}
            >
              <Avatar name={conversation.title} src={conversation.avatar} group={conversation.type === 'group'} size={40} />
              <div className="user-meta">
                <span className="user-name">
                  {conversation.title}
                  <span className="search-time">{timeOf(message.createdAt)}</span>
                </span>
                <span className="user-about">
                  <Highlighted text={previewText(message)} q={query.trim()} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
