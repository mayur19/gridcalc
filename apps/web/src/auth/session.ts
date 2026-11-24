import { createContext, useContext } from 'react';

export interface Session {
  readonly user: { readonly id: string; readonly email: string; readonly displayName: string };
  readonly organization: { readonly id: string; readonly name: string };
  readonly role: 'owner' | 'admin' | 'editor' | 'viewer';
  readonly permissions: readonly string[];
}

export interface AuthState {
  readonly session: Session | null;
  readonly loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: {
    organizationName: string;
    displayName: string;
    email: string;
    password: string;
  }): Promise<void>;
  logout(): Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export function can(session: Session | null, permission: string): boolean {
  return session?.permissions.includes(permission) ?? false;
}
