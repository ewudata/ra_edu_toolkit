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
      <div className="mx-auto mt-20 max-w-md space-y-6 rounded-[30px] border-2 border-[#d9bf96] bg-[#fffaf1] p-8 text-center shadow-[0_10px_0_0_#ecd9b8]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] border-2 border-[#efb37e] bg-[#f78b43] shadow-[0_6px_0_0_#f4d8b7]">
          <GraduationCap className="h-8 w-8 text-white" />
        </div>
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#5c3b1f]">Welcome Back</h2>
          <p className="mt-1 text-sm text-[#7b5a42]">Sign in to access your relational algebra workspace.</p>
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
