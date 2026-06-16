import { useEffect, useState, useCallback } from 'react';
import API from '../api/client';

interface BlockedEndpoint {
  id: string;
  pattern: string;
  message: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function Settings() {
  const [endpoints, setEndpoints] = useState<BlockedEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPattern, setNewPattern] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/blocked-endpoints');
      setEndpoints(res.data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newPattern.trim().startsWith('/')) {
      setError('Pattern must start with /');
      return;
    }
    try {
      setSaving(true);
      await API.post('/blocked-endpoints', {
        pattern: newPattern.trim(),
        message: newMessage.trim() || 'Endpoint not supported',
      });
      setNewPattern('');
      setNewMessage('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    try {
      await API.patch(`/blocked-endpoints/${id}`, { active: !active });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this blocked endpoint?')) return;
    try {
      await API.delete(`/blocked-endpoints/${id}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-display font-semibold text-[#0A0A0A] dark:text-[#F0F0F0]">Settings</h1>
      </div>

      <section className="bg-white dark:bg-[#161616] rounded-[12px] border border-[#E8E8EC] dark:border-[#2A2A2A] p-6 transition-colors duration-300">
        <h2 className="text-lg font-semibold text-[#0A0A0A] dark:text-[#F0F0F0] mb-4">Blocked Endpoints</h2>
        <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mb-4">
          Requests matching these patterns will be rejected with 404 before reaching the upstream provider.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-[8px] bg-red-50 dark:bg-red-500/10 text-red-600 text-sm border border-red-100 dark:border-red-500/20 transition-colors duration-300">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="/v1/messages/count_tokens"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-[8px] border border-[#E8E8EC] dark:border-[#2A2A2A] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] transition-colors duration-300"
          />
          <input
            type="text"
            placeholder="Message (optional)"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-[8px] border border-[#E8E8EC] dark:border-[#2A2A2A] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] transition-colors duration-300"
          />
          <button
            onClick={add}
            disabled={saving || !newPattern.trim()}
            className="shrink-0 px-4 py-2 rounded-[8px] bg-[#6366F1] text-white text-sm font-medium hover:bg-[#4F46E5] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Adding…' : 'Block'}
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">Loading…</div>
        ) : endpoints.length === 0 ? (
          <div className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">No blocked endpoints yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
                  <th className="text-left py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">Pattern</th>
                  <th className="text-left py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">Message</th>
                  <th className="text-left py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">Status</th>
                  <th className="text-right py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr key={ep.id} className="border-b border-[#E8E8EC] dark:border-[#2A2A2A] last:border-b-0 transition-colors duration-300">
                    <td className="py-2 px-3 font-mono text-[#0A0A0A] dark:text-[#F0F0F0]">{ep.pattern}</td>
                    <td className="py-2 px-3 text-[#6B6B6B] dark:text-[#9C9C9C]">{ep.message}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium ${
                          ep.active
                            ? 'bg-red-50 dark:bg-red-500/10 text-red-600 border border-red-100 dark:border-red-500/20'
                            : 'bg-gray-50 text-gray-500 border border-gray-100'
                        }`}
                      >
                        {ep.active ? 'Blocked' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggle(ep.id, ep.active)}
                          className="px-2 py-1 rounded-[6px] text-xs font-medium border border-[#E8E8EC] dark:border-[#2A2A2A] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                          {ep.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => remove(ep.id)}
                          className="px-2 py-1 rounded-[6px] text-xs font-medium text-red-600 border border-red-100 dark:border-red-500/20 hover:bg-red-50 dark:bg-red-500/10 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
