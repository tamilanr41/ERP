import { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import api, { TOKEN_KEY, REFRESH_KEY, USER_KEY, clearSession } from '../lib/api';

const AuthContext = createContext(null);

const resolvePermissions = (user, permissions) => {
  if (Array.isArray(user?.permissions) && user.permissions.length) return user.permissions;
  return Array.isArray(permissions) ? permissions : [];
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (credentials) => {
    const res = await api.post('/auth/login', credentials);
    const { accessToken, refreshToken, user: u, permissions } = res.data.data;
    const merged = { ...u, permissions: resolvePermissions(u, permissions) };
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(merged));
    setUser(merged);
    return merged;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearSession();
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/me');
      const u = res.data.data;
      setUser(u);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) refreshMe().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPermission = useCallback(
    (code) => {
      if (!user) return false;
      if (user.roleCode === 'SUPER_ADMIN') return true;
      return Array.isArray(user.permissions) && user.permissions.includes(code);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshMe, hasPermission }),
    [user, loading, login, logout, refreshMe, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};