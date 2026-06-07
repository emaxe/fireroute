import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent';
import API from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type Range = '24h' | '7d' | '30d' | '90d';

interface TimeseriesBucket {
  time: string;
  requests: number;
  errors: number;
  avgLatency: number;
}

interface BreakdownItem {
  id: string;
  name: string;
  requests: number;
  errors: number;
  avgLatency: number;
}

interface EndpointItem {
  endpoint: string;
  requests: number;
  errors: number;
}

interface AnalyticsData {
  summary:      { total: number; errors: number; avgLatency: number };
  timeseries:   TimeseriesBucket[];
  byKey:        BreakdownItem[];
  byGroup:      BreakdownItem[];
  byToken:      BreakdownItem[];
  topEndpoints: EndpointItem[];
}

interface DropdownOption { id: string; name: string }

// ── Zero-fill utility ─────────────────────────────────────────────────────────

function fillTimeseries(data: TimeseriesBucket[], range: Range): TimeseriesBucket[] {
  const now = new Date();
  const buckets: { key: string; time: string }[] = [];

  if (range === '24h') {
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() - i);
      const key = d.toISOString().slice(0, 13);
      buckets.push({ key, time: key + ':00:00.000Z' });
    }
  } else {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({ key, time: key + 'T00:00:00.000Z' });
    }
  }

  const keyLen = range === '24h' ? 13 : 10;
  const map = new Map(data.map((b) => [b.time.slice(0, keyLen), b]));

  return buckets.map(({ key, time }) =>
    map.get(key) ?? { time, requests: 0, errors: 0, avgLatency: 0 }
  );
}

function fmtTime(iso: string, range: Range): string {
  if (range === '24h') return iso.slice(11, 13) + 'h';
  return iso.slice(5, 10); // MM-DD
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function NoData() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-[#9C9C9C]">
      No data
    </div>
  );
}

function ChartBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-[#E8E8EC] rounded-xl p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-4">{title}</p>
      <div className="h-48">{children}</div>
    </div>
  );
}

function HBar({ data, nameKey }: {
  data: { name?: string; endpoint?: string; requests: number }[];
  nameKey: 'name' | 'endpoint';
}) {
  if (!data.length) return <NoData />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 16 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey={nameKey} width={90} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="requests" fill="#6366F1" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [range, setRange]     = useState<Range>('7d');
  const [keyId, setKeyId]     = useState('');
  const [groupId, setGroupId] = useState('');
  const [tokenId, setTokenId] = useState('');

  const [data, setData]         = useState<AnalyticsData | null>(null);
  const [loading, setLoading]   = useState(false);

  const [keys, setKeys]         = useState<DropdownOption[]>([]);
  const [groups, setGroups]     = useState<DropdownOption[]>([]);
  const [tokens, setTokens]     = useState<DropdownOption[]>([]);
  const [dropLoading, setDropLoading] = useState(true);

  const abortRef    = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load dropdown options once on mount
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

  // Fetch analytics on filter change — abort previous, debounce 300 ms
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      const params: Record<string, string> = { range };
      if (keyId)   params.keyId   = keyId;
      if (groupId) params.groupId = groupId;
      if (tokenId) params.tokenId = tokenId;

      API.get('/stats/analytics', { params, signal: controller.signal })
        .then((res) => setData(res.data))
        .catch((err) => { if (err.name !== 'CanceledError') console.error(err); })
        .finally(() => setLoading(false));
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [range, keyId, groupId, tokenId]);

  const summary  = data?.summary;
  const ts       = data ? fillTimeseries(data.timeseries, range) : [];
  const tsLabels = ts.map((b) => ({ ...b, label: fmtTime(b.time, range) }));

  const errorRate =
    summary && summary.total > 0
      ? (summary.errors / summary.total * 100).toFixed(1) + '%'
      : '—';

  const RANGES: { value: Range; label: string }[] = [
    { value: '24h', label: '24ч' },
    { value: '7d',  label: '7д'  },
    { value: '30d', label: '30д' },
    { value: '90d', label: '90д' },
  ];

  const SELECT =
    'border border-[#E8E8EC] rounded-[6px] px-3 py-2 text-sm text-[#0A0A0A] bg-white ' +
    'focus:outline-none focus:border-[#6366F1] disabled:opacity-50 disabled:cursor-not-allowed';

  const cards = [
    { label: 'Total Requests', value: summary ? summary.total.toLocaleString() : '—',   color: 'text-[#0A0A0A]' },
    { label: 'Errors',         value: summary ? summary.errors.toLocaleString() : '—',  color: summary?.errors ? 'text-[#EF4444]' : 'text-[#0A0A0A]' },
    { label: 'Avg Latency',    value: summary ? `${summary.avgLatency} ms` : '—',        color: 'text-[#0A0A0A]' },
    { label: 'Error Rate',     value: errorRate,                                          color: 'text-[#0A0A0A]' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-semibold text-[28px] text-[#0A0A0A] tracking-tight">Dashboard</h1>
        <p className="text-sm text-[#6B6B6B] mt-1">Gateway usage analytics</p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center bg-white border border-[#E8E8EC] rounded-[8px] overflow-hidden">
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3.5 py-2 text-sm font-medium transition-colors ${
                range === value
                  ? 'bg-[#6366F1] text-white'
                  : 'text-[#6B6B6B] hover:bg-[#FAFAFA]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select value={keyId}   onChange={(e) => setKeyId(e.target.value)}   disabled={dropLoading} className={SELECT}>
          <option value="">All Keys</option>
          {keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>

        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={dropLoading} className={SELECT}>
          <option value="">All Groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        <select value={tokenId} onChange={(e) => setTokenId(e.target.value)} disabled={dropLoading} className={SELECT}>
          <option value="">All Tokens</option>
          {tokens.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        {cards.map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white border border-[#E8E8EC] rounded-xl p-6
                       hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5
                       transition-all duration-200"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-3">{label}</p>
            <p className={`font-display font-bold text-3xl tracking-tight ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Charts — fade during loading */}
      <div style={{ opacity: loading ? 0.4 : 1, transition: 'opacity 0.2s' }}>

        {/* Row 1: timeseries */}
        <div className="grid grid-cols-2 gap-5 mb-5">
          <ChartBox title="Requests over time">
            {tsLabels.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tsLabels}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="requests" fill="#6366F1" name="Requests" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="errors"   fill="#EF4444" name="Errors"   radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBox>

          <ChartBox title="Avg latency (ms)">
            {tsLabels.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tsLabels}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} unit=" ms" />
                  <Tooltip formatter={(v: ValueType) => [`${Number(v)} ms`, 'Avg Latency']} />
                  <Line type="monotone" dataKey="avgLatency" stroke="#6366F1" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>

        {/* Row 2: breakdowns */}
        <div className="grid grid-cols-3 gap-5 mb-5">
          <ChartBox title="By Key">
            <HBar data={data?.byKey ?? []} nameKey="name" />
          </ChartBox>
          <ChartBox title="By Group">
            <HBar data={data?.byGroup ?? []} nameKey="name" />
          </ChartBox>
          <ChartBox title="Top Endpoints">
            <HBar data={data?.topEndpoints ?? []} nameKey="endpoint" />
          </ChartBox>
        </div>

        {/* Row 3: by token */}
        <ChartBox title="By Token">
          <HBar data={data?.byToken ?? []} nameKey="name" />
        </ChartBox>
      </div>
    </div>
  );
}
