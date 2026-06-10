# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- Many-to-many relationship between service tokens and key groups. A token can be bound to multiple groups; the proxy auto-routes requests based on binding rules.
- Image generation analytics section on the Dashboard with request counts, error rates, average latency, and a time-series bar chart.
- Blocked endpoints management: admin API and UI to block/allow specific proxy routes.
- API key `suspended` status: keys can be paused without deletion.
- Settings page in the admin panel for gateway configuration.
- Playground page for interactive proxy request testing.
- `k` / `M` compact formatting on all numeric chart axes (Dashboard).
- `preHandler` auth hook on proxy routes so request body is parsed before bearer token validation (required for multi-group token routing).
- Models management page (`/models`) in the admin panel with upstream model listing and model manager service.
- `GET /api/v1/admin/models` endpoint for fetching upstream models through the gateway.

### Changed
- Service tokens no longer have a single `groupId` field; replaced by a `TokenGroup` junction table.
- Dashboard auto-refresh interval set to 5 seconds with a visual Live/Paused toggle.
- Updated `AGENTS.md` with current architecture, conventions, and agent instructions.
- Playground temporarily limited to **Chat** mode only; image generation UI removed until upstream image endpoints are restored.
- README updated to reflect current feature set (removed image generation analytics, added model management).

### Fixed
- Token `Myself` re-linked to `MAIN` group after schema migration removed the legacy `groupId` column.
- Analytics SQL queries now use fully-qualified column names with table aliases to prevent ambiguous column errors.
- **Critical auth fix:** Token selectors in Playground, Dashboard, and Logs now pass the hex `token` string instead of the UUID `id` to the proxy, resolving `401 Unauthorized` errors on gateway requests.

---

## 2026-06-08

### Added
- Wildcard catch-all proxy route (`/v1/*`) for any Fireworks AI endpoint.
- Binary response passthrough for images, audio, video, and `application/octet-stream`.
- Analytics Dashboard with Recharts: requests over time, latency area chart, token usage stacked area, token composition pie chart, and breakdown tables by key/group/token.
- `GET /v1/models` endpoint support and generic GET method passthrough in proxy.
- Service tokens management page independent of users: full CRUD for tokens with group selection.
- Request logs page with filtering by key, group, token, and date range.
- `AGENTS.md` and `QWEN.md` project context files for AI assistants.

### Changed
- Admin dashboard rewritten with Recharts, Tailwind CSS, and auto-refresh.

### Fixed
- Variable naming bug (`groupId`) in `key-manager.ts` that prevented correct group-based key selection.
- Error logging added to analytics catch block to surface SQL failures.

---

## 2026-06-07

### Added
- Initial gateway and admin panel scaffold.
- OpenAI-compatible proxy for `/v1/chat/completions` and `/v1/embeddings`.
- Anthropic-compatible proxy for `/v1/messages`.
- Bearer token authentication plugin for proxy routes.
- JWT-based admin authentication (`/api/v1/admin/auth`).
- API key management with round-robin rotation per group.
- Key groups management with CRUD.
- Users management with admin roles.
- Docker Compose stack: PostgreSQL 16, Fastify gateway, React admin (nginx).
- Prisma schema and migrations for `ApiKey`, `KeyGroup`, `ServiceToken`, `User`, and `RequestLog`.
- Interactive development CLI (`run.sh`).
- Design system documented in `DESIGN.md`.
