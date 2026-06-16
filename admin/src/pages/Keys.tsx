import { useEffect, useState } from 'react';
import API from '../api/client';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  active: boolean;
  suspended?: boolean;
  createdAt: string;
}

const INPUT =
  'border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] px-3.5 py-2.5 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] bg-white dark:bg-[#161616] ' +
  'placeholder-[#9C9C9C] dark:placeholder-[#6B6B6B] transition-all focus:outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10';

const TH = 'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B]';
const TD = 'px-4 py-3 text-sm';

export default function Keys() {
  const [keys, setKeys]   = useState<ApiKey[]>([]);
  const [name, setName]   = useState('');
  const [key, setKey]     = useState('');
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
      setError(
        err.response?.status === 409
          ? err.response.data?.error || 'Cannot delete: key is assigned to a group. Remove it from all groups first.'
          : 'Failed to delete key.'
      );
    }
  };

  const toggle = async (id: string, active: boolean) => {
    await API.patch(`/keys/${id}`, { active: !active });
    load();
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] dark:text-[#F0F0F0] tracking-tight">API Keys</h1>
        <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mt-1">Manage Fireworks API keys used by the gateway</p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-[#EF4444] text-sm rounded-[8px] px-4 py-3 mb-5 transition-colors duration-300">
          {error}
        </div>
      )}

      {/* Add form */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-5 mb-5 transition-colors duration-300">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-3">Add Key</p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={`${INPUT} w-full sm:w-44`}
          />
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Fireworks API Key"
            className={`${INPUT} flex-1 font-mono text-xs`}
          />
          <button
            onClick={add}
            className="shrink-0 bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2.5 rounded-[6px] text-sm font-medium
                       transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)]"
          >
            Add Key
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl overflow-hidden transition-colors duration-300">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-[#FAFAFA] dark:bg-[#0A0A0A] border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
            <tr>
              <th className={TH}>Name</th>
              <th className={TH}>Key</th>
              <th className={TH}>Status</th>
              <th className={TH}>Created</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8EC]">
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#9C9C9C] dark:text-[#6B6B6B]">
                  No keys yet. Add one above.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="hover:bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors">
                <td className={`${TD} font-medium text-[#0A0A0A] dark:text-[#F0F0F0]`}>{k.name}</td>
                <td className={`${TD} font-mono text-[#6B6B6B] dark:text-[#9C9C9C]`}>{k.key.slice(0, 8)}…{k.key.slice(-4)}</td>
                <td className={TD}>
                  {k.suspended ? (
                    <div className="flex items-center gap-2">
                      <span className="bg-[#FEF2F2] dark:bg-red-500/10 text-[#EF4444] px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-300">Suspended</span>
                      <button
                        onClick={() => API.patch(`/keys/${k.id}/unsuspend`).then(load)}
                        className="text-xs text-[#6366F1] hover:text-[#4F46E5] font-medium transition-colors"
                      >
                        Activate
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => toggle(k.id, k.active)} className="transition-opacity hover:opacity-70">
                      {k.active
                        ? <span className="bg-[#DCFCE7] dark:bg-[#10B981]/15 text-[#10B981] px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-300">Active</span>
                        : <span className="bg-gray-100 dark:bg-white/10 text-[#9C9C9C] dark:text-[#6B6B6B] px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-300">Inactive</span>
                      }
                    </button>
                  )}
                </td>
                <td className={`${TD} text-[#9C9C9C] dark:text-[#6B6B6B]`}>{new Date(k.createdAt).toLocaleDateString()}</td>
                <td className={`${TD} text-right`}>
                  <button
                    onClick={() => remove(k.id)}
                    className="text-sm font-medium text-[#EF4444] hover:text-red-700 transition-colors"
                  >
                    Delete
                  </button>
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
