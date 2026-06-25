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

interface ModelOverride {
  id: string;
  fromModel: string;
  toModel: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface KeyGroup {
  id: string;
  name: string;
  description?: string;
  rotationMode: string;
}

const ROTATION_OPTIONS = [
  { value: 'round_robin', label: 'Round Robin (default)' },
  { value: 'count_50', label: '50 requests per key' },
  { value: 'count_100', label: '100 requests per key' },
  { value: 'tokens_1m', label: '1M tokens per key' },
  { value: 'tokens_5m', label: '5M tokens per key' },
  { value: 'tokens_10m', label: '10M tokens per key' },
  { value: 'tokens_30m', label: '30M tokens per key' },
  { value: 'squeeze', label: 'Squeeze (until blocked)' },
];

export default function Settings() {
  const [endpoints, setEndpoints] = useState<BlockedEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPattern, setNewPattern] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [groups, setGroups] = useState<KeyGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<ModelOverride[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [overridesError, setOverridesError] = useState<string | null>(null);
  const [newFromModel, setNewFromModel] = useState('');
  const [newToModel, setNewToModel] = useState('');
  const [overridesSaving, setOverridesSaving] = useState(false);

  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchLoading, setWebSearchLoading] = useState(true);
  const [webSearchError, setWebSearchError] = useState<string | null>(null);

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

  const loadGroups = useCallback(async () => {
    try {
      setGroupsLoading(true);
      const res = await API.get('/groups');
      setGroups(res.data.map((g: any) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        rotationMode: g.rotationMode || 'round_robin',
      })));
      setGroupsError(null);
    } catch (e: any) {
      setGroupsError(e.message || 'Failed to load groups');
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadOverrides = useCallback(async () => {
    try {
      setOverridesLoading(true);
      const res = await API.get('/model-overrides');
      setOverrides(res.data);
      setOverridesError(null);
    } catch (e: any) {
      setOverridesError(e.message || 'Failed to load overrides');
    } finally {
      setOverridesLoading(false);
    }
  }, []);

  const loadGatewayConfig = useCallback(async () => {
    try {
      setWebSearchLoading(true);
      const res = await API.get('/gateway-config');
      const rows = res.data as Array<{ key: string; value: string }>;
      const row = rows.find((r) => r.key === 'web_search_preview_enabled');
      setWebSearchEnabled(row?.value === 'true');
      setWebSearchError(null);
    } catch (e: any) {
      setWebSearchError(e.message || 'Failed to load gateway config');
    } finally {
      setWebSearchLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadGroups(); loadOverrides(); loadGatewayConfig(); }, [load, loadGroups, loadOverrides, loadGatewayConfig]);

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

  const updateGroupRotation = async (id: string, mode: string) => {
    try {
      await API.patch(`/groups/${id}`, { rotationMode: mode });
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, rotationMode: mode } : g))
      );
    } catch (e: any) {
      setGroupsError(e.response?.data?.error || e.message);
    }
  };

  const addOverride = async () => {
    if (!newFromModel.trim() || !newToModel.trim()) {
      setOverridesError('Both fields are required');
      return;
    }
    try {
      setOverridesSaving(true);
      await API.post('/model-overrides', {
        fromModel: newFromModel.trim(),
        toModel: newToModel.trim(),
      });
      setNewFromModel('');
      setNewToModel('');
      await loadOverrides();
    } catch (e: any) {
      setOverridesError(e.response?.data?.error || e.message);
    } finally {
      setOverridesSaving(false);
    }
  };

  const toggleOverride = async (id: string, active: boolean) => {
    try {
      await API.put(`/model-overrides/${id}`, { active: !active });
      await loadOverrides();
    } catch (e: any) {
      setOverridesError(e.message);
    }
  };

  const removeOverride = async (id: string) => {
    if (!confirm('Delete this model override?')) return;
    try {
      await API.delete(`/model-overrides/${id}`);
      await loadOverrides();
    } catch (e: any) {
      setOverridesError(e.message);
    }
  };

  const toggleWebSearch = async () => {
    try {
      setWebSearchError(null);
      const next = !webSearchEnabled;
      await API.put('/gateway-config/web_search_preview_enabled', { value: next ? 'true' : 'false' });
      setWebSearchEnabled(next);
    } catch (e: any) {
      setWebSearchError(e.response?.data?.error || e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-display font-semibold text-[#0A0A0A] dark:text-[#F0F0F0]">Settings</h1>
      </div>

      <section className="bg-white dark:bg-[#161616] rounded-[12px] border border-[#E8E8EC] dark:border-[#2A2A2A] p-6 transition-colors duration-300">
        <h2 className="text-lg font-semibold text-[#0A0A0A] dark:text-[#F0F0F0] mb-4">Web Search Preview</h2>
        <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mb-4">
          When enabled, incoming Anthropic /v1/messages requests containing <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 rounded">web_search_preview</code> tool calls will be enriched locally by performing a DuckDuckGo search and injecting the results back into the conversation before forwarding to the upstream LLM.
        </p>

        {webSearchError && (
          <div className="mb-4 p-3 rounded-[8px] bg-red-50 dark:bg-red-500/10 text-red-600 text-sm border border-red-100 dark:border-red-500/20 transition-colors duration-300">
            {webSearchError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={toggleWebSearch}
            disabled={webSearchLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              webSearchEnabled
                ? 'bg-[#6366F1]'
                : 'bg-gray-200 dark:bg-gray-700'
            } ${webSearchLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                webSearchEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm text-[#0A0A0A] dark:text-[#F0F0F0]">
            {webSearchLoading ? 'Loading…' : webSearchEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </section>

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

      <section className="bg-white dark:bg-[#161616] rounded-[12px] border border-[#E8E8EC] dark:border-[#2A2A2A] p-6 transition-colors duration-300">
        <h2 className="text-lg font-semibold text-[#0A0A0A] dark:text-[#F0F0F0] mb-4">Key Group Rotation</h2>
        <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mb-4">
          Choose how API keys are rotated within each group. Requests from different tokens are spread across different keys whenever possible.
        </p>

        {groupsError && (
          <div className="mb-4 p-3 rounded-[8px] bg-red-50 dark:bg-red-500/10 text-red-600 text-sm border border-red-100 dark:border-red-500/20 transition-colors duration-300">
            {groupsError}
          </div>
        )}

        {groupsLoading ? (
          <div className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">Loading groups…</div>
        ) : groups.length === 0 ? (
          <div className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">No key groups yet. Create one in the Key Groups page.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
                  <th className="text-left py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">Group</th>
                  <th className="text-left py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">Rotation Mode</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-b border-[#E8E8EC] dark:border-[#2A2A2A] last:border-b-0 transition-colors duration-300">
                    <td className="py-2 px-3">
                      <p className="font-medium text-[#0A0A0A] dark:text-[#F0F0F0]">{g.name}</p>
                      {g.description && <p className="text-xs text-[#6B6B6B] dark:text-[#9C9C9C] mt-0.5">{g.description}</p>}
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={g.rotationMode}
                        onChange={(e) => updateGroupRotation(g.id, e.target.value)}
                        className="min-w-[220px] px-3 py-2 rounded-[8px] border border-[#E8E8EC] dark:border-[#2A2A2A] text-sm bg-white dark:bg-[#161616] text-[#0A0A0A] dark:text-[#F0F0F0] focus:outline-none focus:ring-2 focus:ring-[#6366F1] transition-colors duration-300"
                      >
                        {ROTATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-[#161616] rounded-[12px] border border-[#E8E8EC] dark:border-[#2A2A2A] p-6 transition-colors duration-300">
        <h2 className="text-lg font-semibold text-[#0A0A0A] dark:text-[#F0F0F0] mb-4">Model Overrides</h2>
        <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mb-4">
          Transparently rewrite the <code>model</code> field in incoming requests before forwarding to the upstream provider. Case-insensitive matching.
        </p>

        {overridesError && (
          <div className="mb-4 p-3 rounded-[8px] bg-red-50 dark:bg-red-500/10 text-red-600 text-sm border border-red-100 dark:border-red-500/20 transition-colors duration-300">
            {overridesError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="claude-sonnet-4-6"
            value={newFromModel}
            onChange={(e) => setNewFromModel(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-[8px] border border-[#E8E8EC] dark:border-[#2A2A2A] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] transition-colors duration-300"
          />
          <span className="hidden sm:inline text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">→</span>
          <input
            type="text"
            placeholder="accounts/fireworks/models/kimi-k2p6"
            value={newToModel}
            onChange={(e) => setNewToModel(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-[8px] border border-[#E8E8EC] dark:border-[#2A2A2A] text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] transition-colors duration-300"
          />
          <button
            onClick={addOverride}
            disabled={overridesSaving || !newFromModel.trim() || !newToModel.trim()}
            className="shrink-0 px-4 py-2 rounded-[8px] bg-[#6366F1] text-white text-sm font-medium hover:bg-[#4F46E5] disabled:opacity-50 transition-colors"
          >
            {overridesSaving ? 'Adding…' : 'Add'}
          </button>
        </div>

        {overridesLoading ? (
          <div className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">Loading…</div>
        ) : overrides.length === 0 ? (
          <div className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C]">No model overrides yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
                  <th className="text-left py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">From</th>
                  <th className="text-left py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">To</th>
                  <th className="text-left py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">Status</th>
                  <th className="text-right py-2 px-3 font-medium text-[#6B6B6B] dark:text-[#9C9C9C]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((ov) => (
                  <tr key={ov.id} className="border-b border-[#E8E8EC] dark:border-[#2A2A2A] last:border-b-0 transition-colors duration-300">
                    <td className="py-2 px-3 font-mono text-[#0A0A0A] dark:text-[#F0F0F0]">{ov.fromModel}</td>
                    <td className="py-2 px-3 font-mono text-[#0A0A0A] dark:text-[#F0F0F0]">{ov.toModel}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium ${
                          ov.active
                            ? 'bg-green-50 dark:bg-green-500/10 text-green-600 border border-green-100 dark:border-green-500/20'
                            : 'bg-gray-50 text-gray-500 border border-gray-100'
                        }`}
                      >
                        {ov.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleOverride(ov.id, ov.active)}
                          className="px-2 py-1 rounded-[6px] text-xs font-medium border border-[#E8E8EC] dark:border-[#2A2A2A] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                          {ov.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => removeOverride(ov.id)}
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
