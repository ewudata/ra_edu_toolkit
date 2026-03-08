import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  Home,
  Database,
  FunctionSquare,
  BrainCircuit,
  ArrowLeftRight,
  GraduationCap,
  LogOut,
  LogIn,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/databases', label: 'Database Manager', icon: Database },
  { to: '/ra-exercises', label: 'RA Exercises', icon: FunctionSquare },
  { to: '/sql-exercises', label: 'SQL Exercises', icon: BrainCircuit },
  { to: '/ra-sql-reference', label: 'RA ↔ SQL', icon: ArrowLeftRight },
];

export default function Layout() {
  const { isAuthenticated, email, logout, login, loading } = useAuth();

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 leading-tight">RA Edu Toolkit</h1>
              <p className="text-[11px] text-slate-400 leading-tight">Relational Algebra</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-primary-50 text-primary border border-primary-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-[18px] h-[18px]" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-200">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Account</p>
          {loading ? (
            <p className="text-sm text-slate-400">Loading session...</p>
          ) : isAuthenticated ? (
            <div className="space-y-2">
              <p className="text-xs text-primary bg-primary-50 px-3 py-2 rounded-lg truncate font-medium">
                {email}
              </p>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-slate-600"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              Log in with Google
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
