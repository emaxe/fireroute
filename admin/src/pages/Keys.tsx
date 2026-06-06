import { useEffect, useState } from 'react';
import API from '../api/client';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  active: boolean;
  createdAt: string;
}

export default function Keys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const load = () => API.get('/keys').then((res) => setKeys(res.data));

  useEffect(() => { load(); }, []);

  const add = async () => {
    await API.post('/keys', { name, key });
    setName(''); setKey(''); load();
  };

  const remove = async (id: string) => {
    setError('');
    try {
      await API.delete(`/keys/${id}`);
      load();
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(err.response.data?.error || 'Cannot delete key assigned to group(s). Remove from groups first.');
      } else {
        setError('Failed to delete key');
      }
    }
  };

  const toggle = async (id: string, active: boolean) => {
    await API.patch(`/keys/${id}`, { active: !active });
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">API Keys</h1>
      {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
      <div className="flex gap-2 mb-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="border p-2 rounded flex-1" />
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Fireworks API Key" className="border p-2 rounded flex-1" />
        <button onClick={add} className="bg-blue-600 text-white px-4 py-2 rounded">Add</button>
      </div>
      <table className="w-full bg-white rounded shadow">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Key</th>
            <th className="p-2 text-left">Active</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-b">
              <td className="p-2">{k.name}</td>
              <td className="p-2 font-mono">{k.key.slice(0, 8)}...{k.key.slice(-4)}</td>
              <td className="p-2">
                <button onClick={() => toggle(k.id, k.active)} className={k.active ? 'text-green-600' : 'text-gray-400'}>
                  {k.active ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="p-2">
                <button onClick={() => remove(k.id)} className="text-red-500">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
