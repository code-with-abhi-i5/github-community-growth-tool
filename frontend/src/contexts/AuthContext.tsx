import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../lib/api';
import { wsClient } from '../lib/websocket';

interface User {
  id: string;
  githubUsername: string;
  avatarUrl: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  logout: async () => {},
  refetch: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await authApi.getMe();
      setUser(data);
      wsClient.connect(data.id);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
    return () => {
      wsClient.disconnect();
    };
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      wsClient.disconnect();
      setUser(null);
      window.location.href = '/';
    } catch (e) {
      console.error('Logout failed', e);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
