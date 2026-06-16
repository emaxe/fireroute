import { useEffect, useState, useRef, useCallback } from 'react';
import API from '../api/client';

// ── Types ───────────────────────────────────────────────────────────────────────

interface LogItem {
  id: string;
  endpoint: string;
  status: number;
  latencyMs: number;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  createdAt: string;
  token?: { name: string };
  key?: { name: string };
  groupId?: string;
  tokenId?: string;
  keyId?: string;
}

interface LogsResponse {
  data: LogItem[];
  total: number;
  limit: number;
  offset: number;
}

interface DropdownOption { id: string; name: string; token?: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: number }) {
  if (status >= 200 && status < 300) {
    return <span className="font-mono text-xs font-medium px-2 py-0.5 rounded-[4px] bg-[#DCFCE7] dark:bg-[#10B981]/15 text-[#10B981] transition-colors duration-300">{status}</span>;
  }
  if (status >= 300 && status < 400) {
    return <span className="font-mono text-xs font-medium px-2 py-0.5 rounded-[4px] bg-[#FEF9C3] dark:bg-[#F59E0B]/15 text-[#A16207] transition-colors duration-300">{status}</span>;
  }
  if (status >= 400 && status < 500) {
    return <span className="font-mono text-xs font-medium px-2 py-0.5 rounded-[4px] bg-[#FEF2F2] dark:bg-red-500/10 text-[#EF4444] transition-colors duration-300">{status}</span>;
  }
  return <span className="font-mono text-xs font-medium px-2 py-0.5 rounded-[4px] bg-[#FEE2E2] dark:bg-red-500/15 text-[#991B1B] transition-colors duration-300">{status}</span>;
}

function fmtTokens(n?: number): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

const SELECT =
  'border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] px-3 py-2 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] bg-white dark:bg-[#161616] ' +
  'focus:outline-none focus:border-[#6366F1] disabled:opacity-50 disabled:cursor-not-allowed';

const INPUT =
  'border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] px-3 py-2 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] bg-white dark:bg-[#161616] ' +
  'focus:outline-none focus:border-[#6366F1] placeholder:text-[#9C9C9C] dark:text-[#6B6B6B]';

// ── Detail Modal ───────────────────────────────────────────────────────────────

function DetailModal({ log, onClose }: { log: LogItem; onClose: () => void }) {
  if (!log) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#161616] rounded-xl shadow-xl border border-[#E8E8EC] dark:border-[#2A2A2A] w-full max-w-2xl max-h-[90vh] overflow-y-auto transition-colors duration-300">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
          <h3 className="font-semibold text-lg text-[#0A0A0A] dark:text-[#F0F0F0]">Request Detail</h3>
          <button onClick={onClose} className="text-[#9C9C9C] dark:text-[#6B6B6B] hover:text-[#0A0A0A] dark:text-[#F0F0F0] transition-colors text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">ID</p>
              <p className="font-mono text-sm text-[#6B6B6B] dark:text-[#9C9C9C] break-all">{log.id}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Time</p>
              <p className="text-sm text-[#0A0A0A] dark:text-[#F0F0F0]">{new Date(log.createdAt).toLocaleString('ru-RU')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Endpoint</p>
              <p className="font-mono text-sm text-[#0A0A0A] dark:text-[#F0F0F0]">{log.endpoint}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Status</p>
              <p><StatusBadge status={log.status} /></p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Latency</p>
              <p className="font-mono text-sm text-[#0A0A0A] dark:text-[#F0F0F0]">{fmtDuration(log.latencyMs)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">API Key</p>
              <p className="text-sm text-[#0A0A0A] dark:text-[#F0F0F0]">{log.key?.name || log.keyId || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Token</p>
              <p className="text-sm text-[#0A0A0A] dark:text-[#F0F0F0]">{log.token?.name || log.tokenId || '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Prompt Tokens</p>
              <p className="font-mono text-sm text-[#6366F1]">{fmtTokens(log.promptTokens)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Completion Tokens</p>
              <p className="font-mono text-sm text-[#10B981]">{fmtTokens(log.completionTokens)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Total Tokens</p>
              <p className="font-mono text-sm text-[#8B5CF6]">{fmtTokens(log.totalTokens)}</p>
            </div>
          </div>
          {log.error && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] mb-1">Error</p>
              <div className="bg-[#FEF2F2] dark:bg-red-500/10 border border-[#FECACA] dark:border-red-500/20 rounded-lg px-4 py-3 text-sm text-[#EF4444] font-mono whitespace-pre-wrap break-all transition-colors duration-300">
                {log.error}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Logs() {
  // Filters
  const [endpoint, setEndpoint] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [keyId, setKeyId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'latency'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);

  // Data
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<LogItem | null>(null);

  // Dropdowns
  const [keys, setKeys] = useState<DropdownOption[]>([]);
  const [groups, setGroups] = useState<DropdownOption[]>([]);
  const [tokens, setTokens] = useState<DropdownOption[]>([]);
  const [dropLoading, setDropLoading] = useState(true);

  const abortRef = useRef<AbortController | null>(null);

  // Load dropdowns once
  useEffect(() => {
    Promise.allSettled([
      API.get('/keys'),
      API.get('/groups'),
      API.get('/tokens'),
    ]).then(([k, g, t]) => {
      if (k.status === 'fulfilled') setKeys(k.value.data);
      if (g.status === 'fulfilled') setGroups(g.value.data);
      if (t.status === 'fulfilled') setTokens(t.value.data);
      setDropLoading(false);
    });
  }, []);

  const fetchLogs = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    const params: Record<string, string> = {
      limit: String(pageSize),
      offset: String(offset),
      sortBy,
      sortOrder,
    };
    if (endpoint) params.endpoint = endpoint;
    if (statusFilter) params.status = statusFilter;
    if (keyId) params.keyId = keyId;
    if (groupId) params.groupId = groupId;
    if (tokenId) params.tokenId = tokenId;
    if (search) params.search = search;

    API.get('/stats/logs', { params, signal: controller.signal })
      .then((res) => {
        const payload = res.data as LogsResponse;
        setLogs(payload.data || []);
        setTotal(payload.total || 0);
      })
      .catch((err) => { if (err.name !== 'CanceledError') console.error(err); })
      .finally(() => setLoading(false));
  }, [endpoint, statusFilter, keyId, groupId, tokenId, search, sortBy, sortOrder, pageSize, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset pagination when filters change
  const changeFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setOffset(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;

  const pageNumbers = (() => {
    const pages: (number | string)[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    if (start > 1) { pages.push(1); if (start > 2) pages.push('…'); }
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages) { if (end < totalPages - 1) pages.push('…'); pages.push(totalPages); }
    return pages;
  })();

  const TH = 'px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] dark:text-[#6B6B6B] whitespace-nowrap select-none';
  const TD = 'px-3 py-3 text-sm';

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] dark:text-[#F0F0F0] tracking-tight">Request Logs</h1>
        <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mt-1">Detailed gateway proxy requests with filtering and token usage</p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-4 mb-5 transition-colors duration-300">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search endpoint or error..."
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
              className={`${INPUT} w-full sm:w-64`}
            />
            <input
              type="text"
              placeholder="Filter endpoint..."
              value={endpoint}
              onChange={(e) => changeFilter(setEndpoint)(e.target.value)}
              className={`${INPUT} w-full sm:w-48`}
            />
            <select value={statusFilter} onChange={(e) => changeFilter(setStatusFilter)(e.target.value)} className={SELECT}>
              <option value="">All Status</option>
              <option value="200">200 OK</option>
              <option value="400">400 Bad Request</option>
              <option value="401">401 Unauthorized</option>
              <option value="404">404 Not Found</option>
              <option value="500">500 Server Error</option>
              <option value="503">503 Service Unavailable</option>
            </select>
            <select value={keyId} onChange={(e) => changeFilter(setKeyId)(e.target.value)} disabled={dropLoading} className={SELECT}>
              <option value="">All Keys</option>
              {keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <select value={groupId} onChange={(e) => changeFilter(setGroupId)(e.target.value)} disabled={dropLoading} className={SELECT}>
              <option value="">All Groups</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={tokenId} onChange={(e) => changeFilter(setTokenId)(e.target.value)} disabled={dropLoading} className={SELECT}>
              <option value="">All Tokens</option>
              {tokens.map((t) => <option key={t.id} value={t.token}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9C9C9C] dark:text-[#6B6B6B]">Sort:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'createdAt' | 'latency')} className={SELECT}>
                <option value="createdAt">Time</option>
                <option value="latency">Latency</option>
              </select>
              <button
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1.5 text-sm border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] bg-white dark:bg-[#161616] text-[#6B6B6B] dark:text-[#9C9C9C] hover:text-[#0A0A0A] dark:text-[#F0F0F0] transition-colors duration-300"
                title={sortOrder === 'desc' ? 'Descending' : 'Ascending'}
              >
                {sortOrder === 'desc' ? '↓' : '↑'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9C9C9C] dark:text-[#6B6B6B]">Per page:</span>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }} className={SELECT}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </div>
            <span className="text-xs text-[#9C9C9C] dark:text-[#6B6B6B] ml-auto">
              {total.toLocaleString()} total · showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl overflow-hidden transition-colors duration-300">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-[#FAFAFA] dark:bg-[#0A0A0A] border-b border-[#E8E8EC] dark:border-[#2A2A2A] transition-colors duration-300">
              <tr>
                <th className={TH} onClick={() => { setSortBy('createdAt'); setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); }} style={{ cursor: 'pointer' }}>
                  Time {sortBy === 'createdAt' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th className={TH}>Endpoint</th>
                <th className={TH}>Status</th>
                <th className={TH} onClick={() => { setSortBy('latency'); setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); }} style={{ cursor: 'pointer' }}>
                  Latency {sortBy === 'latency' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th className={TH}>Prompt Tokens</th>
                <th className={TH}>Completion Tokens</th>
                <th className={TH}>Total Tokens</th>
                <th className={TH}>Key</th>
                <th className={TH}>Token</th>
                <th className={TH}>Error</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8EC]">
              {loading && logs.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-[#9C9C9C] dark:text-[#6B6B6B]">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-[#9C9C9C] dark:text-[#6B6B6B]">
                    No requests found matching the filters.
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="hover:bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors cursor-pointer"
                  onClick={() => setDetail(l)}
                >
                  <td className={`${TD} text-xs text-[#9C9C9C] dark:text-[#6B6B6B] whitespace-nowrap`}>{fmtTime(l.createdAt)}</td>
                  <td className={`${TD} font-mono text-[#6B6B6B] dark:text-[#9C9C9C] text-xs max-w-[180px] truncate`} title={l.endpoint}>{l.endpoint}</td>
                  <td className={TD}><StatusBadge status={l.status} /></td>
                  <td className={`${TD} text-[#6B6B6B] dark:text-[#9C9C9C] text-xs whitespace-nowrap`}>{fmtDuration(l.latencyMs)}</td>
                  <td className={`${TD} font-mono text-xs text-[#6366F1]`}>{fmtTokens(l.promptTokens)}</td>
                  <td className={`${TD} font-mono text-xs text-[#10B981]`}>{fmtTokens(l.completionTokens)}</td>
                  <td className={`${TD} font-mono text-xs text-[#8B5CF6]`}>{fmtTokens(l.totalTokens)}</td>
                  <td className={`${TD} text-xs text-[#6B6B6B] dark:text-[#9C9C9C]`}>{l.key?.name || <span className="text-[#9C9C9C] dark:text-[#6B6B6B]">—</span>}</td>
                  <td className={`${TD} text-xs text-[#6B6B6B] dark:text-[#9C9C9C]`}>{l.token?.name || <span className="text-[#9C9C9C] dark:text-[#6B6B6B]">—</span>}</td>
                  <td className={`${TD} text-xs max-w-[200px] truncate`}>
                    {l.error ? (
                      <span className="text-[#EF4444]" title={l.error}>{l.error}</span>
                    ) : (
                      <span className="text-[#9C9C9C] dark:text-[#6B6B6B]">—</span>
                    )}
                  </td>
                  <td className={`${TD} text-right`}>
                    <span className="text-xs text-[#6366F1] hover:underline">View</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between mt-4 gap-3">
          <button
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
            disabled={offset === 0}
            className="px-3 py-2 text-sm border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] bg-white dark:bg-[#161616] text-[#0A0A0A] dark:text-[#F0F0F0] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors duration-300"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-1">
            {pageNumbers.map((p, i) => (
              p === '…' ? (
                <span key={`sep-${i}`} className="px-2 text-sm text-[#9C9C9C] dark:text-[#6B6B6B]">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setOffset((Number(p) - 1) * pageSize)}
                  className={`px-3 py-1.5 text-sm rounded-[6px] border ${
                    Number(p) === currentPage
                      ? 'bg-[#6366F1] text-white border-[#6366F1]'
                      : 'bg-white dark:bg-[#161616] text-[#0A0A0A] dark:text-[#F0F0F0] border-[#E8E8EC] dark:border-[#2A2A2A] hover:bg-[#FAFAFA] dark:bg-[#0A0A0A]'
                  }`}
                >
                  {p}
                </button>
              )
            ))}
          </div>
          <button
            onClick={() => setOffset(Math.min(total - (total % pageSize || pageSize), offset + pageSize))}
            disabled={offset + pageSize >= total}
            className="px-3 py-2 text-sm border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] bg-white dark:bg-[#161616] text-[#0A0A0A] dark:text-[#F0F0F0] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors duration-300"
          >
            Next →
          </button>
        </div>
      )}

      {/* Detail modal */}
      {detail && <DetailModal log={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
