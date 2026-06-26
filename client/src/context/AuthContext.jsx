import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from '../lib/api.js';
import { connectSocket, disconnectSocket } from '../lib/socket.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore a session from a stored token on first load.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(({ user }) => {
        setUser(user);
        connectSocket(token);
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const finishAuth = useCallback(({ token, user }) => {
    setToken(token);
    setUser(user);
    connectSocket(token);
  }, []);

  const login = useCallback(async (username, password) => {
    finishAuth(await api.login(username, password));
  }, [finishAuth]);

  const register = useCallback(async (username, password) => {
    finishAuth(await api.register(username, password));
  }, [finishAuth]);

  const logout = useCallback(() => {
    disconnectSocket();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
