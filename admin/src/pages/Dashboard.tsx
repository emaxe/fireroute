import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import API from '../api/client';
import { useTheme } from '../hooks/useTheme';

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
  suspended?: boolean;
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

interface AnalyticsData {
  summary: {
    total: number; errors: number; avgLatency: number;
    promptTokens: number; completionTokens: number; totalTokens: number;
  };
  timeseries:   TimeseriesBucket[];
  byKey:        BreakdownItem[];
  byGroup:      BreakdownItem[];
  byToken:      BreakdownItem[];
  byModel:      BreakdownItem[];
  topEndpoints: EndpointItem[];
}

interface DropdownOption { id: string; name: string; token?: string }

// ── Color tokens (from DESIGN.md) ──────────────────────────────────────────────────────────────────────────────

const C = {
  indigo:   '#6366F1',
  emerald:  '#10B981',
  violet:   '#8B5CF6',
  red:      '#EF4444',
  amber:    '#F59E0B',
  sky:      '#0EA5E9',
  slate:    '#9C9C9C',
  slateLight: '#E8E8EC',
  bg:       '#FAFAFA',
  white:    '#FFFFFF',
};

// ── Zero-fill utility ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the timeseries array has a slot for every expected bucket (hour or day)
 * so that Recharts draws a continuous line even when no requests were logged.
 */
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

/**
 * Compact numeric formatter for chart axes and tooltips.
 * Examples: 1500 → "1.5k", 2_300_000 → "2.3M".
 */
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString();
}

// ── Shared UI primitives ──────────────────────────────────────────────────────────────────────────────────────────────

function NoData({ isDark }: { isDark: boolean }) {
  return (
    <div className={`flex items-center justify-center h-full text-sm ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>
      No data
    </div>
  );
}

function ChartBox({ title, children, className = '', isDark }: { title: string; children: ReactNode; className?: string; isDark: boolean }) {
  return (
    <div className={`bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-5 transition-colors duration-300 ${className}`}>
      <p className={`text-[11px] font-medium uppercase tracking-wider mb-4 ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>{title}</p>
      <div className="h-52">{children}</div>
    </div>
  );
}

function MiniCard({ label, value, color, icon, sub, isDark }: {
  label: string; value: string; color: string; icon?: ReactNode; sub?: string; isDark: boolean;
}) {
  return (
    <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-lg">{icon}</span>}
        <p className={`text-[11px] font-medium uppercase tracking-wider ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>{label}</p>
      </div>
      <p className={`font-display font-bold text-3xl tracking-tight ${color}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>{sub}</p>}
    </div>
  );
}

// ── Custom YAxis tick for suspended keys ────────────────────────────────────────────────────────────────────

function SuspendedKeyTick({ x, y, payload, index, data, isDark }: any) {
  if (payload == null || data == null) return null;
  const item = data[index];
  const isSuspended = item?.suspended ?? false;
  const fill = isSuspended ? '#EF4444' : isDark ? '#F0F0F0' : '#0A0A0A';
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={fill} fontSize={11} fontWeight={isSuspended ? 700 : 400}>
      {payload.value}
    </text>
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

/**
 * Dashboard — analytics overview with live auto-refresh.
 *
 * Features:
 *  - Time range selector (today → 90d) with hour or day bucketing.
 *  - Dropdown filters by API key, key group, and service token.
 *  - Auto-refresh every 5 s in the background (no full-page spinner).
 *  - Zero-filled timeseries so charts never show gaps.
 *  - Token consumption formatted as k/M for readability on axes and tooltips.
 */
export default function Dashboard() {
  const { isDark } = useTheme();
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

  // Fetch on filter change — debounce 300 ms so rapid clicks don't spam the API
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
    'border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[6px] px-3 py-2 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] bg-white dark:bg-[#161616] ' +
    'focus:outline-none focus:border-[#6366F1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300';

  // Token composition pie data
  const pieData = summary && summary.totalTokens > 0
    ? [
        { name: 'Prompt', value: summary.promptTokens, color: C.indigo },
        { name: 'Completion', value: summary.completionTokens, color: C.emerald },
      ]
    : [];

  const chartGridColor = isDark ? '#2A2A2A' : '#F0F0F0';
  const chartAxisColor = isDark ? '#9C9C9C' : '#6B6B6B';

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] dark:text-[#F0F0F0] tracking-tight transition-colors duration-300">Dashboard</h1>
          <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mt-1 transition-colors duration-300">Gateway usage & token consumption analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-medium border transition-colors ${
              autoRefresh
                ? 'bg-[#DCFCE7] dark:bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30 dark:border-[#10B981]/50'
                : 'bg-white dark:bg-[#161616] text-[#9C9C9C] dark:text-[#6B6B6B] border-[#E8E8EC] dark:border-[#2A2A2A] hover:text-[#0A0A0A] dark:hover:text-[#F0F0F0]'
            }`}
            title={autoRefresh ? 'Auto-refresh ON (5 s)' : 'Auto-refresh OFF'}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-[#10B981] animate-pulse' : 'bg-[#9C9C9C]'}`} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          {lastUpdated && (
            <span className="text-[11px] text-[#9C9C9C] dark:text-[#6B6B6B] transition-colors duration-300">
              Updated {lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[8px] overflow-hidden transition-colors duration-300">
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3.5 py-2 text-sm font-medium transition-colors ${
                range === value
                  ? 'bg-[#6366F1] text-white'
                  : 'text-[#6B6B6B] dark:text-[#9C9C9C] hover:bg-[#FAFAFA] dark:hover:bg-white/5'
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
          color="text-[#0A0A0A] dark:text-[#F0F0F0]"
          icon="📊"
          isDark={isDark}
        />
        <MiniCard
          label="Errors"
          value={summary ? summary.errors.toLocaleString() : '—'}
          color={summary?.errors ? 'text-[#EF4444]' : 'text-[#0A0A0A] dark:text-[#F0F0F0]'}
          icon="⚠️"
          sub={errorRate !== '—' ? `${errorRate} of total` : undefined}
          isDark={isDark}
        />
        <MiniCard
          label="Avg Latency"
          value={summary ? `${summary.avgLatency} ms` : '—'}
          color="text-[#0A0A0A] dark:text-[#F0F0F0]"
          icon="⚡"
          isDark={isDark}
        />
        <MiniCard
          label="Error Rate"
          value={errorRate}
          color="text-[#0A0A0A] dark:text-[#F0F0F0]"
          icon="📉"
          isDark={isDark}
        />
        <MiniCard
          label="Prompt Tokens"
          value={summary ? fmtNum(summary.promptTokens) : '—'}
          color="text-[#6366F1]"
          icon="📝"
          sub={summary && summary.totalTokens > 0 ? `${(summary.promptTokens/summary.totalTokens*100).toFixed(1)}%` : undefined}
          isDark={isDark}
        />
        <MiniCard
          label="Completion Tokens"
          value={summary ? fmtNum(summary.completionTokens) : '—'}
          color="text-[#10B981]"
          icon="✍️"
          sub={summary && summary.totalTokens > 0 ? `${(summary.completionTokens/summary.totalTokens*100).toFixed(1)}%` : undefined}
          isDark={isDark}
        />
        <MiniCard
          label="Total Tokens"
          value={summary ? fmtNum(summary.totalTokens) : '—'}
          color="text-[#8B5CF6]"
          icon="📈"
          isDark={isDark}
        />
      </div>

      {/* Charts — fade during loading */}
      <div style={{ opacity: loading ? 0.4 : 1, transition: 'opacity 0.2s' }}>

        {/* Row 0.5: Token consumption by API Key (moved up for visibility) */}
        <ChartBox title="Token consumption by API Key" className="mb-5" isDark={isDark}>
          {(!data?.byKey || data.byKey.length === 0) ? <NoData isDark={isDark} /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byKey} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: chartAxisColor }} tickFormatter={fmtNum} />
                <YAxis dataKey="name" type="category" tick={(props: any) => <SuspendedKeyTick {...props} data={data.byKey} isDark={isDark} />} width={140} interval={0} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="promptTokens"     fill={C.indigo}  name="Prompt"     stackId="a" radius={[2, 0, 0, 2]} />
                <Bar dataKey="completionTokens" fill={C.emerald} name="Completion" stackId="a" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBox>

        {/* Row 0.5: Token consumption by Model */}
        <ChartBox title="Token consumption by Model" className="mb-5" isDark={isDark}>
          {(!data?.byModel || data.byModel.length === 0) ? <NoData isDark={isDark} /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byModel} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: chartAxisColor }} tickFormatter={fmtNum} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: chartAxisColor }} width={140} interval={0} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="promptTokens"     fill={C.indigo}  name="Prompt"     stackId="a" radius={[2, 0, 0, 2]} />
                <Bar dataKey="completionTokens" fill={C.emerald} name="Completion" stackId="a" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBox>

        {/* Row 1: Requests + Latency */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <ChartBox title="Requests over time" isDark={isDark}>
            {tsLabels.length === 0 ? <NoData isDark={isDark} /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tsLabels}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartAxisColor }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: chartAxisColor }} tickFormatter={fmtNum} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="requests" fill={C.indigo} name="Requests" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="errors"   fill={C.red}    name="Errors"   radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBox>

          <ChartBox title="Avg latency (ms)" isDark={isDark}>
            {tsLabels.length === 0 ? <NoData isDark={isDark} /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tsLabels}>
                  <defs>
                    <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.indigo} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.indigo} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartAxisColor }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: chartAxisColor }} unit=" ms" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="avgLatency" stroke={C.indigo} fill="url(#latGrad)" strokeWidth={2} name="Latency" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>

        {/* Row 2: Token usage stacked area + composition pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <ChartBox title="Token usage over time" className="lg:col-span-2" isDark={isDark}>
            {tsLabels.length === 0 ? <NoData isDark={isDark} /> : (
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
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartAxisColor }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: chartAxisColor }} tickFormatter={fmtNum} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="promptTokens"     stackId="1" stroke={C.indigo}  fill="url(#promptGrad)" strokeWidth={2} name="Prompt" />
                  <Area type="monotone" dataKey="completionTokens" stackId="1" stroke={C.emerald} fill="url(#compGrad)"    strokeWidth={2} name="Completion" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartBox>

          <ChartBox title="Token composition" isDark={isDark}>
            {pieData.length === 0 ? <NoData isDark={isDark} /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    iconSize={10}
                    wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>

        {/* Row 3: Breakdown tables + endpoints */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <BreakdownTable
            title="Top API Keys"
            data={data?.byKey}
            isDark={isDark}
          />
          <BreakdownTable
            title="Top Groups"
            data={data?.byGroup}
            isDark={isDark}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <BreakdownTable
            title="Top Service Tokens"
            data={data?.byToken}
            isDark={isDark}
          />
          <EndpointTable
            title="Top Endpoints"
            data={data?.topEndpoints}
            isDark={isDark}
          />
        </div>
      </div>
    </div>
  );
}

// ── Table components ────────────────────────────────────────────────────────────────────────────────────────────────

function BreakdownTable({ title, data, isDark }: { title: string; data?: BreakdownItem[]; isDark: boolean }) {
  if (!data || data.length === 0) return (
    <div className={`bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-5 transition-colors duration-300`}>
      <p className={`text-[11px] font-medium uppercase tracking-wider mb-4 ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>{title}</p>
      <NoData isDark={isDark} />
    </div>
  );

  return (
    <div className={`bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl overflow-hidden transition-colors duration-300`}>
      <p className={`px-5 pt-5 text-[11px] font-medium uppercase tracking-wider ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className={`border-b border-[#E8E8EC] dark:border-[#2A2A2A] ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>
              <th className="px-5 py-2 text-left font-medium">Name</th>
              <th className="px-5 py-2 text-right font-medium">Req</th>
              <th className="px-5 py-2 text-right font-medium">Err</th>
              <th className="px-5 py-2 text-right font-medium">Avg ms</th>
              <th className="px-5 py-2 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b border-[#E8E8EC] dark:border-[#2A2A2A] last:border-0 transition-colors">
                <td className={`px-5 py-2.5 font-medium transition-colors ${row.suspended ? 'text-[#EF4444]' : 'text-[#0A0A0A] dark:text-[#F0F0F0]'}`}>
                  {row.name}
                  {row.suspended && <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wider text-[#EF4444]/70">(Suspended)</span>}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{row.requests.toLocaleString()}</td>
                <td className={`px-5 py-2.5 text-right tabular-nums ${row.errors > 0 ? 'text-[#EF4444]' : ''}`}>{row.errors}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{Math.round(row.avgLatency)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{fmtNum(row.totalTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EndpointTable({ title, data, isDark }: { title: string; data?: EndpointItem[]; isDark: boolean }) {
  if (!data || data.length === 0) return (
    <div className={`bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-5 transition-colors duration-300`}>
      <p className={`text-[11px] font-medium uppercase tracking-wider mb-4 ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>{title}</p>
      <NoData isDark={isDark} />
    </div>
  );

  return (
    <div className={`bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl overflow-hidden transition-colors duration-300`}>
      <p className={`px-5 pt-5 text-[11px] font-medium uppercase tracking-wider ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className={`border-b border-[#E8E8EC] dark:border-[#2A2A2A] ${isDark ? 'text-[#6B6B6B]' : 'text-[#9C9C9C]'}`}>
              <th className="px-5 py-2 text-left font-medium">Endpoint</th>
              <th className="px-5 py-2 text-right font-medium">Req</th>
              <th className="px-5 py-2 text-right font-medium">Err</th>
              <th className="px-5 py-2 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.endpoint} className="border-b border-[#E8E8EC] dark:border-[#2A2A2A] last:border-0 transition-colors">
                <td className="px-5 py-2.5 font-medium text-[#0A0A0A] dark:text-[#F0F0F0] transition-colors font-mono text-xs">{row.endpoint}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{row.requests.toLocaleString()}</td>
                <td className={`px-5 py-2.5 text-right tabular-nums ${row.errors > 0 ? 'text-[#EF4444]' : ''}`}>{row.errors}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{fmtNum(row.totalTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
