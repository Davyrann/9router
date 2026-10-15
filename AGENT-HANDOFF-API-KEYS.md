# Agent Handoff — API Keys improvements

> Note: repo ignores `docs/*` (`.gitignore`), so this file lives at repo root.

Living doc. Update after each step lands. Pushed to the repo so the next
session (or agent) picks up exact state.

## Plan (5 steps)

| # | Step | Version | Status |
|---|------|---------|--------|
| 1 | Usage per key + stale badge | 0.6.1 | DONE (pushed) |
| 2 | Inline rename + search | 0.6.2 | DONE (pushed) |
| 3 | Key expiry | 0.7.0 | DONE (unpushed, in this branch) |
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

## Step 2 notes (done)

- `PUT /api/keys/[id]` accepts `name` (trim, non-empty, max 64) — validated in the
  route; `updateApiKey` already merged `name`, no repo change.
- UI (`EndpointPageClient.js`): `renaming` state `{ id, name }`; pencil icon next
  to the key name → inline Input with Save/Cancel (Enter saves, Esc cancels).
  Name row truncates; edit icon is hover-reveal on desktop (`sm:`), always visible
  on mobile.
- Search box in card header, only rendered when `keys.length > 1`; filters
  client-side by name (case-insensitive). No-match state shows
  `No keys match "<query>"` + Clear search button.
- Verified in browser: rename persisted to DB ("Production Key" seen in
  `apiKeys` table + UI), filtering hid non-matching keys, no-match state shown.
  Test key removed, name restored to "Default Key" afterwards.
- Note: browser.evaluate cannot type into React inputs correctly (needs native
  value setter); use the `fill` browser tool for typing in future verification.

## Step 3 notes (done)

- `SCHEMA_VERSION` 2 → 3 (`src/lib/db/schema.js`); `expiresAt TEXT` added to
  `apiKeys`. Server must see it at boot — also applied directly to the local DB
  via `ALTER TABLE` (no restart needed this time).
- Threaded through `rowToKey` / `createApiKey(name, machineId, expiresAt)` /
  `updateApiKey`. `POST /api/keys` accepts optional future-dated ISO (date input
  anchored to end-of-day so timezone-UTC-midnight can't land in the past);
  `PUT /api/keys/[id]` accepts `expiresAt`, `null`/`""` clears it.
- Enforcement in `isValidApiKey()` (`src/sse/services/auth.js`): resolves full row
  via `getApiKeyByKey`, rejects `expiresAt <= now`. All `/v1` handlers inherit.
  Verified: expired key → 401 on `/v1/chat/completions`; active key → 404
  (auth passed). Past-date PUT → 400.
- UI (`EndpointPageClient.js`): optional `type="date"` input in create modal;
  row shows `· expires in Nd` (amber ≤7d, muted otherwise, full date >30d) or
  `expired … ago` (red). `Created` line now uses `useTimezone()` instead of
  hard-coded `toLocaleDateString()`. Create-modal buttons stack on mobile.
- Lint: `react/no-unescaped-entities` in the new no-match string fixed; rest
  pre-existing.

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
