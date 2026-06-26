// Small formatting + UI helpers shared across components.

const COLORS = ['#e57373', '#f06292', '#ba68c8', '#9575cd', '#7986cb',
  '#64b5f6', '#4fc3f7', '#4db6ac', '#81c784', '#ffb74d', '#a1887f', '#90a4ae'];

export function colorFor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % COLORS.length;
  return COLORS[h];
}

export function initials(name = '?') {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeOf(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest)) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function lastSeenLabel(p) {
  if (!p) return '';
  if (p.online) return 'online';
  if (!p.lastSeen) return 'offline';
  const d = new Date(p.lastSeen);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `last seen today at ${timeOf(p.lastSeen)}`
    : `last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

export function previewText(msg) {
  if (!msg) return '';
  if (msg.deleted) return '🚫 This message was deleted';
  if (msg.media) return msg.media.kind === 'image' ? '📷 Photo' : `📎 ${msg.media.name || 'File'}`;
  return msg.text || '';
}
