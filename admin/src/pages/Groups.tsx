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

export default function Groups() {
  const [groups, setGroups] = useState<KeyGroup[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
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
      <h1 className="text-2xl font-bold mb-4">Key Groups</h1>
      <div className="flex gap-2 mb-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="border p-2 rounded flex-1" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="border p-2 rounded flex-1" />
        <button onClick={add} className="bg-blue-600 text-white px-4 py-2 rounded">Add</button>
      </div>
      <div className="flex gap-2 mb-4">
        <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className="border p-2 rounded flex-1">
          <option value="">Select Group</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className="border p-2 rounded flex-1">
          <option value="">Select Key</option>
          {keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <button onClick={assign} className="bg-green-600 text-white px-4 py-2 rounded">Assign</button>
      </div>
      <table className="w-full bg-white rounded shadow">
        <thead><tr className="border-b"><th className="p-2 text-left">Name</th><th className="p-2 text-left">Keys</th><th className="p-2 text-left">Actions</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className="border-b">
              <td className="p-2">{g.name}</td>
              <td className="p-2">
                {g.members.map((m) => (
                  <span key={m.key.id} className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded mr-2">
                    {m.key.name}
                    <button onClick={() => unassign(g.id, m.key.id)} className="text-red-400">x</button>
                  </span>
                ))}
              </td>
              <td className="p-2">
                <button onClick={() => remove(g.id)} className="text-red-500">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
