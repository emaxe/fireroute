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

const INPUT =
  'border border-[#E8E8EC] rounded-[6px] px-3.5 py-2.5 text-sm text-[#0A0A0A] bg-white ' +
  'placeholder-[#9C9C9C] transition-all focus:outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10';

const TH = 'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C]';
const TD = 'px-4 py-3 text-sm';

export default function Tokens() {
  const [tokens, setTokens]       = useState<ServiceToken[]>([]);
  const [tokenName, setTokenName] = useState('');
  const [newToken, setNewToken]   = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = () => API.get('/tokens').then((res) => setTokens(res.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    const res = await API.post('/tokens', { name: tokenName || 'default' });
    setNewToken(res.data.token);
    setTokenName('');
    setShowCreate(false);
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
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display font-semibold text-[28px] text-[#0A0A0A] tracking-tight">Service Tokens</h1>
          <p className="text-sm text-[#6B6B6B] mt-1">Bearer tokens for authenticating API requests</p>
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
              <p className="text-sm font-semibold text-[#0A0A0A]">Token generated</p>
              <p className="text-xs text-[#6B6B6B] mt-0.5">Copy it now — it will not be shown again.</p>
            </div>
            <button
              onClick={() => setNewToken('')}
              className="text-xs text-[#9C9C9C] hover:text-[#6B6B6B] transition-colors"
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
        <div className="bg-white border border-[#E8E8EC] rounded-xl p-5 mb-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-3">Generate Token</p>
          <div className="flex gap-3">
            <input
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="Token name (e.g. production, dev)"
              className={`${INPUT} flex-1`}
            />
            <button
              onClick={create}
              className="shrink-0 bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2.5 rounded-[6px] text-sm font-medium
                         transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.35)]"
            >
              Generate
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-[#E8E8EC] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#FAFAFA] border-b border-[#E8E8EC]">
            <tr>
              <th className={TH}>Token</th>
              <th className={TH}>Name</th>
              <th className={TH}>Status</th>
              <th className={TH}>Created</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8EC]">
            {tokens.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#9C9C9C]">
                  No tokens yet. Generate one above.
                </td>
              </tr>
            )}
            {tokens.map((t) => (
              <tr key={t.id} className="hover:bg-[#FAFAFA] transition-colors">
                <td className={TD}>
                  <div className="relative pr-16 w-52">
                    <span className="text-sm font-mono text-[#6B6B6B]">{t.token.slice(0, 16)}…</span>
                    <CopyButton text={t.token} variant="light" />
                  </div>
                </td>
                <td className={`${TD} text-[#6B6B6B]`}>{t.name || <span className="text-[#9C9C9C]">—</span>}</td>
                <td className={TD}>
                  {t.active
                    ? <span className="bg-[#DCFCE7] text-[#10B981] px-2.5 py-0.5 rounded-full text-xs font-medium">Active</span>
                    : <span className="bg-gray-100 text-[#9C9C9C] px-2.5 py-0.5 rounded-full text-xs font-medium">Revoked</span>
                  }
                </td>
                <td className={`${TD} text-[#9C9C9C]`}>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className={`${TD} text-right`}>
                  <div className="flex items-center justify-end gap-4">
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
                      className="text-sm font-medium text-[#9C9C9C] hover:text-[#EF4444] transition-colors"
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
  );
}
