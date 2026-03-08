import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import Layout from './components/Layout';
import Home from './pages/Home';
import DatabaseManager from './pages/DatabaseManager';
import RAExercises from './pages/RAExercises';
import SQLExercises from './pages/SQLExercises';
import RASQLReference from './pages/RASQLReference';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="databases" element={<DatabaseManager />} />
            <Route path="ra-exercises" element={<RAExercises />} />
            <Route path="sql-exercises" element={<SQLExercises />} />
            <Route path="ra-sql-reference" element={<RASQLReference />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
