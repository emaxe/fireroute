import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
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

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem('token');
  const [menuOpen, setMenuOpen] = useState(false);

  if (!token && location.pathname !== '/login') return <Navigate to="/login" />;

  const linkCls = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors block ${
      location.pathname === path
        ? 'text-[#6366F1] bg-indigo-50'
        : 'text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-gray-50'
    }`;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {token && (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#E8E8EC]">
          <div className="max-w-[1280px] mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-display font-semibold text-[#0A0A0A] tracking-tight text-base md:text-lg">
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
                className="p-2 rounded-md text-[#6B6B6B] hover:bg-gray-50 transition-colors"
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

            {/* Desktop logout */}
            <button
              onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
              className="hidden md:block shrink-0 text-sm font-medium text-[#EF4444] border border-[#EF4444]/50 px-3 py-1.5 rounded-[6px] hover:bg-red-50 hover:border-[#EF4444] transition-colors"
            >
              Logout
            </button>
          </div>

          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div className="md:hidden border-t border-[#E8E8EC] bg-white px-4 py-3 space-y-1 shadow-lg">
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
              <div className="pt-2 border-t border-[#E8E8EC] mt-2">
                <button
                  onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-[#EF4444] hover:bg-red-50 transition-colors"
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
