import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Keys from './pages/Keys';
import Groups from './pages/Groups';
import Users from './pages/Users';
import Logs from './pages/Logs';
import Instructions from './pages/Instructions';
import Tokens from './pages/Tokens';

const NAV = [
  { to: '/',            label: 'Dashboard' },
  { to: '/keys',        label: 'Keys' },
  { to: '/groups',      label: 'Groups' },
  { to: '/users',       label: 'Users' },
  { to: '/tokens',      label: 'Tokens' },
  { to: '/logs',        label: 'Logs' },
  { to: '/instructions',label: 'Instructions' },
];

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem('token');
  if (!token && location.pathname !== '/login') return <Navigate to="/login" />;

  const linkCls = (path: string) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      location.pathname === path
        ? 'text-[#6366F1] bg-indigo-50'
        : 'text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-gray-50'
    }`;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {token && (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#E8E8EC]">
          <div className="max-w-[1280px] mx-auto px-6 h-14 flex items-center gap-6">
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-display font-semibold text-[#0A0A0A] tracking-tight">
                FireRoute
              </span>
              <span className="text-[10px] font-medium bg-[#6366F1] text-white px-1.5 py-0.5 rounded-[4px] uppercase tracking-wider leading-none">
                Admin
              </span>
            </div>

            <nav className="flex items-center gap-1 flex-1">
              {NAV.map(({ to, label }) => (
                <Link key={to} to={to} className={linkCls(to)}>{label}</Link>
              ))}
            </nav>

            <button
              onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
              className="shrink-0 text-sm font-medium text-[#EF4444] border border-[#EF4444]/50 px-3 py-1.5 rounded-[6px] hover:bg-red-50 hover:border-[#EF4444] transition-colors"
            >
              Logout
            </button>
          </div>
        </header>
      )}
      <main className="max-w-[1280px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/login"        element={<Login />} />
          <Route path="/"             element={<Dashboard />} />
          <Route path="/keys"         element={<Keys />} />
          <Route path="/groups"       element={<Groups />} />
          <Route path="/users"        element={<Users />} />
          <Route path="/logs"         element={<Logs />} />
          <Route path="/tokens"       element={<Tokens />} />
          <Route path="/instructions" element={<Instructions />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
