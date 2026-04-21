import { useState, useEffect, useLayoutEffect, useCallback, useRef, type ReactNode } from 'react';
import Cookies from 'js-cookie';
import { api, setAuthToken, setRefreshSessionHandler, setUnauthorizedHandler } from './api';
import { AuthContext, type AuthContextValue } from './auth-context';

const AUTH_COOKIE = 'ra_edu_auth';
const UI_SESSION_STORAGE_KEYS = [
  'ra_sql_reference_state_v1',
] as const;

type PersistedAuthState = {
  token: string;
  email: string;
  refreshToken: string | null;
};

function formatAuthError(message: string | null): string | null {
  if (!message) return null;
  const normalized = message.toLowerCase();
  if (
    normalized.includes('token is expired') ||
    normalized.includes('bad_jwt') ||
    normalized.includes('invalid jwt')
  ) {
    return 'Your session expired. Log in again to continue.';
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<AuthContextValue, 'token' | 'email' | 'error' | 'loading'>>({
    token: null,
    email: null,
    error: null,
    loading: true,
  });
  const sessionRef = useRef<PersistedAuthState | null>(null);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

  function clearUiSessionState() {
    if (typeof window === 'undefined') return;
    UI_SESSION_STORAGE_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
  }

  function applyAuthenticatedSession(token: string, email: string, refreshToken: string | null = null) {
    setAuthToken(token);
    sessionRef.current = { token, email, refreshToken };
    Cookies.set(AUTH_COOKIE, JSON.stringify({ token, email, refreshToken }), { expires: 30, sameSite: 'lax' });
    setState({ token, email, error: null, loading: false });
  }

  function clearAuthState(message: string | null = null) {
    Cookies.remove(AUTH_COOKIE);
    setAuthToken(null);
    sessionRef.current = null;
    setState({ token: null, email: null, error: formatAuthError(message), loading: false });
  }

  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get('auth_token');
    const authEmail = params.get('auth_email');
    const authRefreshToken = params.get('auth_refresh_token');
    const authError = params.get('auth_error');
    const returnPage = params.get('return_page');

    if (authError) {
      clearAuthState(authError);
      const url = new URL(window.location.href);
      ['auth_token', 'auth_email', 'auth_refresh_token', 'auth_error', 'return_page'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
      return;
    }

    if (authToken) {
      const email = authEmail || 'Google User';
      clearUiSessionState();
      applyAuthenticatedSession(authToken, email, authRefreshToken || null);

      const url = new URL(window.location.href);
      ['auth_token', 'auth_email', 'auth_refresh_token', 'auth_error', 'return_page'].forEach((k) => url.searchParams.delete(k));
      if (returnPage) {
        url.pathname = returnPage;
      }
      window.history.replaceState({}, '', url.toString());
      return;
    }

    const raw = Cookies.get(AUTH_COOKIE);
    if (raw) {
      try {
        const { token, email, refreshToken } = JSON.parse(raw);
        if (token) {
          applyAuthenticatedSession(token, email || 'Google User', refreshToken || null);
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
    setRefreshSessionHandler(() => {
      if (refreshInFlightRef.current) return refreshInFlightRef.current;
      const activeSession = sessionRef.current;
      if (!activeSession?.refreshToken) return Promise.resolve(false);

      refreshInFlightRef.current = api.refreshSession(activeSession.refreshToken)
        .then((payload) => {
          applyAuthenticatedSession(
            payload.auth_token,
            payload.auth_email || activeSession.email || 'Google User',
            payload.auth_refresh_token || activeSession.refreshToken,
          );
          return true;
        })
        .catch(() => false)
        .finally(() => {
          refreshInFlightRef.current = null;
        });

      return refreshInFlightRef.current;
    });
    return () => {
      setUnauthorizedHandler(null);
      setRefreshSessionHandler(null);
    };
  }, []);

  const login = useCallback(async () => {
    try {
      const redirectUrl = window.location.origin + window.location.pathname;
      const oauthUrl = await api.getGoogleLoginUrl(redirectUrl);
      window.location.href = oauthUrl;
    } catch (err) {
      setState((s) => ({ ...s, error: formatAuthError(String(err)) }));
    }
  }, []);

  const logout = useCallback(() => {
    clearUiSessionState();
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
