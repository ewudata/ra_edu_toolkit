import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { GraduationCap, LogIn } from 'lucide-react';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, login, error, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-[3px] border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-sm mx-auto mt-20 text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto">
          <GraduationCap className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Welcome Back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to access your relational algebra workspace.</p>
        </div>
        <button
          onClick={login}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-semibold cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          Log in with Google
        </button>
        {error && (
          <div className="bg-danger-light border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            Authentication failed: {error}
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
