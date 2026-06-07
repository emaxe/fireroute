# Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add analytics charts with time/key/group/token filters to the Dashboard page.

**Architecture:** New `GET /api/v1/admin/stats/analytics` endpoint returns all aggregations in one response (timeseries, per-key, per-group, per-token, top endpoints). Dashboard is fully rewritten to show a filter bar, 4 stat cards, and 6 Recharts charts. No DB schema changes.

**Tech Stack:** Fastify + Prisma (`$queryRaw`) on backend; React + Recharts ^2.12.0 + Tailwind on frontend.

**Spec:** `docs/superpowers/specs/2026-06-07-analytics-dashboard-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `gateway/src/services/stats-service.ts` | Add `getAnalytics()` with all raw SQL queries |
| Modify | `gateway/src/routes/admin/stats.ts` | Add `GET /analytics` route with validation |
| Rewrite | `admin/src/pages/Dashboard.tsx` | Filter bar, stat cards, 6 charts, zero-fill logic |
| Modify | `admin/package.json` | Add `recharts ^2.12.0` |

---

## Task 1: Install recharts

**Files:**
- Modify: `admin/package.json`

- [ ] **Step 1: Add recharts to dependencies**

In `admin/package.json`, add to `"dependencies"`:
```json
"recharts": "^2.12.0"
```

- [ ] **Step 2: Install**

```bash
cd admin && npm install
```

Expected: `recharts` appears in `node_modules/recharts`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add admin/package.json admin/package-lock.json
git commit -m "feat: add recharts dependency"
```

---

## Task 2: Backend — `getAnalytics()` service method

**Files:**
- Modify: `gateway/src/services/stats-service.ts`

**Context:**
- `Prisma.sql\`...\`` builds a safe parameterized SQL fragment.
- `Prisma.join(arr, ' AND ', 'WHERE ', '')` produces `WHERE a AND b` or an empty fragment if `arr` is empty.
- **Important:** The NOT NULL checks for `byKey`/`byGroup`/`byToken` must be pushed into the `conditions` array for each sub-query so they are always included in the WHERE clause. They cannot be appended after `${where}` because an empty `where` fragment would produce bare `AND ...` without `WHERE`.
- PostgreSQL `COUNT()` returns `bigint` in Prisma raw results — always convert with `Number()`.
- Use `::float8` (not `::numeric`) in SQL so Prisma maps the result to a JS `number`, not a Decimal object.

- [ ] **Step 1: Update the import at the top of `gateway/src/services/stats-service.ts`**

Change line 1 from:
```typescript
import { PrismaClient } from '@prisma/client';
```
to:
```typescript
import { PrismaClient, Prisma } from '@prisma/client';
```

- [ ] **Step 2: Add the `getAnalytics` method to `StatsService`**

In `gateway/src/services/stats-service.ts`, add after the existing `getRecentLogs` method, before the closing `};`:

```typescript
  async getAnalytics(params: {
    startTime: Date;
    bucketFn: 'hour' | 'day';
    keyId?: string;
    groupId?: string;
    tokenId?: string;
  }) {
    const { startTime, bucketFn, keyId, groupId, tokenId } = params;

    // Shared time + optional filter conditions (re-used by each query)
    const baseConditions = (): Prisma.Sql[] => {
      const c: Prisma.Sql[] = [Prisma.sql`created_at >= ${startTime}`];
      if (keyId)   c.push(Prisma.sql`key_id   = ${keyId}`);
      if (groupId) c.push(Prisma.sql`group_id = ${groupId}`);
      if (tokenId) c.push(Prisma.sql`token_id = ${tokenId}`);
      return c;
    };

    const bucketExpr = bucketFn === 'hour'
      ? Prisma.sql`date_trunc('hour', created_at)`
      : Prisma.sql`date_trunc('day',  created_at)`;

    // Helper to convert bigint → number
    const n = (v: bigint | number) => Number(v);

    // ── Summary ──────────────────────────────────────────────────────────────
    const where = Prisma.join(baseConditions(), ' AND ', 'WHERE ', '');

    const [summaryRow] = await prisma.$queryRaw<
      { total: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(CASE WHEN status >= 400 THEN 1 END)            AS errors,
        COALESCE(AVG(latency_ms)::float8, 0)                 AS avg_latency
      FROM request_logs
      ${where}
    `;

    // ── Timeseries ────────────────────────────────────────────────────────────
    const timeseriesRows = await prisma.$queryRaw<
      { time: Date; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        ${bucketExpr}                                         AS time,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN status >= 400 THEN 1 END)            AS errors,
        COALESCE(AVG(latency_ms)::float8, 0)                 AS avg_latency
      FROM request_logs
      ${where}
      GROUP BY ${bucketExpr}
      ORDER BY time ASC
    `;

    // ── byKey (only rows where key_id IS NOT NULL) ────────────────────────────
    const keyConditions = [...baseConditions(), Prisma.sql`r.key_id IS NOT NULL`];
    const byKeyRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        r.key_id                                              AS id,
        COALESCE(ak.name, r.key_id)                          AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency
      FROM request_logs r
      LEFT JOIN api_keys ak ON ak.id = r.key_id
      ${Prisma.join(keyConditions, ' AND ', 'WHERE ', '')}
      GROUP BY r.key_id, ak.name
      ORDER BY requests DESC
      LIMIT 10
    `;

    // ── byGroup ───────────────────────────────────────────────────────────────
    const groupConditions = [...baseConditions(), Prisma.sql`r.group_id IS NOT NULL`];
    const byGroupRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        r.group_id                                            AS id,
        COALESCE(kg.name, r.group_id)                        AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency
      FROM request_logs r
      LEFT JOIN LATERAL (
        SELECT name FROM key_groups
        WHERE id = r.group_id OR name = r.group_id
        LIMIT 1
      ) kg ON true
      ${Prisma.join(groupConditions, ' AND ', 'WHERE ', '')}
      GROUP BY r.group_id, kg.name
      ORDER BY requests DESC
      LIMIT 10
    `;

    // ── byToken ───────────────────────────────────────────────────────────────
    const tokenConditions = [...baseConditions(), Prisma.sql`r.token_id IS NOT NULL`];
    const byTokenRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        r.token_id                                            AS id,
        COALESCE(st.name, st.id)                             AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency
      FROM request_logs r
      LEFT JOIN service_tokens st ON st.id = r.token_id
      ${Prisma.join(tokenConditions, ' AND ', 'WHERE ', '')}
      GROUP BY r.token_id, st.name, st.id
      ORDER BY requests DESC
      LIMIT 10
    `;

    // ── topEndpoints ──────────────────────────────────────────────────────────
    const endpointRows = await prisma.$queryRaw<
      { endpoint: string; requests: bigint; errors: bigint }[]
    >`
      SELECT
        endpoint,
        COUNT(*)                                    AS requests,
        COUNT(CASE WHEN status >= 400 THEN 1 END)   AS errors
      FROM request_logs
      ${where}
      GROUP BY endpoint
      ORDER BY requests DESC
      LIMIT 10
    `;

    return {
      summary: {
        total:      n(summaryRow.total),
        errors:     n(summaryRow.errors),
        avgLatency: Math.round(summaryRow.avg_latency),
      },
      timeseries: timeseriesRows.map((r) => ({
        time:       r.time.toISOString(),
        requests:   n(r.requests),
        errors:     n(r.errors),
        avgLatency: Math.round(r.avg_latency),
      })),
      byKey: byKeyRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
      })),
      byGroup: byGroupRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
      })),
      byToken: byTokenRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
      })),
      topEndpoints: endpointRows.map((r) => ({
        endpoint: r.endpoint,
        requests: n(r.requests),
        errors:   n(r.errors),
      })),
    };
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd gateway && npx tsc --noEmit
```

Expected: no errors. Fix any type issues before proceeding.

- [ ] **Step 4: Commit**

```bash
cd ..
git add gateway/src/services/stats-service.ts
git commit -m "feat: add getAnalytics() to StatsService with raw SQL aggregations"
```

---

## Task 3: Backend — `GET /analytics` route

**Files:**
- Modify: `gateway/src/routes/admin/stats.ts`

**Context:**
- `request_logs.key_id`, `group_id`, `token_id` are all `TEXT` columns (not PostgreSQL UUID type), so passing any string as a filter is valid SQL — it simply returns 0 matching rows for an unrecognised value. This is the correct "no-match" behaviour the spec requires for invalid filter values.
- Pass raw filter values directly to `getAnalytics` — no UUID validation needed at the route level.
- The `try/catch` is kept for unexpected SQL errors (e.g. DB connectivity) and returns a safe empty response.

- [ ] **Step 1: Add the route**

In `gateway/src/routes/admin/stats.ts`, add before the closing `}` of `statsRoutes`:

```typescript
  server.get('/analytics', { onRequest: server.authenticate }, async (request, reply) => {
    const { range = '7d', keyId, groupId, tokenId } = request.query as {
      range?: string;
      keyId?: string;
      groupId?: string;
      tokenId?: string;
    };

    const validRanges = ['24h', '7d', '30d', '90d'] as const;
    if (!validRanges.includes(range as typeof validRanges[number])) {
      return reply.status(400).send({ error: 'Invalid range' });
    }

    const typedRange = range as '24h' | '7d' | '30d' | '90d';
    const rangeMs: Record<typeof typedRange, number> = {
      '24h':  24 * 60 * 60 * 1000,
      '7d':    7 * 24 * 60 * 60 * 1000,
      '30d':  30 * 24 * 60 * 60 * 1000,
      '90d':  90 * 24 * 60 * 60 * 1000,
    };

    const startTime = new Date(Date.now() - rangeMs[typedRange]);
    const bucketFn  = typedRange === '24h' ? 'hour' : 'day';

    const emptyResponse = {
      summary: { total: 0, errors: 0, avgLatency: 0 },
      timeseries: [], byKey: [], byGroup: [], byToken: [], topEndpoints: [],
    };

    try {
      return await StatsService.getAnalytics({
        startTime,
        bucketFn,
        keyId:   keyId   || undefined,
        groupId: groupId || undefined,
        tokenId: tokenId || undefined,
      });
    } catch {
      return emptyResponse;
    }
  });
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd gateway && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the gateway and verify the endpoint**

```bash
cd ..
(cd gateway && npm run dev) &
sleep 4

TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@firegate.local","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token: ${TOKEN:0:20}..."
[ -z "$TOKEN" ] && echo "ERROR: empty token — check gateway logs" && exit 1

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/admin/stats/analytics?range=7d" \
  | python3 -m json.tool | head -30
```

Expected: JSON with `summary`, `timeseries`, `byKey`, `byGroup`, `byToken`, `topEndpoints`.

- [ ] **Step 4: Verify range validation**

```bash
# Invalid range → 400
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/admin/stats/analytics?range=99d"
```

Expected: `400`.

- [ ] **Step 5: Verify unrecognised filter value returns 200 with no matching rows**

`request_logs.key_id` is TEXT, so `keyId=not-a-uuid` is valid SQL — it just matches no rows.

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/admin/stats/analytics?range=7d&keyId=not-a-uuid" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('status 200, byKey:', d['byKey'])"
```

Expected: 200, `byKey: []` (no rows match `key_id = 'not-a-uuid'`). Other breakdown arrays may be non-empty if unfiltered rows exist.

- [ ] **Step 6: Stop dev server and commit**

```bash
kill %1 2>/dev/null || true
cd ..
git add gateway/src/routes/admin/stats.ts
git commit -m "feat: add GET /analytics route to statsRoutes"
```

---

## Task 4: Frontend — Dashboard rewrite

**Files:**
- Rewrite: `admin/src/pages/Dashboard.tsx`

**Context:**
- `API.get('/stats/analytics', { params, signal })` — axios accepts `signal` from `AbortController`.
- When the user changes a filter: abort the previous request immediately, reset the 300 ms debounce timer, fire the new request after 300 ms.
- Zero-fill: generate expected UTC-anchored bucket keys, merge with server response by key prefix (13 chars for hours, 10 chars for days).
- The old `API.get('/stats')` call is removed entirely.

- [ ] **Step 1: Write the new Dashboard.tsx**

Replace the entire contents of `admin/src/pages/Dashboard.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd admin && npx tsc --noEmit
```

Expected: no errors. Fix any type issues before proceeding.

- [ ] **Step 3: Start the full dev stack and verify in browser**

> **Note:** If the gateway dev server from Task 3 is still running, stop it first: `kill %1 2>/dev/null || true`

```bash
(cd gateway && npm run dev) &
(cd admin   && npm run dev) &
sleep 4
```

Open `http://localhost:5173` in the browser. Log in and navigate to Dashboard.

Expected:
- Filter bar at top: 4 range buttons + 3 dropdowns
- 4 stat cards (numbers or `—` while loading)
- 6 chart boxes — charts or "No data" placeholders
- Changing a range button triggers a new network request
- No console errors

- [ ] **Step 4: Verify loading state**

In browser DevTools Network tab, throttle to "Slow 3G", change a filter. Expected: charts fade to ~40% opacity while loading, then return to full opacity.

- [ ] **Step 5: Stop dev servers and commit**

```bash
kill %1 %2 2>/dev/null || true
git add admin/src/pages/Dashboard.tsx
git commit -m "feat: rewrite Dashboard with analytics charts and filters"
```

---

## Task 5: Final verification

- [ ] **Step 1: TypeScript clean build — both packages**

```bash
cd gateway && npx tsc --noEmit && echo "gateway OK"
cd ../admin && npx tsc --noEmit && echo "admin OK"
cd ..
```

Expected: both print `OK`.

- [ ] **Step 2: Smoke test all endpoints**

```bash
(cd gateway && npm run dev) &
sleep 4

TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@firegate.local","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

[ -z "$TOKEN" ] && echo "ERROR: empty token" && exit 1

# Old endpoints still work
curl -s -o /dev/null -w "GET /stats           → %{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/admin/stats
curl -s -o /dev/null -w "GET /stats/logs      → %{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/v1/admin/stats/logs?limit=5"

# New endpoint — all valid ranges
for r in 24h 7d 30d 90d; do
  curl -s -o /dev/null -w "GET /analytics?range=$r → %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "http://localhost:3000/api/v1/admin/stats/analytics?range=$r"
done

# Invalid range → 400
curl -s -o /dev/null -w "GET /analytics?range=bad → %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/admin/stats/analytics?range=bad"

# Malformed UUID → 200 with empty arrays (not 500)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/admin/stats/analytics?range=7d&keyId=not-a-uuid" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('byKey:', d['byKey'])"
```

Expected output:
```
GET /stats           → 200
GET /stats/logs      → 200
GET /analytics?range=24h → 200
GET /analytics?range=7d  → 200
GET /analytics?range=30d → 200
GET /analytics?range=90d → 200
GET /analytics?range=bad → 400
byKey: []
```

- [ ] **Step 3: Final commit**

```bash
kill %1 2>/dev/null || true
git add -A
git status  # confirm nothing untracked that shouldn't be committed
git commit -m "feat: analytics dashboard complete" --allow-empty
```

---

## Summary of commits

1. `feat: add recharts dependency`
2. `feat: add getAnalytics() to StatsService with raw SQL aggregations`
3. `feat: add GET /analytics route to statsRoutes`
4. `feat: rewrite Dashboard with analytics charts and filters`
5. `feat: analytics dashboard complete`
