import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import Sidebar from '../components/Sidebar.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import NewChatModal from '../components/NewChatModal.jsx';
import ProfileModal from '../components/ProfileModal.jsx';
import SearchModal from '../components/SearchModal.jsx';
import CallOverlay from '../components/CallOverlay.jsx';
import { useCalls } from '../hooks/useCalls.js';
import { initNotifications, showMessageNotification } from '../lib/notify.js';

export default function ChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({}); // { convId: Message[] }
  const [typing, setTyping] = useState({}); // { convId: Set(userId) }
  const [presence, setPresence] = useState({}); // { userId: {online, lastSeen} }
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;
  const conversationsRef = useRef([]);
  conversationsRef.current = conversations;

  const calls = useCalls();

  // Ask for notification permission once.
  useEffect(() => { initNotifications(); }, []);

  // Initial load of conversations + presence seeds.
  useEffect(() => {
    api.conversations().then(({ conversations }) => {
      setConversations(conversations);
      const p = {};
      conversations.forEach((c) =>
        c.membersInfo.forEach((m) => { p[m.id] = { online: m.online, lastSeen: m.lastSeen }; })
      );
      setPresence(p);
    });
  }, []);

  // ---- Socket event wiring ----
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNew = (msg) => {
      setMessagesByConv((prev) => {
        const list = prev[msg.conversationId] || [];
        // De-dupe optimistic message by clientId.
        const filtered = msg.clientId ? list.filter((m) => m.clientId !== msg.clientId) : list;
        if (filtered.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [msg.conversationId]: [...filtered, msg] };
      });
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === msg.conversationId);
        if (!exists) {
          api.conversations().then((r) => setConversations(r.conversations));
          return prev;
        }
        const updated = prev.map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessage: msg,
                unread:
                  msg.conversationId === activeIdRef.current || msg.senderId === user.id
                    ? 0
                    : (c.unread || 0) + 1,
              }
            : c
        );
        // Bubble the active conversation to the top.
        updated.sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
        return updated;
      });
      // If it's the open chat, immediately mark read.
      if (msg.conversationId === activeIdRef.current && msg.senderId !== user.id) {
        socket.emit('message:read', { conversationId: msg.conversationId });
      }

      // Desktop notification when the message is from someone else and the
      // chat isn't the one currently focused on screen.
      const notFocusedHere = document.hidden || msg.conversationId !== activeIdRef.current;
      if (msg.senderId !== user.id && notFocusedHere) {
        const conv = conversationsRef.current.find((c) => c.id === msg.conversationId);
        const sender = conv?.membersInfo.find((m) => m.id === msg.senderId);
        const senderName = sender?.username || 'New message';
        const title = conv?.type === 'group' ? `${senderName} • ${conv.title}` : senderName;
        const body = msg.media
          ? (msg.media.kind === 'image' ? '📷 Photo' : `📎 ${msg.media.name || 'File'}`)
          : msg.text;
        showMessageNotification({
          title,
          body,
          onClick: () => openConversationRef.current?.(msg.conversationId),
        });
      }
    };

    const onDeleted = ({ messageId, conversationId, forEveryone }) => {
      setMessagesByConv((prev) => {
        const list = prev[conversationId];
        if (!list) return prev;
        if (forEveryone) {
          return {
            ...prev,
            [conversationId]: list.map((m) =>
              m.id === messageId ? { ...m, deleted: true, text: '', media: null } : m
            ),
          };
        }
        // "delete for me" — drop it from my view entirely
        return { ...prev, [conversationId]: list.filter((m) => m.id !== messageId) };
      });
    };

    const onConvNew = (conv) => {
      setConversations((prev) => (prev.find((c) => c.id === conv.id) ? prev : [conv, ...prev]));
    };

    const onTyping = ({ conversationId, userId, isTyping }) => {
      setTyping((prev) => {
        const set = new Set(prev[conversationId] || []);
        if (isTyping) set.add(userId);
        else set.delete(userId);
        return { ...prev, [conversationId]: set };
      });
    };

    const onRead = ({ conversationId, userId }) => {
      setMessagesByConv((prev) => {
        const list = prev[conversationId];
        if (!list) return prev;
        return {
          ...prev,
          [conversationId]: list.map((m) =>
            m.readBy.includes(userId) ? m : { ...m, readBy: [...m.readBy, userId] }
          ),
        };
      });
    };

    const onPresence = ({ userId, online, lastSeen }) => {
      setPresence((prev) => ({ ...prev, [userId]: { online, lastSeen } }));
    };

    socket.on('message:new', onNew);
    socket.on('message:deleted', onDeleted);
    socket.on('conversation:new', onConvNew);
    socket.on('typing', onTyping);
    socket.on('message:read', onRead);
    socket.on('presence:update', onPresence);

    return () => {
      socket.off('message:new', onNew);
      socket.off('message:deleted', onDeleted);
      socket.off('conversation:new', onConvNew);
      socket.off('typing', onTyping);
      socket.off('message:read', onRead);
      socket.off('presence:update', onPresence);
    };
  }, [user.id]);

  // Open a conversation: load its history + mark read.
  const openConversation = useCallback(async (id) => {
    setActiveId(id);
    if (!messagesByConv[id]) {
      const { messages } = await api.messages(id);
      setMessagesByConv((prev) => ({ ...prev, [id]: messages }));
    }
    const socket = getSocket();
    socket?.emit('message:read', { conversationId: id });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }, [messagesByConv]);

  // Keep a stable ref so the socket notification handler can open chats.
  const openConversationRef = useRef(null);
  openConversationRef.current = openConversation;

  const deleteMessage = useCallback((messageId, forEveryone) => {
    getSocket()?.emit('message:delete', { messageId, forEveryone });
  }, []);

  const startCall = useCallback((conversation, callType) => {
    if (conversation.type !== 'direct') return;
    const peer = conversation.membersInfo.find((m) => m.id === conversation.otherUserId);
    if (peer) calls.startCall(peer, callType, conversation.id);
  }, [calls]);

  // Jump to a conversation (and message) from global search results.
  const goToSearchResult = useCallback((conversationId) => {
    setShowSearch(false);
    openConversation(conversationId);
  }, [openConversation]);

  const sendMessage = useCallback((conversationId, { text, media }) => {
    const socket = getSocket();
    if (!socket) return;
    const clientId = `${Date.now()}-${Math.round(performance.now())}`;
    const optimistic = {
      id: clientId,
      clientId,
      conversationId,
      senderId: user.id,
      text: text || '',
      media: media || null,
      createdAt: Date.now(),
      readBy: [user.id],
      deliveredTo: [user.id],
      pending: true,
    };
    setMessagesByConv((prev) => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] || []), optimistic],
    }));
    socket.emit('message:send', { conversationId, text, media, clientId });
  }, [user.id]);

  const onConversationCreated = useCallback((conv) => {
    setConversations((prev) => (prev.find((c) => c.id === conv.id) ? prev : [conv, ...prev]));
    setShowNewChat(false);
    openConversation(conv.id);
  }, [openConversation]);

  const active = conversations.find((c) => c.id === activeId) || null;

  return (
    <div className={`app ${activeId ? 'chat-open' : ''}`}>
      <Sidebar
        me={user}
        conversations={conversations}
        activeId={activeId}
        presence={presence}
        onOpen={openConversation}
        onNewChat={() => setShowNewChat(true)}
        onProfile={() => setShowProfile(true)}
        onSearch={() => setShowSearch(true)}
      />

      <ChatWindow
        me={user}
        conversation={active}
        messages={active ? messagesByConv[active.id] || [] : []}
        typingUsers={active ? typing[active.id] : null}
        presence={presence}
        onBack={() => setActiveId(null)}
        onSend={sendMessage}
        onDelete={deleteMessage}
        onStartCall={startCall}
      />

      {showNewChat && (
        <NewChatModal me={user} onClose={() => setShowNewChat(false)} onCreated={onConversationCreated} />
      )}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} onOpen={goToSearchResult} />}

      <CallOverlay
        call={calls.call}
        localStream={calls.localStream}
        remoteStream={calls.remoteStream}
        onAccept={calls.acceptCall}
        onReject={calls.rejectCall}
        onHangup={calls.hangup}
      />
    </div>
  );
}
