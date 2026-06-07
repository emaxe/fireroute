# Analytics Dashboard — Design Spec

**Date:** 2026-06-07
**Project:** FireRoute
**Scope:** Extend existing Dashboard page with charts and global filters

---

## Summary

Add analytics charts with global filters (time range, key, group, token) to the existing Dashboard page. All data comes from the existing `request_logs` table — no DB schema changes needed.

---

## Backend

### New endpoint
`GET /api/v1/admin/stats/analytics`

Protected by the existing `server.authenticate` middleware. Registered automatically — `statsRoutes` is already registered at prefix `/api/v1/admin/stats`, so `server.ts` requires no changes.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `range` | `"24h" \| "7d" \| "30d" \| "90d"` | `"7d"` | Time window |
| `keyId` | `string` | — | Filter by API key ID |
| `groupId` | `string` | — | Filter by key group ID |
| `tokenId` | `string` | — | Filter by service token ID |

**Validation:**
- If `range` is provided but not one of the four valid values → HTTP 400 `{ error: "Invalid range" }`.
- If `keyId`/`groupId`/`tokenId` are invalid UUIDs or reference non-existent records → treat as no-match, return empty arrays (no 400 or 500).

**Response shape:**
```ts
interface AnalyticsData {
  summary: {
    total: number       // total requests in range
    errors: number      // requests with status >= 400
    avgLatency: number  // avg latency in ms, integer (Math.round; 0 when no data)
  }
  timeseries: {
    time: string        // ISO datetime string (bucket start, UTC)
    requests: number
    errors: number
    avgLatency: number  // integer (rounded); 0 when no data for that bucket
  }[]
  byKey: {
    id: string
    name: string
    requests: number
    errors: number
    avgLatency: number  // integer (rounded)
  }[]
  byGroup: {
    id: string          // raw group_id value from request_logs
    name: string        // resolved name (see resolution rules); fallback = id value
    requests: number
    errors: number
    avgLatency: number  // integer (rounded)
  }[]
  byToken: {
    id: string
    name: string        // COALESCE(service_tokens.name, service_tokens.id)
    requests: number
    errors: number
    avgLatency: number  // integer (rounded)
  }[]
  topEndpoints: {
    endpoint: string
    requests: number
    errors: number
    // avgLatency intentionally omitted: endpoint-level latency is covered by the timeseries chart
  }[]
}
```

All `avgLatency` values are integers (`Math.round`). The SQL for every `AVG` uses `COALESCE(AVG(latency_ms), 0)` to guard against NULL on empty result sets. All arrays return at most **10 items**, sorted by `requests` descending. All arrays return `[]` (never `null`) when there is no data.

### Aggregation strategy

All aggregations use `prisma.$queryRaw` (raw SQL). Reasons:
1. **Timeseries** requires `date_trunc` which Prisma `groupBy` does not support.
2. **Conditional error counts** (`COUNT(CASE WHEN status >= 400 THEN 1 END)`) cannot be expressed via Prisma `groupBy`.
3. **byGroup name resolution** requires a JOIN.
4. **byToken nullable name** requires `COALESCE`.

**Timeseries bucketing (UTC):**
- `24h` → `date_trunc('hour', created_at)`, up to 24 rows returned
- `7d` / `30d` / `90d` → `date_trunc('day', created_at)`, up to 7/30/90 rows returned

The backend returns only buckets that have rows (sparse). The **frontend** zero-fills missing buckets (see Frontend section).

**byGroup name resolution:**
`request_logs.group_id` stores either a `key_groups.id` UUID or a `key_groups.name` string (no FK, no constraint). To avoid double-counting (where a group_id could match both `kg.id` of one row and `kg.name` of another), resolve using a subquery per distinct `group_id`:
```sql
LEFT JOIN LATERAL (
  SELECT name FROM key_groups
  WHERE id = r.group_id OR name = r.group_id
  LIMIT 1
) kg ON true
```
`byGroup[].name = COALESCE(kg.name, r.group_id)` — if no match (e.g. deleted group), the raw `group_id` value is the display name.

**byToken nullable name:**
`service_tokens.name` is `String?` (nullable). Use `COALESCE(st.name, st.id)` as the display name.

**WHERE filter construction:**
Parameterized raw SQL applied uniformly to all queries:
```sql
WHERE created_at >= $startTime
  [AND key_id = $keyId]
  [AND group_id = $groupId]
  [AND token_id = $tokenId]
```

**Timezone:** All bucketing is UTC (PostgreSQL server default). Known limitation — daily buckets may not align with the admin's local calendar day. Out of scope.

### Existing `/stats` endpoint
The existing `GET /api/v1/admin/stats` (all-time, no-filter) is **preserved unchanged** for backward compatibility. The Dashboard frontend stops calling it. It can be removed in a future cleanup pass once confirmed no other consumers depend on it.

### Note on `/stats/logs`
The existing `GET /api/v1/admin/stats/logs` is intentionally unchanged.

### Files changed
- `gateway/src/services/stats-service.ts` — add `getAnalytics(params)` method
- `gateway/src/routes/admin/stats.ts` — add `GET /analytics` route with range validation

---

## Frontend

### TypeScript interface
`AnalyticsData` is defined inline in `Dashboard.tsx` (or a local types file imported by it), matching the response shape exactly.

### Filter bar
Displayed at the top of the Dashboard page, above the stat cards.

```
[ 24ч ][ 7д* ][ 30д ][ 90д ]    Key: [All ▾]    Group: [All ▾]    Token: [All ▾]
```

- **Time range:** 4 toggle buttons, default `7д`. Active button styled with indigo background.
- **Key / Group / Token:** `<select>` dropdowns. Options loaded on mount via three parallel calls:
  - `API.get('/keys')`, `API.get('/groups')`, `API.get('/tokens')`
  - (Paths are relative to `baseURL = '/api/v1/admin'` — actual URLs: `/api/v1/admin/keys` etc.)
  - Default option "All" (`value=""`).
- **Dropdown loading state:** Selects are `disabled` while loading.
- **Dropdown error state:** If a fetch fails, the select stays with only the "All" option — no blocking error.
- **On any filter change** → debounced analytics fetch → all charts and cards update.

### Race condition / stale data handling
1. **Abort immediately** on any filter state change: cancel the current in-flight analytics request via `AbortController.abort()`.
2. **Debounce 300 ms**: start a 300 ms timer; if another change arrives before it expires, reset the timer. Fire the new request only when the timer completes.

Pattern: `onChange → abort previous → reset debounce timer → [300 ms] → new fetch`.

### Stat cards (replaces old Dashboard cards)

The old `API.get('/stats')` call is **removed** from Dashboard.

| Card | Value | When `total === 0` |
|---|---|---|
| Total Requests | `summary.total` | `0` |
| Errors | `summary.errors` | `0` |
| Avg Latency | `summary.avgLatency ms` | `0 ms` |
| Error Rate | `(errors / total * 100).toFixed(1)%` | `—` |

**Note:** The "Today" card from the original Dashboard is intentionally removed. It had no meaningful interpretation across different time ranges. Error Rate is a more useful metric in its place.

### Charts

**Row 1 — two wide charts (~50% width each):**
1. **Requests over time** — `<BarChart>` (Recharts); two series: requests (indigo `#6366F1`) and errors (red `#EF4444`). X-axis: hour labels for `24h`, date labels otherwise.
2. **Avg Latency over time** — `<LineChart>` (Recharts), single series, Y-axis in ms.

**Row 2 — three equal charts:**
3. **By Key** — `<BarChart layout="vertical">`, top-10 keys by requests.
4. **By Group** — same, top-10 groups.
5. **Top Endpoints** — same, top-10 endpoints.

**Row 3 — full width:**
6. **By Token** — horizontal bar, top-10 tokens.

**No-data state:** Charts with empty arrays show a centered `"No data"` text placeholder.

**Loading state:** While `loading === true`, all chart containers render at `opacity: 0.4`. No skeleton.

### Timeseries zero-fill (frontend)
Before rendering charts 1 and 2, the frontend generates the full expected bucket sequence and merges it with `data.timeseries`:
- **Anchor:** current UTC time (not local time) — to match the server's `date_trunc` UTC bucketing.
- **`24h`:** generate 24 hourly buckets from `now - 24h` truncated to the current UTC hour.
- **`7d`/`30d`/`90d`:** generate N daily buckets from `now - N days` truncated to UTC midnight.
- **Merge key:** compare the ISO string truncated to the same granularity (first 13 chars for hours `2026-06-07T14`, first 10 chars for days `2026-06-07`).
- Missing buckets default to `{ requests: 0, errors: 0, avgLatency: 0 }`.

### New dependency
`recharts ^2.12.0` added to `admin/package.json`.

### Files changed
- `admin/src/pages/Dashboard.tsx` — full rewrite (removes old `API.get('/stats')` call)
- `admin/package.json` — add `recharts ^2.12.0`

---

## What does NOT change
- `prisma/schema.prisma` — no DB migration needed
- `gateway/src/server.ts` — route registration unchanged
- `gateway/src/routes/admin/stats.ts` existing routes (`GET /`, `GET /logs`) — unchanged in behaviour
- `admin/src/api/client.ts` — unchanged
- All other pages and routes

---

## Request flow

1. User opens Dashboard
2. Parallel: `API.get('/keys')`, `API.get('/groups')`, `API.get('/tokens')` — populate dropdowns (once)
3. `API.get('/stats/analytics', { params: { range: '7d' } })` — initial load
4. Four stat cards + six charts render
5. User changes any filter → abort in-flight → 300 ms debounce → `API.get('/stats/analytics', { params: { range, keyId, groupId, tokenId } })` → all UI updates

---

## Known limitations
- Timeseries bucketing is UTC-only; no local timezone alignment
- Missing time buckets are zero-filled on the frontend (not server-side)
- Top-N breakdowns capped at 10 server-side; no pagination

## Out of scope
- Per-chart filters
- Export / CSV download
- Real-time auto-refresh
- Custom date range picker
