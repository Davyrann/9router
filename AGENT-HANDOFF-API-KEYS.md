# Agent Handoff — API Keys improvements

> Note: repo ignores `docs/*` (`.gitignore`), so this file lives at repo root.

Living doc. Update after each step lands. Pushed to the repo so the next
session (or agent) picks up exact state.

## Plan (5 steps)

| # | Step | Version | Status |
|---|------|---------|--------|
| 1 | Usage per key + stale badge | 0.6.1 | DONE (unpushed, in this branch) |
| 2 | Inline rename + search | 0.6.2 | TODO |
| 3 | Key expiry | 0.7.0 | TODO |
| 4 | Per-key quota | 0.8.0 | TODO |
| 5 | This handoff doc | — | started |

## Step 1 notes (done)

- `getApiKeyUsageSummary()` in `src/lib/db/repos/apiKeysRepo.js`: one GROUP BY
  over `usageHistory.apiKey` → `{ requests, promptTokens, completionTokens, lastUsed }`.
  Exported via `src/lib/db/index.js` + `src/lib/localDb.js`.
- `GET /api/keys` (`src/app/api/keys/route.js`) attaches `usage` per key (null when none).
- Row UI (`EndpointPageClient.js`): usage line `N requests · X tokens · last used Y`;
  `Stale` badge + quick Pause when `lastUsed` (or `createdAt` if never used) is
  90+ days old (`STALE_AFTER_MS`); helpers `fmtTokens` / `fmtRelative` / `isKeyStale`
  defined above the component. Row is `flex-col` on mobile, `sm:flex-row` on desktop.
- Verified in browser (`/dashboard/endpoint`): "129 requests · 2.2M tokens ·
  last used just now" on seeded data. Seed removed afterwards
  (`usageHistory` back to 0). Screenshot taken during verification.
- Lint: only pre-existing errors in this file (verified via `git stash`).

## Step 2 notes (todo)

- Extend `PUT /api/keys/[id]` (`src/app/api/keys/[id]/route.js`) to accept `name`
  (trim, non-empty, max 64). `updateApiKey` already merges `name` — no repo change.
- UI: edit icon in key name row → inline input (Enter saves, Esc cancels);
  search box in card header, client-side filter by name.
- Mobile: modal + search full width; keep touch targets ≥ 44px.
- Changelog entry under next version `## Features`.

## Step 3 notes (todo)

- Add `expiresAt TEXT` (nullable) to `apiKeys` in `src/lib/db/schema.js`
  (`syncSchemaFromTables()` picks it up on boot; NULL = never expires).
- Thread through `rowToKey` / `createApiKey` / `updateApiKey`; `POST` accepts
  optional future-dated ISO; `PUT` sets/clears.
- Enforcement in `isValidApiKey()` (`src/sse/services/auth.js`): expired → false.
  All 6+ `/v1` handlers inherit this. Compare server-side (ISO UTC), never client time.
- UI: expiry input in create modal + badge ("expires in 12d" amber / "expired" red);
  format with `useFormatTime()` (replaces hard-coded `toLocaleDateString()` in row).

## Step 4 notes (todo)

- Columns: `quotaLimit INTEGER NULL`, `quotaWindow TEXT NULL`
  ('daily'|'monthly'), `quotaUsed INTEGER DEFAULT 0`, `quotaResetAt TEXT NULL`.
- Increment atomically per successful request (better-sqlite3 transaction, same
  pattern as `usageRepo` daily counters). Lazy reset: if `now > quotaResetAt`,
  zero `quotaUsed` and compute next boundary — no cron.
- Over quota → 429. Decide: quota counts requests (cheap) or tokens (needs token
  totals at check time). Recommended default: requests.
- UI: limit + window inputs, thin progress bar, "reset now" button.
- Needs tests: increment, lazy reset at boundary, 429 path.

## Shared conventions

- Changelog format: top entry `# vX.Y.Z (YYYY-MM-DD)` with `## Features` /
  `## Fixes` bullets prefixed `- **API Keys**: ...`.
- Dates/times: `useFormatTime()` (respects the user's timezone setting).
- Mobile: `sm:` stack pattern, verify in browser at ~390px width before commit.
- Commit style: conventional commits, one feature per commit.
