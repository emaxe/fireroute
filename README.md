# FireRoute

> API Gateway for LLM inference with key rotation, group-based access control, and real-time analytics.

FireRoute (also known as **FireGate**) proxies requests to the [Fireworks AI](https://fireworks.ai) inference API while providing bearer-token authentication, API key rotation, usage analytics, and a full-featured React admin panel.

---

## Features

| Feature | Description |
|---------|-------------|
| **OpenAI-compatible proxy** | `/v1/chat/completions`, `/v1/embeddings`, `/v1/models` and more |
| **Anthropic-compatible proxy** | `/v1/messages` endpoint |
| **Wildcard catch-all** | Any Fireworks endpoint under `/v1/*` |
| **Key rotation** | Round-robin selection of API keys per group |
| **Token groups (many-to-many)** | Bind a service token to one or multiple key groups |
| **Bearer token auth** | Secure proxy access with automatic group routing |
| **Admin dashboard** | Real-time charts, filters, auto-refresh (Recharts + Tailwind) |
| **Image generation analytics** | Dedicated section for image requests, errors, latency |
| **Blocked endpoints** | Admin-managed blocklist for proxy routes |
| **User & token management** | JWT-based admin auth, CRUD for users, tokens, groups, keys |
| **Request logs** | Full logging with token, key, group, latency, and token counts |
| **Binary & SSE passthrough** | Images, audio, video, and streaming responses forwarded as-is |
| **Dockerized stack** | One-command deployment via `docker compose` |

---

## Quick Start

```bash
# Clone and enter the project
git clone https://github.com/emaxe/fireroute.git
cd fireroute

# Copy environment file and start everything
cp .env.example .env
docker compose up -d

# Gateway (API proxy)      → http://localhost:9700
# Admin panel              → http://localhost:9701
# Default admin credentials: admin@firegate.local / admin123
```

---

## Architecture

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐
│  Client │────▶│   Gateway   │────▶│ Fireworks AI │
│ (SDK)   │     │  (Fastify)  │     │  (Upstream)  │
└─────────┘     └──────┬──────┘     └──────────────┘
                       │
                       ▼
               ┌──────────────┐
               │  PostgreSQL  │
               │  (Prisma ORM)│
               └──────────────┘
                       ▲
               ┌──────────────┐
               │ Admin Panel  │
               │ (React + Vite)│
               └──────────────┘
```

### Services

| Service | Tech | Internal Port | Exposed Port |
|---------|------|---------------|--------------|
| **Gateway** | Node.js 20, Fastify 5, Prisma 5, TypeScript | 3000 | 9700 |
| **Admin** | React 18, Vite, Tailwind CSS, Recharts | 80 (nginx) | 9701 |
| **Postgres** | PostgreSQL 16 Alpine | 5432 | — |

---

## Environment Variables

Copy `.env.example` → `.env` and adjust:

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://firegate:firegate@postgres:5432/firegate` |
| `JWT_SECRET` | JWT signing secret | `change-me-in-production` |
| `ADMIN_EMAIL` | Default admin login | `admin@firegate.local` |
| `ADMIN_PASSWORD` | Default admin password | `admin123` |
| `GATEWAY_PORT` | Gateway listen port | `3000` |
| `FIREWORKS_BASE_URL` | Upstream LLM API | `https://api.fireworks.ai/inference/v1` |

---

## Development

### Interactive CLI

```bash
./run.sh
```

Menu: dev / build / database / docker / misc.

### Manual

```bash
# Gateway
cd gateway
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev      # tsx watch

# Admin
cd admin
npm install
npm run dev      # vite dev server
```

---

## Token Group Routing

A service token can be bound to **one or many** key groups. The proxy resolves the target group in this order:

1. **1 group bound** → auto-route to that group.
2. **N groups bound** → client must pass `"group": "group_id"` in the request body.
3. **0 groups bound** → fallback to the `default` group.

> **Note:** Proxy routes use `preHandler` (not `onRequest`) so the request body is parsed before the bearer-auth plugin runs.

---

## Admin Panel Pages

- **Dashboard** — real-time usage charts, token consumption, latency, error rate, image generation stats
- **Keys** — API keys with suspended status, group assignment, last used
- **Groups** — key groups with round-robin key rotation
- **Tokens** — service tokens with multi-group binding
- **Users** — admin users (JWT-based)
- **Logs** — request logs with filters
- **Playground** — test proxy requests interactively
- **Settings** — gateway configuration (blocked endpoints, etc.)

---

## Proxy Endpoints

| Endpoint | Compatibility | Methods |
|----------|--------------|---------|
| `/v1/chat/completions` | OpenAI | POST, GET |
| `/v1/embeddings` | OpenAI | POST |
| `/v1/models` | OpenAI | GET |
| `/v1/messages` | Anthropic | POST |
| `/v1/*` | Fireworks | ALL |

All proxy endpoints require:
```
Authorization: Bearer <service_token>
```

---

## License

MIT
