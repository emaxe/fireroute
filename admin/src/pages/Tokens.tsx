import { useEffect, useState } from 'react';
import API from '../api/client';
import CopyButton from '../components/CopyButton';

interface ServiceToken {
  id: string;
  token: string;
  name?: string;
  active: boolean;
  createdAt: string;
}

export default function Tokens() {
  const [tokens, setTokens] = useState<ServiceToken[]>([]);
  const [tokenName, setTokenName] = useState('');
  const [newToken, setNewToken] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = () => API.get('/tokens').then((res) => setTokens(res.data));

  useEffect(() => { load(); }, []);

  const create = async () => {
    const res = await API.post('/tokens', { name: tokenName || 'default' });
    setNewToken(res.data.token);
    setTokenName('');
    load();
  };

  const revoke = async (id: string) => {
    await API.patch(`/tokens/${id}/revoke`);
    load();
  };

  const remove = async (id: string) => {
    await API.delete(`/tokens/${id}`);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">API Tokens</h1>

      <div className="bg-white p-4 rounded shadow mb-4">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showCreate ? 'Cancel' : '+ Generate New Token'}
        </button>

        {showCreate && (
          <div className="mt-4 flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Token Name (optional)</label>
              <input
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="e.g. production, dev"
                className="border p-2 rounded w-full"
              />
            </div>
            <button
              onClick={create}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Generate
            </button>
          </div>
        )}

        {newToken && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 p-4 rounded">
            <p className="text-sm text-yellow-800 mb-2 font-semibold">New token generated! Copy it now — it will not be shown again.</p>
            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 p-3 pr-16 rounded text-sm overflow-x-auto break-all">{newToken}</pre>
              <CopyButton text={newToken} />
            </div>
            <button onClick={() => setNewToken('')} className="mt-2 text-sm text-gray-500 hover:text-gray-700">Dismiss</button>
          </div>
        )}
      </div>

      <table className="w-full bg-white rounded shadow">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Token</th>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Created</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="p-2 font-mono text-sm">
                <div className="relative">
                  {t.token.slice(0, 16)}...
                  <CopyButton text={t.token} />
                </div>
              </td>
              <td className="p-2">{t.name || '-'}</td>
              <td className="p-2">
                <span className={t.active ? 'text-green-600' : 'text-gray-400'}>
                  {t.active ? 'Active' : 'Revoked'}
                </span>
              </td>
              <td className="p-2 text-sm text-gray-500">{new Date(t.createdAt).toLocaleString()}</td>
              <td className="p-2">
                {t.active && (
                  <button onClick={() => revoke(t.id)} className="text-red-500 text-sm mr-2">Revoke</button>
                )}
                <button onClick={() => remove(t.id)} className="text-red-700 text-sm">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
