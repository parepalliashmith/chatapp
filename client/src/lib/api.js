import { API_BASE } from './config.js';

let token = localStorage.getItem('token') || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

export function getToken() {
  return token;
}

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (username, password) => request('/api/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/me'),
  updateMe: (patch) => request('/api/me', { method: 'PUT', body: patch }),
  users: (q = '') => request(`/api/users?q=${encodeURIComponent(q)}`),
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  conversations: () => request('/api/conversations'),
  createConversation: (payload) => request('/api/conversations', { method: 'POST', body: payload }),
  messages: (id) => request(`/api/conversations/${id}/messages`),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/upload', { method: 'POST', body: form, isForm: true });
  },
};
