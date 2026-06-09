import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import {
  GraduationCap,
  LogOut,
  LogIn,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/databases', label: 'Database Manager' },
  { to: '/ra-exercises', label: 'RA Exercises' },
  { to: '/ra-sql-reference', label: 'RA ↔ SQL Translation' },
];

export default function Layout() {
  const { isAuthenticated, email, logout, login, loading } = useAuth();

  return (
    <div className="app-shell">
      <a href="#main-content" className="app-skip-link">
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-[#e7e7e7] bg-[#f3f3f3]/92 px-3 py-2 backdrop-blur sm:px-4">
        <div className="app-container">
          <div className="rounded-2xl border border-[#efefef] bg-white/92 px-4 py-3 shadow-[0_8px_20px_rgba(24,39,75,0.05)] md:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#8ddfd2_0%,#8ee0a2_100%)] shadow-[0_8px_16px_rgba(141,223,162,0.28)]">
                  <GraduationCap aria-hidden="true" className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="font-display text-2xl leading-none text-[#374151]">RALT</h1>
                  <p className="mt-0.5 text-xs font-semibold text-[#475467]">Relational Algebra Learning Tools</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-5">
                <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1 py-1">
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
                      <p className="text-xs text-[#475467]">Checking sign-in status...</p>
                    ) : null}
                  </div>
                  {loading ? (
                    <div className="h-10 w-10 rounded-[18px] bg-[#f7f7f7] shadow-[0_10px_18px_rgba(24,39,75,0.08)]" />
                  ) : isAuthenticated ? (
                    <div className="flex flex-row flex-wrap items-center justify-end gap-2">
                      <p className="max-w-[220px] truncate text-xs font-semibold text-[#4b5563]">{email}</p>
                      <button
                        onClick={logout}
                        className="app-primary-btn shrink-0 !rounded-2xl !px-4 !py-2.5"
                      >
                        <LogOut aria-hidden="true" className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={login}
                      className="app-primary-btn shrink-0 !rounded-2xl !px-4 !py-2.5"
                    >
                      <LogIn aria-hidden="true" className="h-4 w-4" />
                      Log in with Google
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="pb-12 pt-6">
        <div className="app-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
