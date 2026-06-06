import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Keys from './pages/Keys';
import Groups from './pages/Groups';
import Users from './pages/Users';
import Logs from './pages/Logs';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem('token');
  if (!token && location.pathname !== '/login') return <Navigate to="/login" />;

  const nav = (path: string) => location.pathname === path ? 'bg-blue-700' : 'hover:bg-blue-600';

  return (
    <div className="min-h-screen bg-gray-100">
      {token && (
        <nav className="bg-blue-600 text-white p-4 flex gap-4 items-center">
          <Link to="/" className={`px-3 py-1 rounded ${nav('/')}`}>Dashboard</Link>
          <Link to="/keys" className={`px-3 py-1 rounded ${nav('/keys')}`}>Keys</Link>
          <Link to="/groups" className={`px-3 py-1 rounded ${nav('/groups')}`}>Groups</Link>
          <Link to="/users" className={`px-3 py-1 rounded ${nav('/users')}`}>Users</Link>
          <Link to="/logs" className={`px-3 py-1 rounded ${nav('/logs')}`}>Logs</Link>
          <button
            onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
            className="ml-auto px-3 py-1 bg-red-500 rounded hover:bg-red-600"
          >
            Logout
          </button>
        </nav>
      )}
      <main className="p-4">{children}</main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/keys" element={<Keys />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/users" element={<Users />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
