import type { ReactNode } from 'react';
import AuthGate from './AuthGate';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
