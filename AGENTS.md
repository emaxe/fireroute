# AGENTS.md — FireRoute Project Context

> This is the primary context file for AI assistants working on the FireRoute project.  
> All agents (Claude, Qwen, etc.) should read this file first before modifying code.

---

## 1. Project Overview

**FireRoute** (also referred to as **FireGate**) is an API gateway and admin panel for managing LLM API access. It proxies requests to the Fireworks AI inference API (`https://api.fireworks.ai/inference/v1`) while providing key rotation, group-based access control, usage analytics, and a React-based admin dashboard.

### Key Features
- **OpenAI-compatible proxy** (`/v1/chat/completions`, `/v1/embeddings`, etc.)
- **Anthropic-compatible proxy** (`/v1/messages`)
- **Wildcard catch-all proxy** (`/v1/*`) for any Fireworks endpoint
- **Key rotation** per group with round-robin selection
- **Bearer token authentication** for proxy routes
- **JWT-based admin authentication** (`/api/v1/admin/auth`)
- **Admin management** of API keys, groups, users, tokens, and request logs
- **Real-time analytics dashboard** with Recharts
- **Binary & SSE passthrough** for images, audio, video, and streaming responses

---

## 2. Architecture

Monorepo with three Dockerized services orchestrated via `docker-compose.yml`:

| Service | Role | Tech Stack | Port |
|---------|------|------------|------|
| **Gateway** | Fastify API server + proxy to Fireworks AI | Node.js 20, TypeScript, Fastify 5, Prisma 5, PostgreSQL | `3000` |
| **Admin** | React SPA for managing keys, groups, users, tokens, logs | React 18, Vite, TypeScript, React Router, Recharts, Tailwind CSS | `3001` (via nginx) |
| **Postgres** | Persistent database for Prisma | PostgreSQL 16 Alpine | `5432` |

### High-Level Flow
```
Client → Gateway (:3000) → Fireworks AI (upstream)
         ↓
Admin (:3001) → Gateway API (JWT auth)
         ↓
Postgres (Prisma ORM)
```

---

## 3. Directory Structure

```
fireRoute/
├── AGENTS.md               ← You are here (primary agent context)
├── QWEN.md                 ← Qwen-specific notes & references
├── run.sh                  # Interactive Bash CLI for dev/build/db/docker
├── docker-compose.yml      # Docker stack: postgres, gateway, admin
├── DESIGN.md               # Design system (colors, typography, spacing, components)
├── .env.example            # Environment variable template
│
├── gateway/                # Fastify backend
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/             # Schema + seed script
│   ├── src/
│   │   ├── server.ts       # Fastify bootstrap, route registration, health check
│   │   ├── config.ts       # Zod-validated env configuration
│   │   ├── plugins/        # error-handler, jwt-auth, bearer-auth
│   │   ├── routes/
│   │   │   ├── admin/      # auth, keys, groups, users, tokens, stats
│   │   │   └── proxy/      # openai, anthropic, responses, wildcard + utils
│   │   ├── services/       # key-manager, proxy-client, stats-service, token-manager, user-manager
│   │   └── types/
│   └── tests/
│
├── admin/                  # React frontend
│   ├── Dockerfile          # Multi-stage: node builder → nginx:alpine
│   ├── nginx.conf          # SPA fallback routing
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx         # Router layout with nav + auth guards
│       ├── pages/          # Dashboard, Keys, Groups, Users, Tokens, Logs, Login, Instructions
│       ├── components/     # Reusable UI components
│       └── api/            # API client utilities
│
├── nginx/                  # Extra nginx config (currently minimal)
└── docs/
    └── superpowers/        # Plans and specs (future features / roadmap)
```

---

## 4. Building and Running

### Interactive CLI (Recommended)

```bash
./run.sh
```

Provides a TUI menu for:
- **Dev** — run gateway (`tsx watch`), admin (`vite dev`), or both concurrently
- **Build** — compile TypeScript for gateway and/or admin
- **Database** — Prisma migrate dev, generate, seed, reset
- **Docker** — up, build, rebuild, down, restart, logs, ps, db-only
- **Misc** — install deps, clean `dist/` and `node_modules`

### Manual Commands

#### Gateway (backend)
```bash
cd gateway
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev          # tsx watch src/server.ts
npm run build        # tsc
npm run start        # node dist/server.js
```

#### Admin (frontend)
```bash
cd admin
npm install
npm run dev          # vite dev server
npm run build        # tsc && vite build
npm run preview      # vite preview
```

#### Docker (full stack)
```bash
# Copy env and start everything
cp .env.example .env
docker compose up -d

# Gateway → http://localhost:3000
# Admin   → http://localhost:3001
# Postgres → localhost:5432
```

---

## 5. Environment Variables

Copy `.env.example` → `.env` and adjust:

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://firegate:firegate@postgres:5432/firegate` |
| `JWT_SECRET` | Signing secret for admin JWT | `change-me-in-production` |
| `ADMIN_EMAIL` | Default admin login email | `admin@firegate.local` |
| `ADMIN_PASSWORD` | Default admin password | `admin123` |
| `GATEWAY_PORT` | Fastify listen port | `3000` |
| `FIREWORKS_BASE_URL` | Upstream LLM API base | `https://api.fireworks.ai/inference/v1` |

---

## 6. Development Conventions

### General Rules for Agents
1. **Follow existing code style.** Do not introduce new patterns unless the user explicitly asks.
2. **Prefer editing existing files over creating new ones.** Avoid premature abstractions.
3. **Never add unused dependencies.** Check `package.json` before importing anything new.
4. **ES Modules only.** Both `gateway` and `admin` use `"type": "module"`.
5. **Always check `DESIGN.md` before touching UI.** The design system is strict (colors, spacing, typography, components).
6. **Do not modify `docker-compose.yml` or Dockerfiles** unless the user specifically asks for infrastructure changes.
7. **After every task, update comments and documentation.** If you modified code, add or update JSDoc / inline comments to reflect the new behavior. If you changed architecture, conventions, or key files, update `AGENTS.md` and `QWEN.md` so future agents see the current state.

### Gateway (Node.js / TypeScript)
- **Fastify** plugin architecture: every route and auth layer is a plugin.
- **Zod** for runtime env validation (`config.ts`).
- **Prisma** for ORM and migrations; seed script in `prisma/seed.ts`.
- **Route prefixes**:
  - Admin API: `/api/v1/admin/*`
  - Proxy: `/v1/*` (OpenAI/Anthropic/Response/Wildcard)
- **Error handling**: centralized via `plugins/error-handler.js`.
- **Proxy logic**: `handleProxy` in `routes/proxy/utils.ts` handles key rotation, SSE streaming, binary passthrough, and stats logging.
- **TypeScript imports**: use `.js` extensions in imports (e.g., `import { config } from './config.js'`), even for `.ts` files, because the project compiles to ESM.

### Admin (React / TypeScript)
- **Vite** for build tooling and dev server.
- **React Router** for SPA navigation (`BrowserRouter`).
- **Tailwind CSS** utility classes. See `DESIGN.md` for design tokens.
- **Recharts** for analytics charts on Dashboard.
- **Axios** for HTTP client.
- **LocalStorage** for JWT token persistence (`token` key).
- **Design system** (from `DESIGN.md`):
  - Primary: `#6366F1` (indigo), Success: `#10B981`, Warning: `#F59E0B`, Error: `#EF4444`
  - Fonts: General Sans (display), DM Sans (body), JetBrains Mono (code)
  - Spacing: 4px base grid, max-width 1280px, card radius 12px, button radius 6px

### Docker & Deployment
- Gateway image runs `prisma migrate deploy` + `db:seed` on startup.
- Admin is built as static files and served by nginx (`nginx:alpine`).
- `docker-compose.yml` includes a healthcheck for postgres before gateway starts.

---

## 7. Key Files for Quick Reference

| File | What it does |
|------|--------------|
| `gateway/src/server.ts` | Fastify server bootstrap, registers all plugins and routes |
| `gateway/src/config.ts` | Zod schema for env vars, exported as `config` |
| `gateway/src/routes/proxy/utils.ts` | Core proxy logic: key rotation, SSE, binary passthrough, stats logging |
| `gateway/src/services/key-manager.ts` | Round-robin API key selection per group |
| `gateway/src/services/proxy-client.ts` | `fetch` wrapper to Fireworks AI |
| `admin/src/App.tsx` | Router, layout, nav, and auth guard |
| `run.sh` | Interactive development CLI |
| `DESIGN.md` | Full design system specification (tokens, components, spacing) |

---

## 8. Post-Task Maintenance (Mandatory)

After completing **any** task — whether a bug fix, feature addition, refactor, or documentation update — you **must**:

1. **Update code comments.** Add or revise JSDoc blocks, inline comments, and clarifying notes in every file you modified so the code accurately describes its current behavior. Comments must explain *why*, not just *what*.
2. **Sync agent documentation.** If your changes altered architecture, conventions, route behavior, environment variables, or key files, update `AGENTS.md` and `QWEN.md` so future agents see the current state instead of stale instructions.
3. **Verify cross-file consistency.** Ensure that references in comments, README snippets, and doc strings still point to the correct functions, files, and paths.

> **Rationale:** This project is maintained by multiple AI agents across sessions. Out-of-date comments and instructions cause silent bugs and wasted iterations. Treat documentation updates as part of the definition of done.

---

## 9. Notes & Pitfalls

- **Proxy catch-all route**: `wildcard.ts` uses `server.all('/*', ...)` under the `/v1` prefix. Be careful when adding new top-level routes inside `/v1` to avoid collisions.
- **Binary passthrough**: The gateway detects binary responses (`image/*`, `audio/*`, `video/*`, `application/octet-stream`) and forwards them as `Buffer`. Do not try to `JSON.parse` these.
- **SSE streaming**: Event-stream responses are piped directly to `reply.raw`. Do not wrap them in a Fastify reply object.
- **LocalStorage auth**: The admin panel stores the JWT in `localStorage.getItem('token')`. Any auth-related changes must update both the login page and the axios interceptor (if present).
