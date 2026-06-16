import { useEffect, useState } from 'react';
import API from '../api/client';
import CopyButton from '../components/CopyButton';

interface KeyGroup {
  id: string;
  name: string;
}

interface TokenGroupLink {
  id: string;
  groupId: string;
  group: { id: string; name: string };
}

interface ServiceToken {
  id: string;
  token: string;
  name?: string;
  active: boolean;
  createdAt: string;
  groups: TokenGroupLink[];
}

const INPUT =
  'border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] px-3.5 py-2.5 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] bg-white dark:bg-[#161616] ' +
  'placeholder-[#9C9C9C] dark:placeholder-[#6B6B6B] transition-all focus:outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10';

const TH = 'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B]';
const TD = 'px-4 py-3 text-sm';

/**
 * Pill-style multi-select for key groups.
 *
 * Renders each available group as a clickable pill. Selected pills are highlighted
 * and show a checkmark. The parent receives the full array of selected group IDs
 * on every change so the form can send the complete list to the backend.
 */
function MultiSelectGroups({
  groups,
  selected,
  onChange,
  label,
}: {
  groups: KeyGroup[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B]">{label}</label>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const checked = selected.includes(g.id);
          return (
            <label
              key={g.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium cursor-pointer transition-colors select-none border ${
                checked
                  ? 'bg-[#6366F1]/10 border-[#6366F1] text-[#6366F1]'
                  : 'bg-white dark:bg-[#161616] border-[#E8E8EC] dark:border-[#2A2A2A] text-[#6B6B6B] dark:text-[#9C9C9C] hover:border-[#9C9C9C]'
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={checked}
                onChange={() => {
                  if (checked) onChange(selected.filter((id) => id !== g.id));
                  else onChange([...selected, g.id]);
                }}
              />
              {checked && (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {g.name}
            </label>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-[#9C9C9C] dark:text-[#6B6B6B]">No groups selected — token will use the default group.</p>
      )}
    </div>
  );
}

/**
 * Tokens page — CRUD UI for service tokens with many-to-many group bindings.
 *
 * Features:
 *  - Generate new tokens with an optional name and selected key groups.
 *  - Edit existing tokens (name + groups). The backend replaces the full group
 *    list on every save, so the UI simply sends the current selection.
 *  - Revoke / delete tokens.
 *  - Newly generated tokens are shown once in a banner with a copy button.
 */
export default function Tokens() {
  const [tokens, setTokens]       = useState<ServiceToken[]>([]);
  const [groups, setGroups]       = useState<KeyGroup[]>([]);
  const [tokenName, setTokenName] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [newToken, setNewToken]   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editToken, setEditToken] = useState<ServiceToken | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);

  const load = () => {
    API.get('/tokens').then((res) => setTokens(res.data));
    API.get('/groups').then((res) => setGroups(res.data));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const res = await API.post('/tokens', {
      name: tokenName || 'default',
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    });
    setNewToken(res.data.token);
    setTokenName('');
    setSelectedGroupIds([]);
    setShowCreate(false);
    load();
  };

  const saveEdit = async () => {
    if (!editToken) return;
    await API.patch(`/tokens/${editToken.id}`, {
      name: editName,
      groupIds: editGroupIds.length > 0 ? editGroupIds : undefined,
    });
    setEditToken(null);
    setEditName('');
    setEditGroupIds([]);
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

  const openEdit = (t: ServiceToken) => {
    setEditToken(t);
    setEditName(t.name || '');
    setEditGroupIds(t.groups.map((g) => g.groupId));
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] dark:text-[#F0F0F0] tracking-tight">Service Tokens</h1>
          <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mt-1">Bearer tokens for authenticating API requests. Each token can be bound to multiple key groups.</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="mt-1 bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2.5 rounded-[6px] text-sm font-medium
                     transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)]"
        >
          {showCreate ? 'Cancel' : '+ New Token'}
        </button>
      </div>

      {/* New token reveal banner */}
      {newToken && (
        <div className="bg-[#FFFBEB] border border-[#F59E0B]/30 rounded-xl p-5 mb-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-[#0A0A0A] dark:text-[#F0F0F0]">Token generated</p>
              <p className="text-xs text-[#6B6B6B] dark:text-[#9C9C9C] mt-0.5">Copy it now — it will not be shown again.</p>
            </div>
            <button
              onClick={() => setNewToken('')}
              className="text-xs text-[#9C9C9C] dark:text-[#6B6B6B] hover:text-[#6B6B6B] dark:text-[#9C9C9C] transition-colors"
            >
              Dismiss
            </button>
          </div>
          <div className="relative">
            <pre className="bg-[#0A0A0A] text-gray-100 p-4 pr-20 rounded-[8px] text-sm font-mono overflow-x-auto break-all leading-relaxed">
              {newToken}
            </pre>
            <CopyButton text={newToken} variant="dark" />
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-5 mb-5 space-y-4 transition-colors duration-300">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-3">Generate Token</p>
          <input
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            placeholder="Token name (e.g. production, dev)"
            className={INPUT}
          />
          <MultiSelectGroups
            groups={groups}
            selected={selectedGroupIds}
            onChange={setSelectedGroupIds}
            label="Key Groups"
          />
          <div className="flex justify-end">
            <button
              onClick={create}
              className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2.5 rounded-[6px] text-sm font-medium
                         transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)]"
            >
              Generate
            </button>
          </div>
        </div>
      )}

      {/* Edit modal / inline */}
      {editToken && (
        <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-5 mb-5 space-y-4 transition-colors duration-300">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-3">Edit Token</p>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Token name"
            className={INPUT}
          />
          <MultiSelectGroups
            groups={groups}
            selected={editGroupIds}
            onChange={setEditGroupIds}
            label="Key Groups"
          />
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setEditToken(null)}
              className="px-4 py-2.5 rounded-[6px] text-sm font-medium border border-[#E8E8EC] dark:border-[#2A2A2A] text-[#6B6B6B] dark:text-[#9C9C9C] hover:bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2.5 rounded-[6px] text-sm font-medium
                         transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)]"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl overflow-hidden transition-colors duration-300">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-[#FAFAFA] dark:bg-[#0A0A0A] border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
            <tr>
              <th className={TH}>Token</th>
              <th className={TH}>Name</th>
              <th className={TH}>Groups</th>
              <th className={TH}>Status</th>
              <th className={TH}>Created</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8EC]">
            {tokens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#9C9C9C] dark:text-[#6B6B6B]">
                  No tokens yet. Generate one above.
                </td>
              </tr>
            )}
            {tokens.map((t) => (
              <tr key={t.id} className="hover:bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors">
                <td className={TD}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-[#6B6B6B] dark:text-[#9C9C9C] truncate">{t.token.slice(0, 16)}…</span>
                    <CopyButton text={t.token} variant="light" inline />
                  </div>
                </td>
                <td className={`${TD} text-[#6B6B6B] dark:text-[#9C9C9C]`}>{t.name || <span className="text-[#9C9C9C] dark:text-[#6B6B6B]">—</span>}</td>
                <td className={TD}>
                  <div className="flex flex-wrap gap-1.5">
                    {t.groups.length === 0 ? (
                      <span className="text-xs text-[#9C9C9C] dark:text-[#6B6B6B]">default</span>
                    ) : (
                      t.groups.map((tg) => (
                        <span key={tg.id} className="bg-[#F3F4F6] text-[#6B6B6B] dark:text-[#9C9C9C] px-2 py-0.5 rounded-[4px] text-xs font-medium">
                          {tg.group.name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className={TD}>
                  {t.active
                    ? <span className="bg-[#DCFCE7] dark:bg-[#10B981]/15 text-[#10B981] px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-300">Active</span>
                    : <span className="bg-gray-100 dark:bg-white/10 text-[#9C9C9C] dark:text-[#6B6B6B] px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-300">Revoked</span>
                  }
                </td>
                <td className={`${TD} text-[#9C9C9C] dark:text-[#6B6B6B]`}>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className={`${TD} text-right`}>
                  <div className="flex items-center justify-end gap-4">
                    <button
                      onClick={() => openEdit(t)}
                      className="text-sm font-medium text-[#6366F1] hover:text-[#4F46E5] transition-colors"
                    >
                      Edit
                    </button>
                    {t.active && (
                      <button
                        onClick={() => revoke(t.id)}
                        className="text-sm font-medium text-[#EF4444] hover:text-red-700 transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                    <button
                      onClick={() => remove(t.id)}
                      className="text-sm font-medium text-[#9C9C9C] dark:text-[#6B6B6B] hover:text-[#EF4444] transition-colors"
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
      </div>
    </div>
  );
}
