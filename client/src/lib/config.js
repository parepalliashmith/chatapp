// Where the backend lives.
// - In production the React build is served BY the Node server, so the API and
//   sockets are same-origin — use relative paths / window.location.origin.
// - In dev, Vite runs on :5173 and the API on :4000 of the same host (this also
//   makes phone testing work: http://<pc-ip>:5173 -> :4000).
const isProd = import.meta.env.PROD;
const host = window.location.hostname || 'localhost';

export const API_BASE = isProd ? '' : `http://${host}:4000`;
export const SOCKET_URL = isProd ? window.location.origin : `http://${host}:4000`;

// Turn a stored relative upload path ("/uploads/x.png") into a usable URL.
export function mediaUrl(p) {
  if (!p) return '';
  if (p.startsWith('http')) return p;
  return `${API_BASE}${p}`;
}
