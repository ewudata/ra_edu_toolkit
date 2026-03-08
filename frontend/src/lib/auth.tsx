import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import Cookies from 'js-cookie';
import { api, setAuthToken } from './api';

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

  const applyToken = useCallback((token: string | null) => {
    setAuthToken(token);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get('auth_token');
    const authEmail = params.get('auth_email');
    const authError = params.get('auth_error');
    const returnPage = params.get('return_page');

    if (authError) {
      setState({ token: null, email: null, error: authError, loading: false });
      const url = new URL(window.location.href);
      ['auth_token', 'auth_email', 'auth_error', 'return_page'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
      return;
    }

    if (authToken) {
      const email = authEmail || 'Google User';
      setAuthToken(authToken);
      Cookies.set(AUTH_COOKIE, JSON.stringify({ token: authToken, email }), { expires: 30, sameSite: 'lax' });
      setState({ token: authToken, email, error: null, loading: false });

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
          applyToken(token);
          setState({ token, email: email || 'Google User', error: null, loading: false });
          return;
        }
      } catch {
        /* corrupted cookie */
      }
    }
    setState({ token: null, email: null, error: null, loading: false });
  }, [applyToken]);

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
    Cookies.remove(AUTH_COOKIE);
    setAuthToken(null);
    setState({ token: null, email: null, error: null, loading: false });
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
