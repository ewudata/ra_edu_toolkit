import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import DatabaseManager from './pages/DatabaseManager';
import RAExercises from './pages/RAExercises';
import RASQLReference from './pages/RASQLReference';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="databases" element={<ProtectedRoute><DatabaseManager /></ProtectedRoute>} />
            <Route path="ra-exercises" element={<ProtectedRoute><RAExercises /></ProtectedRoute>} />
            <Route path="ra-sql-reference" element={<ProtectedRoute><RASQLReference /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
