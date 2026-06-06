import { useEffect, useState } from 'react';
import API from '../api/client';

interface User {
  id: string;
  email: string;
  name?: string;
  tokens: { id: string; token: string; name?: string; active: boolean }[];
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

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

  const createToken = async (userId: string) => {
    await API.post(`/users/${userId}/tokens`, { name: 'default' });
    load();
  };

  const revokeToken = async (tokenId: string) => {
    await API.delete(`/users/tokens/${tokenId}`);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Service Users</h1>
      <div className="flex gap-2 mb-4">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="border p-2 rounded flex-1" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="border p-2 rounded flex-1" type="password" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="border p-2 rounded flex-1" />
        <button onClick={add} className="bg-blue-600 text-white px-4 py-2 rounded">Add</button>
      </div>
      <table className="w-full bg-white rounded shadow">
        <thead><tr className="border-b"><th className="p-2 text-left">Email</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Tokens</th><th className="p-2 text-left">Actions</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.name || '-'}</td>
              <td className="p-2">
                {u.tokens.map((t) => (
                  <span key={t.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded mr-2 ${t.active ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {t.name || t.token.slice(0, 8)}...
                    <button onClick={() => revokeToken(t.id)} className="text-red-400">x</button>
                  </span>
                ))}
                <button onClick={() => createToken(u.id)} className="text-blue-500 text-sm">+ token</button>
              </td>
              <td className="p-2">
                <button onClick={() => remove(u.id)} className="text-red-500">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
