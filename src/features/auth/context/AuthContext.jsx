import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { storageKeys, storageService } from '../../../services/storage/storageService';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [rememberedUsername, setRememberedUsername] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authAttemptInProgress = useRef(false);

  useEffect(() => {
    storageService.getString(storageKeys.rememberedUsername)
      .then((username) => setRememberedUsername(username || ''))
      .finally(() => setIsInitializing(false));
  }, []);

  const login = useCallback(async ({ username, password, rememberMe }) => {
    if (authAttemptInProgress.current) return null;
    authAttemptInProgress.current = true;
    setIsAuthenticating(true);

    try {
      const result = await authService.login({ username: username.trim(), password });
      if (rememberMe) {
        await storageService.setString(storageKeys.rememberedUsername, result.user.username);
        setRememberedUsername(result.user.username);
      } else {
        await storageService.remove(storageKeys.rememberedUsername);
        setRememberedUsername('');
      }
      setUser(result.user);
      return result.user;
    } finally {
      authAttemptInProgress.current = false;
      setIsAuthenticating(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    isAuthenticating,
    isInitializing,
    login,
    logout,
    rememberedUsername,
    user,
  }), [isAuthenticating, isInitializing, login, logout, rememberedUsername, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
