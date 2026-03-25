import { createContext } from 'react';

interface AuthState {
  token: string | null;
  email: string | null;
  error: string | null;
  loading: boolean;
}

export interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
