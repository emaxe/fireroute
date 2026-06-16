import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Keys from './pages/Keys';
import Groups from './pages/Groups';
import Users from './pages/Users';
import Logs from './pages/Logs';
import Instructions from './pages/Instructions';
import Tokens from './pages/Tokens';
import Settings from './pages/Settings';
import Playground from './pages/Playground';
import Models from './pages/Models';

// Navigation links
const NAV = [
  { to: '/',            label: 'Dashboard' },
  { to: '/playground',  label: 'Playground' },
  { to: '/keys',        label: 'Keys' },
  { to: '/groups',      label: 'Groups' },
  { to: '/models',      label: 'Models' },
  { to: '/users',       label: 'Users' },
  { to: '/tokens',      label: 'Tokens' },
  { to: '/logs',        label: 'Logs' },
  { to: '/instructions',label: 'Instructions' },
  { to: '/settings',    label: 'Settings' },
];

function ThemeToggle({ theme, toggle }: { theme: string; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className="shrink-0 p-2 rounded-[6px] text-[#6B6B6B] dark:text-[#9C9C9C] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border border-[#E8E8EC] dark:border-[#2A2A2A]"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
    >
      {theme === 'dark' ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      )}
    </button>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem('token');
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle } = useTheme();

  if (!token && location.pathname !== '/login') return <Navigate to="/login" />;

  const linkCls = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors block ${
      location.pathname === path
        ? 'text-[#6366F1] bg-indigo-50 dark:bg-indigo-500/10'
        : 'text-[#6B6B6B] dark:text-[#9C9C9C] hover:text-[#0A0A0A] dark:hover:text-[#F0F0F0] hover:bg-gray-50 dark:hover:bg-white/5'
    }`;

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors duration-300">
      {token && (
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
          <div className="max-w-[1280px] mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-display font-semibold text-[#0A0A0A] dark:text-[#F0F0F0] tracking-tight text-base md:text-lg transition-colors duration-300">
                FireRoute
              </span>
              <span className="text-[10px] font-medium bg-[#6366F1] text-white px-1.5 py-0.5 rounded-[4px] uppercase tracking-wider leading-none">
                Admin
              </span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1 flex-1">
              {NAV.map(({ to, label }) => (
                <Link key={to} to={to} className={linkCls(to)}>{label}</Link>
              ))}
            </nav>

            {/* Mobile: hamburger + logout */}
            <div className="flex md:hidden items-center gap-2 ml-auto">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded-md text-[#6B6B6B] dark:text-[#9C9C9C] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                aria-label="Menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>

            {/* Theme toggle + Logout */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <ThemeToggle theme={theme} toggle={toggle} />
              <button
                onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
                className="text-sm font-medium text-[#EF4444] border border-[#EF4444]/50 px-3 py-1.5 rounded-[6px] hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div className="md:hidden border-t border-[#E8E8EC] dark:border-[#2A2A2A] bg-white dark:bg-[#0A0A0A] px-4 py-3 space-y-1 shadow-lg transition-colors duration-300">
              {NAV.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={linkCls(to)}
                >
                  {label}
                </Link>
              ))}
              <div className="pt-2 border-t border-[#E8E8EC] dark:border-[#2A2A2A] mt-2">
                <div className="flex items-center gap-2 px-3 py-2">
                  <ThemeToggle theme={theme} toggle={toggle} />
                  <span className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                </div>
                <button
                  onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-[#EF4444] hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </header>
      )}
      <main className="max-w-[1280px] mx-auto px-4 md:px-6 py-4 md:py-8">{children}</main>
    </div>
  );
}

/**
 * Root application component.
 *
 * Layout wraps every authenticated page with a sticky header (desktop nav + mobile
 * hamburger menu) and enforces a login redirect when the JWT token is missing.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/login"        element={<Login />} />
          <Route path="/"             element={<Dashboard />} />
          <Route path="/playground"   element={<Playground />} />
          <Route path="/keys"         element={<Keys />} />
          <Route path="/groups"       element={<Groups />} />
          <Route path="/users"        element={<Users />} />
          <Route path="/logs"         element={<Logs />} />
          <Route path="/tokens"       element={<Tokens />} />
          <Route path="/instructions" element={<Instructions />} />
          <Route path="/settings"     element={<Settings />} />
          <Route path="/models"       element={<Models />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
