import { useEffect, useState } from 'react';
import API from '../api/client';

interface KeyGroup {
  id: string;
  name: string;
  description?: string;
  members: { key: { id: string; name: string } }[];
}
interface ApiKey {
  id: string;
  name: string;
}

const INPUT =
  'border border-[#E8E8EC] rounded-[6px] px-3.5 py-2.5 text-sm text-[#0A0A0A] bg-white ' +
  'placeholder-[#9C9C9C] transition-all focus:outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10';

const TH = 'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C]';
const TD = 'px-4 py-3 text-sm';

const PRIMARY =
  'bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2.5 rounded-[6px] text-sm font-medium ' +
  'transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)] ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none';

export default function Groups() {
  const [groups, setGroups]             = useState<KeyGroup[]>([]);
  const [keys, setKeys]                 = useState<ApiKey[]>([]);
  const [name, setName]                 = useState('');
  const [description, setDescription]   = useState('');
  const [selectedKey, setSelectedKey]   = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');

  const load = () => {
    API.get('/groups').then((res) => setGroups(res.data));
    API.get('/keys').then((res) => setKeys(res.data));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    await API.post('/groups', { name, description });
    setName(''); setDescription(''); load();
  };

  const remove = async (id: string) => {
    await API.delete(`/groups/${id}`);
    load();
  };

  const assign = async () => {
    if (!selectedGroup || !selectedKey) return;
    await API.post(`/groups/${selectedGroup}/keys`, { keyId: selectedKey });
    setSelectedKey(''); setSelectedGroup(''); load();
  };

  const unassign = async (groupId: string, keyId: string) => {
    await API.delete(`/groups/${groupId}/keys/${keyId}`);
    load();
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] tracking-tight">Key Groups</h1>
        <p className="text-sm text-[#6B6B6B] mt-1">Organise keys into groups for round-robin load balancing</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
        {/* Create group */}
        <div className="bg-white border border-[#E8E8EC] rounded-xl p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-3">Create Group</p>
          <div className="flex flex-col gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className={INPUT} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className={INPUT} />
            <button onClick={add} className={PRIMARY}>Create Group</button>
          </div>
        </div>

        {/* Assign key */}
        <div className="bg-white border border-[#E8E8EC] rounded-xl p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-3">Assign Key to Group</p>
          <div className="flex flex-col gap-3">
            <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className={`${INPUT} cursor-pointer`}>
              <option value="">Select group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className={`${INPUT} cursor-pointer`}>
              <option value="">Select key…</option>
              {keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <button
              onClick={assign}
              disabled={!selectedGroup || !selectedKey}
              className={PRIMARY}
            >
              Assign
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E8E8EC] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-[#FAFAFA] border-b border-[#E8E8EC]">
            <tr>
              <th className={TH}>Group</th>
              <th className={TH}>Keys</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8EC]">
            {groups.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-[#9C9C9C]">
                  No groups yet. Create one above.
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <tr key={g.id} className="hover:bg-[#FAFAFA] transition-colors">
                <td className={TD}>
                  <p className="font-medium text-[#0A0A0A]">{g.name}</p>
                  {g.description && <p className="text-xs text-[#9C9C9C] mt-0.5">{g.description}</p>}
                </td>
                <td className={TD}>
                  <div className="flex flex-wrap gap-1.5">
                    {g.members.length === 0 && (
                      <span className="text-xs text-[#9C9C9C]">No keys assigned</span>
                    )}
                    {g.members.map((m) => (
                      <span
                        key={m.key.id}
                        className="inline-flex items-center gap-1.5 bg-gray-100 text-[#6B6B6B] px-2.5 py-1 rounded-[4px] text-xs font-medium"
                      >
                        {m.key.name}
                        <button
                          onClick={() => unassign(g.id, m.key.id)}
                          className="text-[#9C9C9C] hover:text-[#EF4444] transition-colors leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </td>
                <td className={`${TD} text-right`}>
                  <button
                    onClick={() => remove(g.id)}
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
