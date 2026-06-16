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
    'w-full border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] px-3.5 py-2.5 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] ' +
    'placeholder-[#9C9C9C] dark:placeholder-[#6B6B6B] bg-white dark:bg-[#161616] transition-all ' +
    'focus:outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#0A0A0A] px-4 py-8 md:py-12 transition-colors duration-300">
      <div className="w-full max-w-sm bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] px-4 md:px-8 py-8 md:py-10 transition-colors duration-300">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="font-display font-bold text-2xl text-[#0A0A0A] dark:text-[#F0F0F0] tracking-tight">
              FireRoute
            </span>
            <span className="text-[10px] font-medium bg-[#6366F1] text-white px-1.5 py-0.5 rounded-[4px] uppercase tracking-wider leading-none">
              Admin
            </span>
          </div>
          <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">Sign in to your admin panel</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-8 transition-colors duration-300">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-[#0A0A0A] dark:text-[#F0F0F0] mb-1.5">Email</label>
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
              <label className="block text-sm font-medium text-[#0A0A0A] dark:text-[#F0F0F0] mb-1.5">Password</label>
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
              <p className="text-sm text-[#EF4444] bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-[6px] px-3 py-2 transition-colors duration-300">
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
