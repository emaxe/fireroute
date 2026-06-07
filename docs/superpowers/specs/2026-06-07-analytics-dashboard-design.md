# Analytics Dashboard — Design Spec

**Date:** 2026-06-07
**Project:** FireRoute
**Scope:** Extend existing Dashboard page with charts and filters

---

## Summary

Add analytics charts with global filters (time range, key, group, token) to the existing Dashboard page. All data comes from the existing `request_logs` table — no schema changes needed.

---

## Backend

### New endpoint
`GET /api/v1/admin/stats/analytics`
Protected by existing `server.authenticate` middleware.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `range` | `"24h" \| "7d" \| "30d" \| "90d"` | `"7d"` | Time window |
| `keyId` | `string` | — | Filter by API key |
| `groupId` | `string` | — | Filter by key group |
| `tokenId` | `string` | — | Filter by service token |

**Response shape:**
```ts
{
  timeseries:   { time: string; requests: number; errors: number; avgLatency: number }[]
  byKey:        { id: string; name: string; requests: number; errors: number }[]
  byGroup:      { id: string; name: string; requests: number; errors: number }[]
  byToken:      { id: string; name: string; requests: number; errors: number }[]
  topEndpoints: { endpoint: string; requests: number; errors: number }[]
}
```

### Aggregation strategy

- **Timeseries buckets:** `date_trunc('hour', created_at)` for `24h`; `date_trunc('day', created_at)` for `7d`/`30d`/`90d`. Implemented via `prisma.$queryRaw` since Prisma groupBy does not support date_trunc natively.
- **Breakdowns** (byKey, byGroup, byToken, topEndpoints): `prisma.requestLog.groupBy` with `_count` and `_avg` aggregates.
- All WHERE conditions (time window + optional filters) are applied uniformly to every aggregation.

### Files changed
- `gateway/src/services/stats-service.ts` — add `getAnalytics(params)` method
- `gateway/src/routes/admin/stats.ts` — add `GET /analytics` route

---

## Frontend

### Filter bar
Displayed at the top of the Dashboard page, above the stat cards.

```
[ 24ч ][ 7д* ][ 30д ][ 90д ]    Key: [All ▾]    Group: [All ▾]    Token: [All ▾]
```

- Time range: 4 toggle buttons, default `7д`
- Key / Group / Token: `<select>` dropdowns populated from existing endpoints (`/keys`, `/groups`, `/tokens`), with an "All" default option
- On any filter change → single request to `/stats/analytics` → all charts and cards update

### Stat cards
The existing 4 cards (Total Requests, Errors, Avg Latency, Today) are retained but now reflect the selected time range rather than all-time values. Data sourced from the analytics response.

### Charts layout

**Row 1 — two wide charts (each ~50% width):**
1. **Requests over time** — stacked/grouped bar chart; two series: successful requests (indigo `#6366F1`) and errors (red `#EF4444`). X-axis: hours (24h range) or days (all other ranges).
2. **Avg Latency over time** — line chart, single series, Y-axis in ms.

**Row 2 — three equal charts:**
3. **By Key** — horizontal bar, top-10 keys by request count.
4. **By Group** — horizontal bar, top-10 groups by request count.
5. **Top Endpoints** — horizontal bar, top-10 endpoints by request count.

**Row 3 — full width:**
6. **By Token** — horizontal bar, top-10 service tokens by request count.

### State
```ts
const [range, setRange]     = useState<'24h'|'7d'|'30d'|'90d'>('7d')
const [keyId, setKeyId]     = useState('')
const [groupId, setGroupId] = useState('')
const [tokenId, setTokenId] = useState('')
const [data, setData]       = useState<AnalyticsData | null>(null)
const [loading, setLoading] = useState(false)
```

Dropdown option lists (keys, groups, tokens) are fetched once on mount in parallel. Analytics data is re-fetched whenever any filter state changes.

### New dependency
`recharts` added to `admin/package.json`.

### Files changed
- `admin/src/pages/Dashboard.tsx` — full rewrite
- `admin/package.json` — add `recharts`

---

## What does NOT change
- `prisma/schema.prisma` — no DB migration needed
- `gateway/src/server.ts` — route registration unchanged
- `admin/src/api/client.ts` — API client unchanged
- All other pages and routes

---

## Request flow

1. User opens Dashboard
2. Three parallel requests fetch keys, groups, and tokens for dropdowns (once)
3. One request fetches analytics for the default range (`7d`)
4. Four stat cards + six charts render
5. User changes any filter → one new analytics request → all UI updates

---

## Out of scope
- Custom date range picker (only 4 presets)
- Per-chart filters
- Export / CSV download
- Real-time auto-refresh
