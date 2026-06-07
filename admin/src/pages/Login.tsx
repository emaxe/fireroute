import { useState } from 'react';
import API from '../api/client';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await API.post('/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      window.location.href = '/';
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full border border-[#E8E8EC] rounded-[6px] px-3.5 py-2.5 text-sm text-[#0A0A0A] ' +
    'placeholder-[#9C9C9C] bg-white transition-all ' +
    'focus:outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10';

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="font-display font-bold text-2xl text-[#0A0A0A] tracking-tight">
              FireRoute
            </span>
            <span className="text-[10px] font-medium bg-[#6366F1] text-white px-1.5 py-0.5 rounded-[4px] uppercase tracking-wider leading-none">
              Admin
            </span>
          </div>
          <p className="text-sm text-[#6B6B6B]">Sign in to your admin panel</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#E8E8EC] rounded-xl p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Email</label>
              <input
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] mb-1.5">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-[#EF4444] bg-red-50 border border-red-100 rounded-[6px] px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full bg-[#6366F1] hover:bg-[#4F46E5] text-white font-medium py-2.5 rounded-[6px] text-sm
                         transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)]
                         disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
