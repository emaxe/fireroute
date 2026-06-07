# Wildcard Proxy & Binary Response Passthrough — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the gateway to proxy any Fireworks endpoint (not just `/chat/completions`) and correctly return binary responses such as `image/jpeg` from image generation APIs.

**Architecture:** Two focused changes. (1) `utils.ts` gets a binary passthrough branch before the existing `response.json()` call — for `image/*`, `audio/*`, `video/*`, and `application/octet-stream` responses it reads the body as an `ArrayBuffer` and forwards it with the upstream `Content-Type`. (2) A new `wildcardRoutes` plugin registers `ALL /*` under the existing `/v1` prefix and is registered last in `server.ts` so specific routes always win; it extracts the path (including query string) from the request and calls the shared `handleProxy`.

**Tech Stack:** Fastify v5, TypeScript, Node.js `Buffer`, native `fetch` (`ArrayBuffer`).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `gateway/src/routes/proxy/utils.ts:68-88` | Add binary passthrough branch before `response.json()` |
| Create | `gateway/src/routes/proxy/wildcard.ts` | Catch-all `ALL /*` route under `/v1` |
| Modify | `gateway/src/server.ts` | Import and register `wildcardRoutes` last |

---

## Background — how the current proxy works

`FIREWORKS_BASE_URL` = `https://api.fireworks.ai/inference/v1` (from `config.ts`).

`proxyToFireworks(endpoint, body, apiKey, headers, method)` builds:
```
URL = FIREWORKS_BASE_URL + endpoint
```

So a gateway route registered at `/v1/X` calls `handleProxy(…, '/X', groupId)` which calls
`proxyToFireworks('/X', …)` → `https://api.fireworks.ai/inference/v1/X`.

The image generation endpoint the user wants to hit is:
```
https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image
```

So after this plan the user will call the gateway at:
```
POST /v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image
```
(i.e. replace `https://api.fireworks.ai/inference/v1` with `http://gateway-host/v1`).

---

## Task 1: Binary response passthrough

**Files:**
- Modify: `gateway/src/routes/proxy/utils.ts:68-88`

**Context:**
- Current code on line 87: `const body = await response.json();` — crashes on binary responses.
- We need to insert a branch between the SSE block (ends ~line 85) and the `response.json()` call.
- Use `Buffer.from(await response.arrayBuffer())` — Fastify accepts `Buffer` in `reply.send()` and
  sets the raw bytes as the response body.
- Always forward `Content-Type` from the upstream response.
- Forward `Content-Disposition` if present (e.g. when Fireworks suggests a filename).
- Binary detection regex: `/^(image|audio|video)\/|^application\/octet-stream/`.

- [ ] **Step 1: Open `gateway/src/routes/proxy/utils.ts` and locate the JSON fallback**

The section to replace is at the end of the `try` block, after the SSE block closes (~line 85):

```typescript
    const body = await response.json();
    return reply.send(body);
```

- [ ] **Step 2: Replace those two lines with binary passthrough + JSON fallback**

Replace the two lines identified above with:

```typescript
    const isBinary = /^(image|audio|video)\/|^application\/octet-stream/.test(contentType);
    if (isBinary) {
      const buffer = await response.arrayBuffer();
      reply.header('Content-Type', contentType);
      const disposition = response.headers.get('content-disposition');
      if (disposition) reply.header('Content-Disposition', disposition);
      return reply.send(Buffer.from(buffer));
    }

    const body = await response.json();
    return reply.send(body);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/emaxe/Desktop/_JS/fireRoute/gateway && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add gateway/src/routes/proxy/utils.ts
git commit -m "feat: add binary response passthrough in handleProxy"
```

---

## Task 2: Catch-all wildcard route

**Files:**
- Create: `gateway/src/routes/proxy/wildcard.ts`
- Modify: `gateway/src/server.ts`

**Context:**
- Fastify v5 wildcard route: `server.all('/*', …)` — the `*` wildcard is captured in `request.params['*']`
  as the path **without** leading slash and **without** the route prefix.
- `request.url` is the full raw path including prefix and query string (e.g. `/v1/workflows/foo?bar=1`).
- We strip the `/v1` prefix by using the captured param, and append the query string from `request.url`.
- The wildcard must be registered **after** `openaiRoutes`, `anthropicRoutes`, `responsesRoutes` in
  `server.ts` — Fastify v5 matches specific routes before wildcards regardless, but keeping it last
  is cleaner and matches the intent.
- Extract `body.group` (if present) just like `openaiRoutes` does, fall back to `'default'`.

- [ ] **Step 1: Create `gateway/src/routes/proxy/wildcard.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';

export async function wildcardRoutes(server: FastifyInstance) {
  server.all<{ Params: { '*': string } }>(
    '/*',
    { onRequest: server.verifyBearer },
    async (request, reply) => {
      // Rebuild endpoint: leading slash + wildcard capture (no prefix, no query)
      const path = '/' + request.params['*'];

      // Preserve query string from the raw URL
      const qIdx = request.url.indexOf('?');
      const endpoint = qIdx >= 0 ? path + request.url.slice(qIdx) : path;

      // Honour optional group field in JSON body (same pattern as openaiRoutes)
      const body = request.body as { group?: string } | null;
      const groupId = body?.group || 'default';

      return handleProxy(request, reply, endpoint, groupId);
    }
  );
}
```

- [ ] **Step 2: Register `wildcardRoutes` at the end of `gateway/src/server.ts`**

Add import after the existing proxy imports:
```typescript
import { wildcardRoutes } from './routes/proxy/wildcard.js';
```

Add registration after the existing three proxy `server.register` calls:
```typescript
await server.register(wildcardRoutes, { prefix: '/v1' });
```

The final proxy registration block should look like:
```typescript
await server.register(openaiRoutes,    { prefix: '/v1' });
await server.register(anthropicRoutes, { prefix: '/v1' });
await server.register(responsesRoutes, { prefix: '/v1' });
await server.register(wildcardRoutes,  { prefix: '/v1' });  // ← new, must be last
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/emaxe/Desktop/_JS/fireRoute/gateway && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add gateway/src/routes/proxy/wildcard.ts gateway/src/server.ts
git commit -m "feat: add wildcard catch-all proxy route under /v1"
```

---

## Task 3: Verification

- [ ] **Step 1: Start gateway**

```bash
(cd gateway && npm run dev) &
GW_PID=$!
sleep 4
```

- [ ] **Step 2: Get auth token**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@firegate.local","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ -z "$TOKEN" ] && echo "ERROR: empty token" && exit 1
echo "Token OK"
```

- [ ] **Step 3: Verify existing routes still work**

```bash
curl -s -o /dev/null -w "GET /v1/models → %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/v1/models"
```

Expected: `200` (or a Fireworks error code if no live API key, but NOT 404).

- [ ] **Step 4: Verify wildcard route is reachable**

Hit a path that only exists via the wildcard. With no API keys in DB we expect `503`
(gateway error: "No available API keys"), not `404` (route not found):

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}' \
  "http://localhost:3000/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image"
```

Expected: HTTP `503` with body `{"error":"No available API keys"}`.
(If a working API key IS present in the DB and the model is valid, you will receive a JPEG binary
 response and the curl exit code will be 0.)

- [ ] **Step 5: If a real API key is available — test image download**

```bash
curl --request POST \
  -S --fail-with-body \
  --url http://localhost:3000/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image \
  -H 'Content-Type: application/json' \
  -H 'Accept: image/jpeg' \
  -H "Authorization: Bearer $TOKEN" \
  --data '{"prompt":"A beautiful sunset over the ocean"}' \
  -o /tmp/test_image.jpg
echo "Exit code: $?"
file /tmp/test_image.jpg
```

Expected: exit 0, `file` reports `JPEG image data`.

- [ ] **Step 6: Stop gateway and commit**

```bash
kill $GW_PID 2>/dev/null || true
git add -A
git status  # verify nothing unexpected
git commit -m "feat: wildcard proxy and binary passthrough complete" --allow-empty
```

---

## Summary of commits

1. `feat: add binary response passthrough in handleProxy`
2. `feat: add wildcard catch-all proxy route under /v1`
3. `feat: wildcard proxy and binary passthrough complete`

## What changes for callers

Replace the Fireworks base URL with the gateway host, keeping everything after `/inference/v1` the same:

```diff
- --url https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image
+ --url http://your-gateway/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image
```

Replace the Fireworks API key with a gateway service token:

```diff
- -H "Authorization: Bearer $FIREWORKS_API_KEY"
+ -H "Authorization: Bearer $GATEWAY_SERVICE_TOKEN"
```
