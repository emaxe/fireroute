import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import API from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Range = 'today' | '24h' | '7d' | '30d' | '90d';

interface TimeseriesBucket {
  time: string;
  requests: number;
  errors: number;
  avgLatency: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface BreakdownItem {
  id: string;
  name: string;
  requests: number;
  errors: number;
  avgLatency: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface EndpointItem {
  endpoint: string;
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ImageGenerationBucket {
  time: string;
  requests: number;
  errors: number;
  avgLatency: number;
}

interface ImageGenerationAnalytics {
  summary: {
    total: number;
    errors: number;
    avgLatency: number;
  };
  timeseries: ImageGenerationBucket[];
}

interface AnalyticsData {
  summary: {
    total: number; errors: number; avgLatency: number;
    promptTokens: number; completionTokens: number; totalTokens: number;
  };
  timeseries:   TimeseriesBucket[];
  byKey:        BreakdownItem[];
  byGroup:      BreakdownItem[];
  byToken:      BreakdownItem[];
  topEndpoints: EndpointItem[];
  imageGeneration: ImageGenerationAnalytics;
}

interface DropdownOption { id: string; name: string }

// ── Color tokens (from DESIGN.md) ──────────────────────────────────────────────────────────────────────────────

const C = {
  indigo:   '#6366F1',
  emerald:  '#10B981',
  violet:   '#8B5CF6',
  red:      '#EF4444',
  amber:    '#F59E0B',
  sky:      '#0EA5E9',
  pink:     '#EC4899',
  slate:    '#9C9C9C',
  slateLight: '#E8E8EC',
  bg:       '#FAFAFA',
  white:    '#FFFFFF',
};

// ── Zero-fill utility ──────────────────────────────────────────────────────────────────────────────────────────────

function fillTimeseries(data: TimeseriesBucket[], range: Range): TimeseriesBucket[] {
  const now = new Date();
  const buckets: { key: string; time: string }[] = [];

  if (range === '24h' || range === 'today') {
    const limit = range === 'today' ? now.getUTCHours() : 23;
    for (let i = limit; i >= 0; i--) {
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

  const keyLen = range === '24h' || range === 'today' ? 13 : 10;
  const map = new Map(data.map((b) => [b.time.slice(0, keyLen), b]));

  return buckets.map(({ key, time }) =>
    map.get(key) ?? { time, requests: 0, errors: 0, avgLatency: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
}

function fmtTime(iso: string, range: Range): string {
  if (range === '24h' || range === 'today') return iso.slice(11, 13) + 'h';
  return iso.slice(5, 10); // MM-DD
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString();
}

// ── Shared UI primitives ──────────────────────────────────────────────────────────────────────────────────────────────

function NoData() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-[#9C9C9C]">
      No data
    </div>
  );
}

function ChartBox({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[#E8E8EC] rounded-xl p-5 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-4">{title}</p>
      <div className="h-52">{children}</div>
    </div>
  );
}

function MiniCard({ label, value, color, icon, sub }: {
  label: string; value: string; color: string; icon?: ReactNode; sub?: string;
}) {
  return (
    <div className="bg-white border border-[#E8E8EC] rounded-xl p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-lg">{icon}</span>}
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C]">{label}</p>
      </div>
      <p className={`font-display font-bold text-3xl tracking-tight ${color}`}>{value}</p>
      {sub && <p className="text-xs text-[#9C9C9C] mt-1">{sub}</p>}
    </div>
  );
}

// ── Custom Tooltip for Recharts ────────────────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0A0A0A] text-white text-xs rounded-lg px-3 py-2 shadow-xl border border-[#2A2A2A]">
      <p className="font-medium mb-1.5 text-[#9C9C9C]">{label}</p>
      <div className="flex flex-col gap-1">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="flex-1">{p.name}:</span>
            <span className="font-mono font-medium">{fmtNum(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [range, setRange]     = useState<Range>('7d');
  const [keyId, setKeyId]     = useState('');
  const [groupId, setGroupId] = useState('');
  const [tokenId, setTokenId] = useState('');

  const [data, setData]         = useState<AnalyticsData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  // Fetch function — memoised so interval always calls the latest version
  const fetchData = useCallback((showLoading = true) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (showLoading) setLoading(true);
    const params: Record<string, string> = { range };
    if (keyId)   params.keyId   = keyId;
    if (groupId) params.groupId = groupId;
    if (tokenId) params.tokenId = tokenId;

    API.get('/stats/analytics', { params, signal: controller.signal })
      .then((res) => { setData(res.data); setLastUpdated(new Date()); })
      .catch((err) => { if (err.name !== 'CanceledError') console.error(err); })
      .finally(() => { if (showLoading) setLoading(false); });
  }, [range, keyId, groupId, tokenId]);

  // Fetch on filter change — debounce 300 ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(true), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchData]);

  // Auto-refresh every 5 s (background refresh, no full loading spinner)
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchData(false), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  const summary  = data?.summary;
  const ts       = data ? fillTimeseries(data.timeseries, range) : [];
  const tsLabels = ts.map((b) => ({ ...b, label: fmtTime(b.time, range) }));

  const errorRate =
    summary && summary.total > 0
      ? (summary.errors / summary.total * 100).toFixed(1) + '%'
      : '—';

  const RANGES: { value: Range; label: string }[] = [
    { value: 'today', label: 'Сегодня' },
    { value: '24h', label: '24ч' },
    { value: '7d',  label: '7д'  },
    { value: '30d', label: '30д' },
    { value: '90d', label: '90д' },
  ];

  const SELECT =
    'border border-[#E8E8EC] rounded-[6px] px-3 py-2 text-sm text-[#0A0A0A] bg-white ' +
    'focus:outline-none focus:border-[#6366F1] disabled:opacity-50 disabled:cursor-not-allowed';

  // Token composition pie data
  const pieData = summary && summary.totalTokens > 0
    ? [
        { name: 'Prompt', value: summary.promptTokens, color: C.indigo },
        { name: 'Completion', value: summary.completionTokens, color: C.emerald },
      ]
    : [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] tracking-tight">Dashboard</h1>
          <p className="text-sm text-[#6B6B6B] mt-1">Gateway usage & token consumption analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-medium border transition-colors ${
              autoRefresh
                ? 'bg-[#DCFCE7] text-[#10B981] border-[#10B981]/30'
                : 'bg-white text-[#9C9C9C] border-[#E8E8EC] hover:text-[#0A0A0A]'
            }`}
            title={autoRefresh ? 'Auto-refresh ON (5 s)' : 'Auto-refresh OFF'}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-[#10B981] animate-pulse' : 'bg-[#9C9C9C]'}`} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          {lastUpdated && (
            <span className="text-[11px] text-[#9C9C9C]">
              Updated {lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
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

      {/* Stat cards — 7-column grid on xl, responsive down */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mb-6">
        <MiniCard
          label="Total Requests"
          value={summary ? summary.total.toLocaleString() : '—'}
          color="text-[#0A0A0A]"
          icon="📊"
        />
        <MiniCard
          label="Errors"
          value={summary ? summary.errors.toLocaleString() : '—'}
          color={summary?.errors ? 'text-[#EF4444]' : 'text-[#0A0A0A]'}
          icon="⚠️"
          sub={errorRate !== '—' ? `${errorRate} of total` : undefined}
        />
        <MiniCard
          label="Avg Latency"
          value={summary ? `${summary.avgLatency} ms` : '—'}
          color="text-[#0A0A0A]"
          icon="⚡"
        />
        <MiniCard
          label="Error Rate"
          value={errorRate}
          color="text-[#0A0A0A]"
          icon="📉"
        />
        <MiniCard
          label="Prompt Tokens"
          value={summary ? fmtNum(summary.promptTokens) : '—'}
          color="text-[#6366F1]"
          icon="📝"
          sub={summary && summary.totalTokens > 0 ? `${(summary.promptTokens/summary.totalTokens*100).toFixed(1)}%` : undefined}
        />
        <MiniCard
          label="Completion Tokens"
          value={summary ? fmtNum(summary.completionTokens) : '—'}
          color="text-[#10B981]"
          icon="✍️"
          sub={summary && summary.totalTokens > 0 ? `${(summary.completionTokens/summary.totalTokens*100).toFixed(1)}%` : undefined}
        />
        <MiniCard
          label="Total Tokens"
          value={summary ? fmtNum(summary.totalTokens) : '—'}
          color="text-[#8B5CF6]"
          icon="📈"
        />
      </div>

      {/* Charts — fade during loading */}
      <div style={{ opacity: loading ? 0.4 : 1, transition: 'opacity 0.2s' }}>

        {/* Row 1: Requests + Latency */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <ChartBox title="Requests over time">
            {tsLabels.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tsLabels}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="requests" fill={C.indigo} name="Requests" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="errors"   fill={C.red}    name="Errors"   radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBox>

          <ChartBox title="Avg latency (ms)">
            {tsLabels.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tsLabels}>
                  <defs>
                    <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.indigo} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.indigo} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} unit=" ms" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="avgLatency" stroke={C.indigo} fill="url(#latGrad)" strokeWidth={2} name="Latency" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>

        {/* Row 2: Token usage stacked area + composition pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <ChartBox title="Token usage over time" className="lg:col-span-2">
            {tsLabels.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tsLabels}>
                  <defs>
                    <linearGradient id="promptGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.indigo} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={C.indigo} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.emerald} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={C.emerald} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="promptTokens"     stackId="1" stroke={C.indigo}  fill="url(#promptGrad)" strokeWidth={2} name="Prompt" />
                  <Area type="monotone" dataKey="completionTokens" stackId="1" stroke={C.emerald} fill="url(#compGrad)"    strokeWidth={2} name="Completion" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartBox>

          <ChartBox title="Token composition">
            {pieData.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>

        {/* Row 2.5: Token consumption by API Key */}
        <ChartBox title="Token consumption by API Key" className="mb-5">
          {(!data?.byKey || data.byKey.length === 0) ? <NoData /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byKey} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={140} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="promptTokens"     fill={C.indigo}  name="Prompt"     stackId="a" radius={[2, 0, 0, 2]} />
                <Bar dataKey="completionTokens" fill={C.emerald} name="Completion" stackId="a" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBox>

        {/* Row 3: Breakdown tables — rich colored bars + token counts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <BreakdownCard title="By Key" data={data?.byKey ?? []} />
          <BreakdownCard title="By Group" data={data?.byGroup ?? []} />
          <BreakdownCard title="By Token" data={data?.byToken ?? []} />
        </div>

        {/* Row 4: Top endpoints */}
        <ChartBox title="Top Endpoints" className="mb-5">
          <EndpointTable data={data?.topEndpoints ?? []} />
        </ChartBox>

        {/* Row 5: Image Generation */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🖼️</span>
            <h2 className="text-lg font-semibold text-[#0A0A0A]">Image Generation</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <MiniCard
              label="Total Requests"
              value={data?.imageGeneration?.summary ? data.imageGeneration.summary.total.toLocaleString() : '—'}
              color="text-[#0A0A0A]"
              icon="🖼️"
            />
            <MiniCard
              label="Errors"
              value={data?.imageGeneration?.summary ? data.imageGeneration.summary.errors.toLocaleString() : '—'}
              color={data?.imageGeneration?.summary && data.imageGeneration.summary.errors > 0 ? 'text-[#EF4444]' : 'text-[#0A0A0A]'}
              icon="⚠️"
            />
            <MiniCard
              label="Avg Latency"
              value={data?.imageGeneration?.summary ? `${data.imageGeneration.summary.avgLatency} ms` : '—'}
              color="text-[#0A0A0A]"
              icon="⚡"
            />
          </div>
          <ChartBox title="Image requests over time">
            {(!data?.imageGeneration?.timeseries || data.imageGeneration.timeseries.length === 0) ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.imageGeneration.timeseries.map((b) => ({ ...b, label: fmtTime(b.time, range) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="requests" fill={C.pink} name="Requests" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="errors"   fill={C.red}   name="Errors"   radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>
      </div>
    </div>
  );
}

// ── Rich breakdown card with colored mini-bars ───────────────────────────────────────────────────────────────────────────────────────────

function BreakdownCard({ title, data }: { title: string; data: BreakdownItem[] }) {
  if (!data.length) {
    return (
      <div className="bg-white border border-[#E8E8EC] rounded-xl p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-4">{title}</p>
        <NoData />
      </div>
    );
  }
  const maxReq = Math.max(...data.map((d) => d.requests));
  return (
    <div className="bg-white border border-[#E8E8EC] rounded-xl p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-4">{title}</p>
      <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
        {data.map((item) => {
          const pct = maxReq > 0 ? (item.requests / maxReq) * 100 : 0;
          const errPct = item.requests > 0 ? (item.errors / item.requests) * 100 : 0;
          return (
            <div key={item.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[#0A0A0A] truncate max-w-[55%]">{item.name || item.id.slice(0, 8)}</span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[#6366F1]">{item.requests.toLocaleString()} req</span>
                  {item.errors > 0 && (
                    <span className="font-mono text-[#EF4444]">{item.errors} err</span>
                  )}
                </div>
              </div>
              {/* Stacked mini bar: prompt (indigo) + completion (emerald) + errors (red) */}
              <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden flex">
                {item.totalTokens > 0 && (
                  <>
                    <div
                      className="h-full bg-[#6366F1]"
                      style={{ width: `${(item.promptTokens / item.totalTokens) * pct}%` }}
                    />
                    <div
                      className="h-full bg-[#10B981]"
                      style={{ width: `${(item.completionTokens / item.totalTokens) * pct}%` }}
                    />
                  </>
                )}
                {item.errors > 0 && (
                  <div className="h-full bg-[#EF4444]" style={{ width: `${errPct}%` }} />
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-[#9C9C9C]">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6366F1]" />
                  {fmtNum(item.promptTokens)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                  {fmtNum(item.completionTokens)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
                  {fmtNum(item.totalTokens)} total
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Endpoint table ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function EndpointTable({ data }: { data: EndpointItem[] }) {
  if (!data.length) return <NoData />;
  const maxReq = Math.max(...data.map((d) => d.requests));
  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        {data.map((item) => {
          const pct = maxReq > 0 ? (item.requests / maxReq) * 100 : 0;
          return (
            <div key={item.endpoint} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-xs font-mono text-[#6B6B6B] truncate">{item.endpoint}</div>
              <div className="flex-1 h-6 bg-[#F0F0F0] rounded-md overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 bg-[#6366F1] rounded-md transition-all" style={{ width: `${pct}%` }} />
                <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-medium text-[#0A0A0A]">
                  <span>{item.requests.toLocaleString()}</span>
                  {item.errors > 0 && <span className="text-[#EF4444]">{item.errors} err</span>}
                </div>
              </div>
              <div className="w-24 text-right text-[10px] text-[#9C9C9C] shrink-0">
                {item.totalTokens > 0 ? fmtNum(item.totalTokens) + ' tok' : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
