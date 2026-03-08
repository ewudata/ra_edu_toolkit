import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, type ReactNode } from 'react';
import Cookies from 'js-cookie';
import { api, setAuthToken, setUnauthorizedHandler } from './api';

const AUTH_COOKIE = 'ra_edu_auth';

interface AuthState {
  token: string | null;
  email: string | null;
  error: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, email: null, error: null, loading: true });

  function applyAuthenticatedSession(token: string, email: string) {
    setAuthToken(token);
    Cookies.set(AUTH_COOKIE, JSON.stringify({ token, email }), { expires: 30, sameSite: 'lax' });
    setState({ token, email, error: null, loading: false });
  }

  function clearAuthState(message: string | null = null) {
    Cookies.remove(AUTH_COOKIE);
    setAuthToken(null);
    setState({ token: null, email: null, error: message, loading: false });
  }

  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get('auth_token');
    const authEmail = params.get('auth_email');
    const authError = params.get('auth_error');
    const returnPage = params.get('return_page');

    if (authError) {
      clearAuthState(authError);
      const url = new URL(window.location.href);
      ['auth_token', 'auth_email', 'auth_error', 'return_page'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
      return;
    }

    if (authToken) {
      const email = authEmail || 'Google User';
      applyAuthenticatedSession(authToken, email);

      const url = new URL(window.location.href);
      ['auth_token', 'auth_email', 'auth_error', 'return_page'].forEach((k) => url.searchParams.delete(k));
      if (returnPage) {
        url.pathname = returnPage;
      }
      window.history.replaceState({}, '', url.toString());
      return;
    }

    const raw = Cookies.get(AUTH_COOKIE);
    if (raw) {
      try {
        const { token, email } = JSON.parse(raw);
        if (token) {
          applyAuthenticatedSession(token, email || 'Google User');
          return;
        }
      } catch {
        /* corrupted cookie */
      }
    }
    setState({ token: null, email: null, error: null, loading: false });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      clearAuthState(message);
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async () => {
    try {
      const redirectUrl = window.location.origin + window.location.pathname;
      const oauthUrl = await api.getGoogleLoginUrl(redirectUrl);
      window.location.href = oauthUrl;
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthState(null);
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    isAuthenticated: !!state.token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
