import { useEffect, useState } from 'react';
import API from '../api/client';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  createdAt: string;
}

function getCurrentUserId(): string | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json).id ?? null;
  } catch {
    return null;
  }
}

const INPUT =
  'border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] px-3.5 py-2.5 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] bg-white dark:bg-[#161616] ' +
  'placeholder-[#9C9C9C] dark:placeholder-[#6B6B6B] transition-all focus:outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10';

const TH = 'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B]';
const TD = 'px-4 py-3 text-sm';

export default function Users() {
  const [users, setUsers]       = useState<User[]>([]);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');

  const load = () => API.get('/users').then((res) => setUsers(res.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    await API.post('/users', { email, password, name });
    setEmail(''); setPassword(''); setName(''); load();
  };

  const remove = async (id: string) => {
    await API.delete(`/users/${id}`);
    load();
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] dark:text-[#F0F0F0] tracking-tight">Admin Users</h1>
        <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mt-1">Admin users who can manage the gateway</p>
      </div>

      {/* Add form */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-5 mb-5 transition-colors duration-300">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-3">Add User</p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={`${INPUT} flex-1`}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={`${INPUT} flex-1`}
          />
          <button
            onClick={add}
            className="shrink-0 bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2.5 rounded-[6px] text-sm font-medium
                       transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)]"
          >
            Add User
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl overflow-hidden transition-colors duration-300">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-[#FAFAFA] dark:bg-[#0A0A0A] border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
            <tr>
              <th className={TH}>Email</th>
              <th className={TH}>Name</th>
              <th className={TH}>Role</th>
              <th className={TH}>Created</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8EC]">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#9C9C9C] dark:text-[#6B6B6B]">
                  No users yet. Add one above.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors">
                <td className={`${TD} font-medium text-[#0A0A0A] dark:text-[#F0F0F0]`}>{u.email}</td>
                <td className={`${TD} text-[#6B6B6B] dark:text-[#9C9C9C]`}>{u.name || <span className="text-[#9C9C9C] dark:text-[#6B6B6B]">—</span>}</td>
                <td className={TD}>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'superadmin'
                      ? 'bg-amber-50 text-amber-700'
                      : u.role === 'admin'
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 text-[#6366F1]'
                        : 'bg-gray-100 dark:bg-white/10 text-[#6B6B6B] dark:text-[#9C9C9C]'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className={`${TD} text-[#9C9C9C] dark:text-[#6B6B6B]`}>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className={`${TD} text-right`}>
                  {u.role !== 'superadmin' && u.id !== getCurrentUserId() && (
                    <button
                      onClick={() => remove(u.id)}
                      className="text-sm font-medium text-[#EF4444] hover:text-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
