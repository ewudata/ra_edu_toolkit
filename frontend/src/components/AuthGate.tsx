import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, login, error, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-4">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
          Sign in with Google to access this application.
        </div>
        <button
          onClick={login}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          Log in with Google
        </button>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            Authentication failed: {error}
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
