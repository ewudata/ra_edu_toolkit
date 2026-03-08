import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/databases', label: 'Database Manager', icon: '🗄️' },
  { to: '/ra-exercises', label: 'RA Exercises', icon: '🧮' },
  { to: '/sql-exercises', label: 'SQL Exercises', icon: '🧠' },
  { to: '/ra-sql-reference', label: 'RA ↔ SQL', icon: '🔄' },
];

export default function Layout() {
  const { isAuthenticated, email, logout, login, loading } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-800">🎓 RA Edu Toolkit</h1>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Account</h3>
          {loading ? (
            <p className="text-sm text-gray-400">Loading session...</p>
          ) : isAuthenticated ? (
            <div className="space-y-2">
              <p className="text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-md truncate">
                {email}
              </p>
              <button onClick={logout} className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">
                Log Out
              </button>
            </div>
          ) : (
            <button onClick={login} className="w-full text-sm px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium">
              Log in with Google
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
