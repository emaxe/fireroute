import { useEffect, useState } from 'react';
import API from '../api/client';

interface Model {
  id: string | null;
  modelId: string;
  name: string | null;
  type: string;
  active: boolean;
  source: string;
  createdAt?: string;
}

const INPUT =
  'border border-[#E8E8EC] rounded-[6px] px-3.5 py-2.5 text-sm text-[#0A0A0A] bg-white ' +
  'placeholder-[#9C9C9C] transition-all focus:outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10';

const TH = 'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C]';
const TD = 'px-4 py-3 text-sm';

export default function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('chat');
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    API.get('/models').then((res) => setModels(res.data)).catch((err) => {
      setError(err.response?.data?.error || 'Failed to load models');
    });
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!modelId.trim()) return;
    setError('');
    try {
      await API.post('/models', { modelId: modelId.trim(), name: name.trim() || undefined, type, source: 'manual' });
      setModelId(''); setName(''); setType('chat'); load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add model');
    }
  };

  const toggle = async (m: Model) => {
    const nextActive = !m.active;
    if (m.id) {
      await API.put(`/models/${m.id}`, { active: nextActive });
    } else {
      await API.put('/models/null', { modelId: m.modelId, active: nextActive, type: m.type, name: m.name });
    }
    load();
  };

  const remove = async (id: string | null) => {
    if (!id) return;
    await API.delete(`/models/${id}`);
    load();
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] tracking-tight">Models</h1>
        <p className="text-sm text-[#6B6B6B] mt-1">Manage available models — hide upstream or add custom ones</p>
      </div>

      {/* Add form */}
      <div className="bg-white border border-[#E8E8EC] rounded-xl p-5 mb-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-3">Add Custom Model</p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="accounts/fireworks/models/..."
            className={`${INPUT} flex-1`}
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name (optional)"
            className={`${INPUT} flex-1`}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={`${INPUT} shrink-0`}
          >
            <option value="chat">chat</option>
            <option value="image">image</option>
            <option value="embedding">embedding</option>
            <option value="audio">audio</option>
          </select>
          <button
            onClick={add}
            className="shrink-0 bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2.5 rounded-[6px] text-sm font-medium
                       transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)]"
          >
            Add Model
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-[#EF4444]">{error}</p>}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E8E8EC] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-[#FAFAFA] border-b border-[#E8E8EC]">
            <tr>
              <th className={TH}>Model ID</th>
              <th className={TH}>Name</th>
              <th className={TH}>Type</th>
              <th className={TH}>Source</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8EC]">
            {models.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#9C9C9C]">
                  No models configured yet.
                </td>
              </tr>
            )}
            {models.map((m) => (
              <tr key={m.id ?? m.modelId} className="hover:bg-[#FAFAFA] transition-colors">
                <td className={`${TD} font-medium text-[#0A0A0A]`}>{m.modelId}</td>
                <td className={`${TD} text-[#6B6B6B]`}>{m.name || <span className="text-[#9C9C9C]">—</span>}</td>
                <td className={TD}>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-[#6B6B6B]">
                    {m.type}
                  </span>
                </td>
                <td className={TD}>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    m.source === 'manual'
                      ? 'bg-indigo-50 text-[#6366F1]'
                      : 'bg-gray-100 text-[#6B6B6B]'
                  }`}>
                    {m.source}
                  </span>
                </td>
                <td className={TD}>
                  <button
                    onClick={() => toggle(m)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      m.active
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    {m.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className={`${TD} text-right`}>
                  {m.source === 'manual' && (
                    <button
                      onClick={() => remove(m.id)}
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
