import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../api/client';
import { AuthContext, type AuthState, type Session } from './session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<Session>('GET', '/api/v1/auth/me')
      .then((result) => active && setSession(result.data))
      .catch(() => active && setSession(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<Session>('POST', '/api/v1/auth/login', { email, password });
    setSession(result.data);
  }, []);

  const register = useCallback<AuthState['register']>(async (input) => {
    const result = await apiRequest<Session>('POST', '/api/v1/auth/register', input);
    setSession(result.data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('POST', '/api/v1/auth/logout');
    } finally {
      setSession(null);
    }
  }, []);

  const value = useMemo(
    () => ({ session, loading, login, register, logout }),
    [session, loading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
