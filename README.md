# ChatApp — a WhatsApp-style real-time messenger

A full-stack, real-time chat application that runs in any **web browser** and on **phones** (installable PWA — "Add to Home Screen"). Built with React + Vite on the front end and Node/Express + Socket.IO on the back end.

## Features

- **Accounts** — register / login (JWT auth, hashed passwords)
- **1-on-1 chats** — start a private conversation with any user
- **Group chats** — create groups, add members, group avatars
- **Real-time messaging** — instant delivery over WebSockets (Socket.IO)
- **Media sharing** — send images and files
- **Presence** — online / last-seen status
- **Typing indicators** — see when someone is typing
- **Read receipts** — double / blue ticks
- **Desktop notifications** — browser push notifications for new messages when the tab/chat isn't focused
- **Delete messages** — "delete for me" or "delete for everyone" (sender only)
- **Search messages** — full-text search across all your conversations
- **Voice & video calls** — 1-on-1 WebRTC calls with mute / camera toggle
- **Responsive + PWA** — mobile-first UI, installable to a phone home screen, works offline-shell

> **Note on calls:** browsers only allow camera/microphone access over a **secure context** — i.e. `localhost` or HTTPS. Voice/video calls work between two browsers on `http://localhost`, but **not** over a plain-HTTP LAN IP on your phone. Text, media, notifications, and everything else work fine over the LAN; calls there need HTTPS (e.g. via a tunnel like ngrok or a self-signed cert).

## Project layout

```
PROJECT 1/
├─ server/   Node + Express + Socket.IO API and WebSocket server
└─ client/   React (Vite) PWA front end
```

## Prerequisites

You need **Node.js 18+** installed. It is not currently installed on this machine.

Install it one of these ways (pick one):

- **winget** (Windows 10/11):  `winget install OpenJS.NodeJS.LTS`
- Or download the LTS installer from https://nodejs.org and run it.

After installing, **open a new terminal** and verify:

```
node --version
npm --version
```

## Run it (two terminals)

### 1. Start the server

```
cd "D:\PROJECT 1\server"
npm install
npm start
```

The API + WebSocket server runs on **http://localhost:4000**.

### 2. Start the client

```
cd "D:\PROJECT 1\client"
npm install
npm run dev
```

Open the printed URL (default **http://localhost:5173**).

## Try it

1. Open the app in your browser, **register** a user (e.g. `alice`).
2. Open a second browser / incognito window / your phone on the same Wi-Fi and register another user (e.g. `bob`).
3. Tap **＋ New chat**, pick the other user, and start messaging in real time.

### Use it on your phone

Find your PC's local IP (`ipconfig` → IPv4 Address, e.g. `192.168.1.20`), make sure your phone is on the same Wi-Fi, then visit `http://192.168.1.20:5173` in the phone browser. Use the browser menu → **Add to Home Screen** to install it as an app.

> The client auto-detects the server host, so phone access works without extra config as long as the server is reachable on port 4000.

## Notes

- Data is stored in a simple JSON file (`server/data/db.json`) and uploads in `server/uploads/` — no database engine to install. For production you'd swap this for Postgres/Mongo.
- This is a learning/demo build. Messages are not end-to-end encrypted.
