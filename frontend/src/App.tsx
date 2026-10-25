import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './lib/useAuth';
import { AuthProvider } from './lib/auth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import DatabaseManager from './pages/DatabaseManager';
import RAExercises from './pages/RAExercises';
import RASQLReference from './pages/RASQLReference';
import ProgressDashboard from './pages/ProgressDashboard';

function Workspace() {
  const { loading, sessionRevision } = useAuth();
  if (loading) return <p role="status" className="p-8">Checking sign-in status...</p>;
  return (
    <Routes key={sessionRevision}>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="databases" element={<DatabaseManager />} />
        <Route path="ra-exercises" element={<RAExercises />} />
        <Route path="ra-sql-reference" element={<RASQLReference />} />
        <Route path="progress" element={<ProtectedRoute><ProgressDashboard /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Workspace />
      </AuthProvider>
    </BrowserRouter>
  );
}
