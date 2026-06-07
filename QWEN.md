# QWEN.md — Qwen Code Notes for FireRoute

> **Primary project context is in `AGENTS.md`.**  
> Always read `AGENTS.md` first for architecture, conventions, and building instructions.

---

## Quick Links

- [AGENTS.md](./AGENTS.md) — Full project overview, architecture, conventions, and key files.
- [DESIGN.md](./DESIGN.md) — UI design system (tokens, typography, spacing, components).
- [run.sh](./run.sh) — Interactive CLI for dev / build / db / docker.
- [docker-compose.yml](./docker-compose.yml) — Docker stack definition.

---

## Qwen-Specific Reminders

1. **Memory path** — Use `/Users/emaxe/.qwen/projects/-Users-emaxe-Desktop--JS-fireRoute/memory/` for persistent memory.
2. **Approval mode** — Respect user confirmation settings (most file edits and shell commands require approval).
3. **ES Modules** — Both `gateway` and `admin` use `"type": "module"`; imports must include `.js` extensions (even for `.ts` source files in the gateway).
4. **Proxy logic** — When modifying `gateway/src/routes/proxy/utils.ts`, preserve SSE streaming and binary passthrough paths. Do not accidentally wrap binary responses in JSON.
5. **UI changes** — Before editing any admin React components, verify colors/spacing/radius against `DESIGN.md`.
6. **Database** — Use `npx prisma migrate dev` or the `run.sh` Database menu for schema changes; do not hand-edit the database directly.
7. **Post-task maintenance** — After every task, update JSDoc / inline comments in any code you touched, and sync `AGENTS.md` / `QWEN.md` if architecture or conventions changed. Future agents must see the current state.

---

## Common Tasks

| Task | Entry Point |
|------|-------------|
| Start local dev | `./run.sh` → *Dev* menu |
| Build for production | `./run.sh` → *Build* menu |
| Database migrations | `./run.sh` → *Database* menu |
| Docker stack | `./run.sh` → *Docker* menu |
| Gateway manual dev | `cd gateway && npm run dev` |
| Admin manual dev | `cd admin && npm run dev` |
