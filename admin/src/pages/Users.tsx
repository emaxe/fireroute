import { useEffect, useState } from 'react';
import API from '../api/client';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  createdAt: string;
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
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Role</th>
            <th className="p-2 text-left">Created</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.name || '-'}</td>
              <td className="p-2">{u.role}</td>
              <td className="p-2 text-sm text-gray-500">{new Date(u.createdAt).toLocaleString()}</td>
              <td className="p-2">
                <button onClick={() => remove(u.id)} className="text-red-500 text-sm">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
