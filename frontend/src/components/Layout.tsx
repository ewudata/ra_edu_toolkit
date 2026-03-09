import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  GraduationCap,
  LogOut,
  LogIn,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/databases', label: 'Database Manager' },
  { to: '/ra-exercises', label: 'RA Exercises' },
  { to: '/ra-sql-reference', label: 'RA ↔ SQL' },
];

export default function Layout() {
  const { isAuthenticated, email, logout, login, loading } = useAuth();

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
        <div className="app-container">
          <div className="rounded-[32px] border border-[#efefef] bg-white px-5 py-4 shadow-[0_18px_34px_rgba(24,39,75,0.08)] md:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] shadow-[0_12px_24px_rgba(141,223,162,0.35)]">
                  <GraduationCap className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h1 className="font-display text-3xl leading-none text-[#374151]">RALT</h1>
                  <p className="mt-1 text-sm font-semibold text-[#475467]">Relational Algebra Learning Tools</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
                <nav className="flex flex-wrap items-center gap-x-8 gap-y-2 px-1 py-1">
                  {NAV_ITEMS.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      className={({ isActive }) => `app-nav-link whitespace-nowrap ${isActive ? 'app-nav-link-active' : ''}`}
                    >
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </nav>

                <div className="flex items-center justify-end gap-3 lg:min-w-[240px]">
                  <div className="min-w-0 text-right">
                    {loading ? (
                      <p className="text-sm text-[#475467]">Loading session...</p>
                    ) : null}
                  </div>
                  {loading ? (
                    <div className="h-10 w-10 rounded-[18px] bg-[#f7f7f7] shadow-[0_10px_18px_rgba(24,39,75,0.08)]" />
                  ) : isAuthenticated ? (
                    <div className="flex flex-col items-end gap-2">
                      <p className="max-w-[220px] truncate text-sm font-semibold text-[#4b5563]">{email}</p>
                      <button
                        onClick={logout}
                        className="app-primary-btn shrink-0 !rounded-[20px] !px-5 !py-3"
                      >
                        <LogOut className="h-4 w-4" />
                        Log Out
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={login}
                      className="app-primary-btn shrink-0 !rounded-[20px] !px-5 !py-3"
                    >
                      <LogIn className="h-4 w-4" />
                      Log in with Google
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="pb-12 pt-6">
        <div className="app-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
