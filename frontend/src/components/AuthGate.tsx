import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { GraduationCap, LogIn } from 'lucide-react';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, login, error, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto mt-20 max-w-md space-y-6 rounded-[30px] border border-[#cbeae3] bg-[#f7fcfa] p-8 text-center shadow-[0_16px_30px_rgba(116,200,184,0.12)]">
        <div className="mx-auto app-icon-tile flex h-16 w-16 items-center justify-center rounded-[24px] shadow-[0_10px_22px_rgba(116,200,184,0.16)]">
          <GraduationCap className="app-icon-glyph h-8 w-8" />
        </div>
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#3f4761]">Welcome Back</h2>
          <p className="mt-1 text-sm text-[#5f6b7a]">Sign in to access your relational algebra workspace.</p>
        </div>
        <button
          onClick={login}
          className="app-primary-btn"
        >
          <LogIn className="w-4 h-4" />
          Log in with Google
        </button>
        {error && (
          <div className="rounded-[18px] border-2 border-[#d9a08f] bg-[#fde7df] p-3 text-sm text-[#86483d]">
            Authentication failed: {error}
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
