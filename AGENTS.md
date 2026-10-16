<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 9Router

Local AI routing gateway + Next.js dashboard. One OpenAI-compatible endpoint (`/v1/*`) routes to 40+ upstream providers with format translation, model-combo + multi-account fallback, OAuth token refresh, quota/usage tracking. Plain JavaScript (ESM), **no TypeScript**.

Two independently-versioned packages in one repo:
- Root `package.json` (`9router-app`, private) — the dashboard + gateway. This is what you run.
- `cli/` (`9router`, published to npm) — launcher that installs/starts the server + system tray. Own `package.json`, own version, own build.

## Read before working in an area

- `docs/ARCHITECTURE.md` — request lifecycle, fallback, OAuth, data model. **Stale on persistence**: it still says `db.json`; storage is now SQLite (see below).
- `CLAUDE.md` — longer form of these notes (commands, env matrix, conventions). Where it conflicts with code, trust the code.
- `open-sse/AGENTS.md` — **required** before editing anything under `open-sse/` (routing/translation engine).

## Commands

```bash
cp .env.example .env && npm install
npm run dev            # next dev, port 20127
npm run build          # next build --webpack  (postbuild copies standalone assets — required)
PORT=20128 HOSTNAME=0.0.0.0 npm run start   # node custom-server.js --port 20127
npx eslint .           # only lint tool; no typecheck, no formatter
```

- Bun variants: `dev:bun` / `build:bun` / `start:bun`. Dev can also use `dev:webpack`.
- **Port gotcha**: scripts default to `20127`; the dashboard docs/URLs/CLI use `20128`. Pass `PORT`/`--port` explicitly or you will be talking to the wrong instance.
- `build` must run with `--webpack` (turbopack build is not the configured path). CI builds with `NODE_OPTIONS=--max-old-space-size=4096`.
- `cli/`: `npm run cli:pack` (build + `npm pack` from root), `npm run cli:publish`. Inside `cli/`: `npm run dev` (nodemon), `npm run build` (esbuild).

## Tests (`tests/` — independent package, NOT wired to root scripts)

Root deps must be installed first: tests import from `src/` and `open-sse/`, which need root `node_modules` (`open`, `undici`, …). Then `npm install` inside `tests/`.

```bash
npx vitest run --config tests/vitest.config.js                          # from repo ROOT
npx vitest run --config tests/vitest.config.js unit/capabilities.test.js   # single file (path relative to tests/)
```

- **Run vitest from the repo root.** Several tests resolve `src/**` via `process.cwd()`. The `test` script inside `tests/package.json` is a stale Unix-only workaround — ignore it.
- The suite is **not all-green on a clean checkout** (~100 known failures). Judge regressions with `node tests/__baseline__/verify-no-regression.mjs <json-report>`, exactly as CI does. Expected red is catalogued in `tests/__baseline__/known-fails.txt`.
- `unit/embeddings.cloud.test.js` always fails here: it imports `cloud/src/handlers/embeddings.js`, and the `cloud/` worker directory is **not in this repo**.
- `tests/translator/real/*.real.test.js` make live provider calls — they need credentials; otherwise they skip.
- After touching the provider registry or alias logic, run the snapshot gates: `node tests/__baseline__/verify-providers.mjs`, `verify-alias.mjs`, `verify-oauth-urls.mjs`. These compare against committed JSON under `tests/__baseline__/` — commit updated snapshots with the change that caused them.
- `tests/vitest.config.js` maps `open-sse/*` and `@/*` to the repo root, so test imports resolve regardless of where vitest lives.

CI (`.github/workflows/test.yml`): Node 24, installs root then `tests/`, runs the suite with `--reporter=json`, and gates on `verify-no-regression.mjs`. A separate job runs `npm run build`.

## Architecture

Request flow (understand this first):

```
src/app/api/v1/*   (Next rewrite: /v1/* → /api/v1/*, see next.config.mjs)
  → src/sse/handlers/chat.js          app-side glue: parse, combo expansion, account-selection loop
  → open-sse/handlers/chatCore.js     engine: detect source format, translate, dispatch, retry/refresh, stream
  → open-sse/executors/*              per-provider upstream call (default.js handles OpenAI-compatible)
  → open-sse/translator/*             client format ↔ provider format
  → SSE back to client
```

`src/sse/` is the app-side entry glue; `open-sse/` is the provider-agnostic engine (also usable standalone). Crossing that boundary is a decision, not an accident.

### Translator engine (`open-sse/translator/`)

- Pivots through **OpenAI as the intermediate format**. A translator registered on an exact `source:target` pair (e.g. `claude:kiro`) is a **direct route** and skips the lossy double-hop. Prefer direct routes for fragile shapes (thinking blocks, tool ids, non-base64 images, `is_error`).
- Translators **self-register** via `register(from, to, reqFn, resFn)` as an import side effect. A new translator file MUST be imported in `open-sse/translator/index.js` or it silently never runs.
- Never hardcode role/block/model strings — use `open-sse/translator/schema/` and `open-sse/config/` constants.

### Provider registry (`open-sse/providers/registry/*`)

- One file per provider. `registry/index.js` is an **auto-generated** static import list — regenerate with `scripts/migrate-registry.mjs` / `scripts/injectDisplayToRegistry.mjs`. Do not hand-edit.
- Add a provider: copy `providers/REGISTRY_TEMPLATE.js`, add models to `config/providerModels.js`. Add an executor only for non-OpenAI-compatible upstreams.

### Persistence — SQLite (ARCHITECTURE.md is stale here)

State is **not** `db.json`. It is a SQLite layer under `src/lib/db/` with an adapter fallback chain in `driver.js`: `bun:sqlite` → `better-sqlite3` (optional native dep) → `node:sqlite` (Node ≥22.5) → `sql.js` (pure-JS, always works). `better-sqlite3` is deliberately in `optionalDependencies` so install never fails on machines without build tools — do not move it.
- `src/lib/localDb.js` is a backward-compat shim re-exporting `src/lib/db/index.js`. New code imports `@/lib/db/index.js`; per-entity logic in `src/lib/db/repos/*`; schema/migrations in `src/lib/db/migrations/`.
- DB path resolves via `src/lib/db/paths.js` (`DATA_DIR`, else `~/.9router/`).
- Usage/logs (`src/lib/usageDb.js`, `usage.json` + `log.txt`) live under `~/.9router` and do **not** follow `DATA_DIR`.

### Backups — two mechanisms, don't confuse them

- **User backup** (`exportDb`/`importDb`, `src/lib/db/index.js`; Dashboard → Download Backup, Telegram auto-backup): a **JSON** document, not a raw SQLite copy — the adapter is pluggable and file copies aren't portable/safe while live. Shape is versioned by `BACKUP_FORMAT_VERSION` in `src/lib/db/backupCompat.js`; `normalizeBackupPayload()` whitelists keys, defaults missing fields, and rejects a newer format. **Bump the version only for a breaking shape change** — additive fields need no bump. Includes usage **aggregates** (`usageDaily` rollups + lifetime counter), never `usageHistory`/`requestDetails`.
- **Internal safety backup** (`src/lib/db/backup.js`): a SQLite copy via `ATTACH`, taken only before a schema change, excludes `requestDetails`, keeps the newest 3. No automated restore.
- `exportDb()` strips non-portable secrets (`password`, `oidcClientSecret`, `telegramBackupBotToken`, `mitmSudoEncrypted`) from `settings` — they must never leave the machine. `importDb()` preserves THIS instance's values for those keys when the payload omits them (so a restore can't silently revert the dashboard password to `INITIAL_PASSWORD`); a payload that carries a key still wins. Provider credentials are intentionally kept so a restore stays useful.

### RTK token saver (`open-sse/rtk/`)

Pre-translate hooks that compress `tool_result` content in place to cut tokens. **Fail-open by design**: any error returns null and leaves the body untouched — never throw out of them. Skips `is_error` / `status:"error"` results to preserve traces.

## Conventions & gotchas

- `@/*` → `src/*`; `open-sse` and `open-sse/*` also aliased (`jsconfig.json`).
- `custom-server.js` wraps the Next standalone server to derive client IP from the TCP socket and strip attacker-controlled `X-Forwarded-For` / `X-Real-IP` — forwarding headers are trusted only from a loopback reverse proxy. Preserve this in any request/IP/rate-limit code. It also handles h2c upgrade downgrade and starts background token refresh.
- `next.config.mjs` sets `output: "standalone"`; `serverExternalPackages` keeps `better-sqlite3`, `sql.js`, `open`, `@aws-sdk/credential-providers` unbundled — `open` and the AWS SDK read paths from disk at runtime and break if bundled.
- Security-sensitive env: `JWT_SECRET`, `INITIAL_PASSWORD` (default `123456` — must override in production), `API_KEY_SECRET`, `MACHINE_ID_SALT`. Full contract in `.env.example`.
- Binary/protobuf upstreams (kiro EventStream, cursor protobuf, commandcode NDJSON) do **not** round-trip through OpenAI — handled inside their own executor, never in the translator.
- **Security-first on PRs**: audit authentication, credential/token storage and leaks, header manipulation (`X-Forwarded-For`), and SSRF before functional logic. Call out security implications explicitly.
- Versioning: root and `cli/` version independently. Log changes in `CHANGELOG.md`. Commit style is Conventional Commits (`fix(translator): …`, `feat(keys): …`).
