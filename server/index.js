import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { nanoid } from 'nanoid';

import db, { save, initDb, storageMode } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e7 });

app.use(cors());
app.use(express.json({ limit: '12mb' }));

// Allow this app to use the camera & microphone (for WebRTC calls).
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self)');
  next();
});

// ---------- uploads ----------
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ---------- helpers ----------
function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = db.users.find((u) => u.id === payload.id);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function convForUser(conv, userId) {
  // Attach last message + the "other" participant for direct chats.
  // Skip messages this user has deleted "for me".
  const msgs = db.messages.filter(
    (m) => m.conversationId === conv.id && !(m.deletedFor || []).includes(userId)
  );
  const last = msgs[msgs.length - 1] || null;
  const unread = msgs.filter((m) => m.senderId !== userId && !m.readBy.includes(userId)).length;
  let title = conv.name;
  let avatar = conv.avatar;
  let otherUserId = null;
  if (conv.type === 'direct') {
    otherUserId = conv.members.find((id) => id !== userId);
    const other = db.users.find((u) => u.id === otherUserId);
    title = other ? other.username : 'Unknown';
    avatar = other ? other.avatar : null;
  }
  return {
    ...conv,
    title,
    avatar,
    otherUserId,
    lastMessage: last,
    unread,
    membersInfo: conv.members.map((id) => publicUser(db.users.find((u) => u.id === id))).filter(Boolean),
  };
}

// =================================================================
// REST API
// =================================================================

app.post('/api/auth/register', async (req, res) => {
  const { username, password, about } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const clean = String(username).trim().toLowerCase();
  if (clean.length < 3) return res.status(400).json({ error: 'username too short' });
  if (db.users.some((u) => u.username === clean)) return res.status(409).json({ error: 'username taken' });
  const user = {
    id: nanoid(12),
    username: clean,
    password: bcrypt.hashSync(password, 8),
    avatar: null,
    about: about || 'Hey there! I am using ChatApp.',
    online: false,
    lastSeen: Date.now(),
    createdAt: Date.now(),
  };
  db.users.push(user);
  save();
  res.json({ token: sign(user), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const clean = String(username || '').trim().toLowerCase();
  const user = db.users.find((u) => u.username === clean);
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.put('/api/me', authMiddleware, (req, res) => {
  const { about, avatar } = req.body || {};
  if (typeof about === 'string') req.user.about = about.slice(0, 200);
  if (typeof avatar === 'string') req.user.avatar = avatar;
  save();
  io.emit('user:updated', publicUser(req.user));
  res.json({ user: publicUser(req.user) });
});

// List/search all other users
app.get('/api/users', authMiddleware, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const list = db.users
    .filter((u) => u.id !== req.user.id)
    .filter((u) => (q ? u.username.includes(q) : true))
    .map(publicUser);
  res.json({ users: list });
});

// All conversations the current user belongs to
app.get('/api/conversations', authMiddleware, (req, res) => {
  const list = db.conversations
    .filter((c) => c.members.includes(req.user.id))
    .map((c) => convForUser(c, req.user.id))
    .sort((a, b) => (b.lastMessage?.createdAt || b.createdAt) - (a.lastMessage?.createdAt || a.createdAt));
  res.json({ conversations: list });
});

// Create a direct or group conversation
app.post('/api/conversations', authMiddleware, (req, res) => {
  const { type = 'direct', memberIds = [], name = null, avatar = null } = req.body || {};
  const members = Array.from(new Set([req.user.id, ...memberIds]));

  if (type === 'direct') {
    if (members.length !== 2) return res.status(400).json({ error: 'direct chat needs exactly one other user' });
    const existing = db.conversations.find(
      (c) => c.type === 'direct' && c.members.length === 2 && members.every((m) => c.members.includes(m))
    );
    if (existing) return res.json({ conversation: convForUser(existing, req.user.id) });
  } else {
    if (!name) return res.status(400).json({ error: 'group needs a name' });
    if (members.length < 2) return res.status(400).json({ error: 'group needs at least one other member' });
  }

  const conv = {
    id: nanoid(12),
    type,
    name,
    avatar,
    members,
    admins: type === 'group' ? [req.user.id] : [],
    createdAt: Date.now(),
  };
  db.conversations.push(conv);
  save();

  const dto = convForUser(conv, req.user.id);
  // Notify every member so the chat pops up live in their sidebar.
  for (const id of members) {
    io.to(`user:${id}`).emit('conversation:new', convForUser(conv, id));
  }
  res.json({ conversation: dto });
});

// Messages in a conversation (paginated, newest last)
app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const conv = db.conversations.find((c) => c.id === req.params.id);
  if (!conv || !conv.members.includes(req.user.id)) return res.status(404).json({ error: 'not found' });
  const all = db.messages.filter(
    (m) => m.conversationId === conv.id && !(m.deletedFor || []).includes(req.user.id)
  );
  res.json({ messages: all });
});

// Search across all of the current user's conversations (text messages only)
app.get('/api/search', authMiddleware, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ results: [] });
  const myConvs = db.conversations.filter((c) => c.members.includes(req.user.id));
  const convById = new Map(myConvs.map((c) => [c.id, c]));
  const results = db.messages
    .filter(
      (m) =>
        convById.has(m.conversationId) &&
        !m.deleted &&
        !(m.deletedFor || []).includes(req.user.id) &&
        m.text &&
        m.text.toLowerCase().includes(q)
    )
    .slice(-300)
    .reverse()
    .map((m) => ({ message: m, conversation: convForUser(convById.get(m.conversationId), req.user.id) }));
  res.json({ results });
});

// Upload an image/file, returns a URL the client puts in a message
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
  });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, storage: storageMode() }));

// =================================================================
// Socket.IO real-time layer
// =================================================================

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((u) => u.id === payload.id);
    if (!user) return next(new Error('auth'));
    socket.userId = user.id;
    next();
  } catch {
    next(new Error('auth'));
  }
});

function memberSocketsRooms(conversationId) {
  const conv = db.conversations.find((c) => c.id === conversationId);
  if (!conv) return [];
  return conv.members.map((id) => `user:${id}`);
}

io.on('connection', (socket) => {
  const userId = socket.userId;
  socket.join(`user:${userId}`);

  // Mark online + broadcast presence
  const me = db.users.find((u) => u.id === userId);
  if (me) {
    me.online = true;
    me.lastSeen = Date.now();
    save();
    io.emit('presence:update', { userId, online: true, lastSeen: me.lastSeen });
  }

  // Send a message
  socket.on('message:send', (payload, ack) => {
    const { conversationId, text = '', media = null, clientId } = payload || {};
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!conv || !conv.members.includes(userId)) {
      if (ack) ack({ error: 'not allowed' });
      return;
    }
    const msg = {
      id: nanoid(14),
      conversationId,
      senderId: userId,
      text: String(text || '').slice(0, 5000),
      media, // { url, name, mime, size, kind: 'image'|'file' } or null
      createdAt: Date.now(),
      deliveredTo: [userId],
      readBy: [userId],
      deleted: false,
      deletedFor: [],
      clientId: clientId || null,
    };
    db.messages.push(msg);
    save();
    for (const room of memberSocketsRooms(conversationId)) {
      io.to(room).emit('message:new', msg);
    }
    if (ack) ack({ ok: true, message: msg });
  });

  // Typing indicator (not persisted)
  socket.on('typing', ({ conversationId, isTyping }) => {
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    for (const id of conv.members) {
      if (id === userId) continue;
      io.to(`user:${id}`).emit('typing', { conversationId, userId, isTyping: !!isTyping });
    }
  });

  // Delete a message — "for everyone" (sender only) or "for me"
  socket.on('message:delete', ({ messageId, forEveryone }, ack) => {
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg) return ack && ack({ error: 'not found' });
    const conv = db.conversations.find((c) => c.id === msg.conversationId);
    if (!conv || !conv.members.includes(userId)) return ack && ack({ error: 'not allowed' });

    if (forEveryone) {
      if (msg.senderId !== userId) return ack && ack({ error: 'only the sender can delete for everyone' });
      msg.deleted = true;
      msg.text = '';
      msg.media = null;
      save();
      for (const id of conv.members) {
        io.to(`user:${id}`).emit('message:deleted', { messageId, conversationId: conv.id, forEveryone: true });
      }
    } else {
      if (!msg.deletedFor) msg.deletedFor = [];
      if (!msg.deletedFor.includes(userId)) msg.deletedFor.push(userId);
      save();
      io.to(`user:${userId}`).emit('message:deleted', { messageId, conversationId: conv.id, forEveryone: false });
    }
    if (ack) ack({ ok: true });
  });

  // ---- WebRTC call signaling (relay only; media is peer-to-peer) ----
  socket.on('call:offer', ({ to, offer, callType, conversationId }) => {
    const fromUser = publicUser(db.users.find((u) => u.id === userId));
    io.to(`user:${to}`).emit('call:incoming', { from: userId, fromUser, offer, callType, conversationId });
  });
  socket.on('call:answer', ({ to, answer }) => {
    io.to(`user:${to}`).emit('call:answered', { from: userId, answer });
  });
  socket.on('call:ice', ({ to, candidate }) => {
    io.to(`user:${to}`).emit('call:ice', { from: userId, candidate });
  });
  socket.on('call:reject', ({ to }) => {
    io.to(`user:${to}`).emit('call:rejected', { from: userId });
  });
  socket.on('call:end', ({ to }) => {
    io.to(`user:${to}`).emit('call:ended', { from: userId });
  });

  // Mark a conversation read up to now
  socket.on('message:read', ({ conversationId }) => {
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!conv || !conv.members.includes(userId)) return;
    let changed = false;
    for (const m of db.messages) {
      if (m.conversationId === conversationId && !m.readBy.includes(userId)) {
        m.readBy.push(userId);
        changed = true;
      }
    }
    if (changed) {
      save();
      for (const id of conv.members) {
        io.to(`user:${id}`).emit('message:read', { conversationId, userId });
      }
    }
  });

  socket.on('disconnect', () => {
    // Only go offline if the user has no other open sockets.
    const stillConnected = [...io.sockets.sockets.values()].some((s) => s.userId === userId);
    if (stillConnected) return;
    const u = db.users.find((x) => x.id === userId);
    if (u) {
      u.online = false;
      u.lastSeen = Date.now();
      save();
      io.emit('presence:update', { userId, online: false, lastSeen: u.lastSeen });
    }
  });
});

// ---------- serve the built React app (production single-service deploy) ----------
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback: any non-API/non-upload GET returns index.html.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
  console.log('  Serving built client from client/dist');
}

// Load persisted state, then start accepting connections.
initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ChatApp server running on http://localhost:${PORT}`);
    console.log(`  (also reachable on your LAN IP at port ${PORT} for phone testing)\n`);
  });
});
