# 9Router - Agent Instructions

## Project Structure

Monorepo with three packages:

| Package | Path | Purpose |
|---------|------|---------|
| Dashboard (Next.js) | `/` (root) | Web UI + OpenAI-compatible API on `/v1/*` |
| CLI | `cli/` | Global `9router` command, runs dashboard |
| Tests | `tests/` | Vitest unit tests for translators/executors |
| Core SSE/Translation | `open-sse/` | Shared routing, translation, executor logic |

## Git Workflow

- **Only stage specific files** — never `git add .`, `git add -A`, or `git add --all`
- The build process auto-generates several files (`open-sse/providers/registry/index.js`, `open-sse/executors/index.js`, `open-sse/translator/index.js`) that must NOT be committed
- Review `git status` and stage exactly the files you changed with `git add <path>`
- Before committing, always check `git diff --cached` to confirm only intended files are staged

## Key Commands

```bash
# Dashboard development
npm run dev        # Port 20127 (webpack)
npm run dev2       # Port 20128 (webpack)
npm run build      # Production build (standalone output)
npm run start      # Start production server

# CLI development
cd cli && npm run dev    # Nodemon watch on cli.js
cd cli && npm run build  # esbuild bundle → cli/.build/

# Tests (from repo root)
cd tests && npm test                     # All tests
cd tests && npx vitest run --config vitest.config.js "tests/translator/"  # Translator only (offline)
cd tests && RUN_REAL=1 npx vitest run --config vitest.config.js "tests/translator/real/"  # Live providers

# Required config for tests (aliases: open-sse/, @/)
```

## Environment Variables

Copy `.env.example` → `.env` and set required:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Dashboard session cookie signing |
| `INITIAL_PASSWORD` | Yes | First login password |
| `DATA_DIR` | Yes | SQLite location (`/var/lib/9router` or `~/.9router`) |
| `PORT` | No | Default 20128 |
| `NODE_ENV` | No | `production` for deploy |
| `BASE_URL` / `CLOUD_URL` | No | Server-side sync URLs (prefer over `NEXT_PUBLIC_*`) |
| `API_KEY_SECRET` / `MACHINE_ID_SALT` | No | Security secrets |

**Windows note**: `better-sqlite3` is optional; `sql.js` is fallback at runtime.

## Architecture Essentials

### Request Flow (`/v1/chat/completions`)
```
Next.js route (src/app/api/v1/*) 
  → src/sse/handlers/chat.js (combo/account fallback loop)
  → open-sse/handlers/chatCore.js (translate → execute → translate → stream)
  → open-sse/executors/<provider>.js (upstream call)
  → open-sse/translator/* (format conversion via OpenAI intermediate)
  → SSE back to client
```

### Config-Driven Conventions (open-sse)
- **All constants in `config/`** — never hardcode models, roles, block types
- **Translator registry** — `open-sse/translator/index.js` imports all `request/<from>-to-<to>.js` and `response/<from>-to-<to>.js`; they self-register via `register(from, to, reqFn, resFn)`
- **Direct routes skip OpenAI bridge** — e.g., `claude:kiro` registered directly avoids lossy double-hop
- **RTK/headroom/caveman** — mutate request body in-place, **fail-open** (error → return null, leave body untouched)

### Database
- Main state: `${DATA_DIR}/db.json` (providers, combos, aliases, keys, settings, pricing)
- Usage: `~/.9router/usage.json` + `~/.9router/log.txt` (does NOT follow `DATA_DIR`)
- Backups: `${DATA_DIR}/db/backups/`

### Provider Setup
- Add provider: copy `open-sse/providers/REGISTRY_TEMPLATE.js` → `open-sse/providers/registry/{id}.js`
- Add models: `open-sse/config/providerModels.js` `PROVIDER_MODELS`
- Generic OpenAI-compatible providers need no executor (uses `DefaultExecutor`)
- Special executors: `antigravity`, `gemini-cli`, `github`, `kiro`, `codex`, `cursor`

### Translation Pitfalls
- OpenAI bridge loses: `thinking`/`reasoning`, non-base64 images, `input_audio`, `is_error`, tool `id`/`index` stability
- `gemini`/`gemini-cli`: only last system message kept
- Special formats (`kiro` EventStream, `cursor` protobuf, `commandcode` NDJSON) don't round-trip through OpenAI — handle in executor

## Testing Notes

- **Translator tests** in `tests/translator/` — must import `./registerAll.js` first (vitest ESM breaks `require`-based lazy loading)
- **Bug exposure** — use `it.fails()` for known bugs; turns red when fixed
- **Matrix-driven** — `tests/translator/matrix.js` reads `PROVIDER_MODELS` config; new providers auto-covered
- **Aliases** — vitest config maps `open-sse/` → `../open-sse` and `@/` → `../src`

## CLI Runtime Quirks

- `cli/hooks/postinstall.js` installs `sql.js` + `better-sqlite3` + `systray2` (macOS/Linux) into `~/.9router/runtime/node_modules/`
- Avoids Windows EBUSY on CLI update (native .node files not under locked install dir)
- `systray2` fork used (legacy `systray@1.0.5` has 2017 binary failing on modern macOS)

## Deployment

```bash
# Docker (published images)
docker run -d --name 9router -p 20128:20128 \
  -v "$HOME/.9router:/app/data" -e DATA_DIR=/app/data decolua/9router:latest

# VPS from source
npm run build
export JWT_SECRET=... INITIAL_PASSWORD=... DATA_DIR=/var/lib/9router PORT=20128 HOSTNAME=0.0.0.0 NODE_ENV=production
npm run start
```

## References

- `docs/ARCHITECTURE.md` — full system diagrams, data models, failure modes
- `open-sse/AGENTS.md` — core SSE/translation conventions
- `tests/translator/AGENTS.md` — translator test patterns