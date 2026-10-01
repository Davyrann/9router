# v0.5.151 (2026-09-30)

## Fixes
- **Import**: show bulk import progress overlay and block closing the modal while a bulk add/import loop is running, split large codex/grok payloads into batches of 20
- **Logging**: dedupe repeated auth-failure log lines per source/ip/key prefix so a misconfigured polling client no longer floods the log, 401 responses still sent
- **Backup**: forward the backup password as `x-9r-password` header when polling the import job so password-protected imports track progress
- **Providers**: resolve provider aliases for suggested-model fetcher lookup, fall back to built-in models with an error note when upstream is unreachable, tolerate upstream schema drift

# v0.5.150 (2026-09-30)

## Fixes
- **API Keys**: show created-by label under each API key name on the endpoint page
- **API Keys**: include `createdBy` in `POST /api/keys` 201 response
- **Inspector**: open live-requests inspector stream without login gate, scope rows by key `allowedModels`, refresh every 5s
- **Models**: hide orphaned compat alias ghost groups in the model picker and clean up custom models plus aliases on provider node delete

## Internal
- **Tests**: add structural backup self-check covering apiKeys permissions and createdBy round-trip

# v0.5.149 (2026-09-30)

## Fixes
- **Settings**: move tracing config into experimental and exclude user profile paths

# v0.5.148 (2026-09-30)

## Fixes
- **Build**: mark db adapters external the Next 14 way so bun sqlite skips the webpack bundle

# v0.5.147 (2026-09-30)

## Fixes
- **Build**: restore build dependencies dropped during the Next 14 downgrade

# v0.5.146 (2026-09-29)

## Fixes
- **Build**: drop unknown webpack flag from the build script for next 14.2.35

# v0.5.145 (2026-09-29)

## Fixes
- **Build**: pin `@types/react-dom` to existing 18.x to fix Railway install

# v0.5.144 (2026-09-29)

## Security
- **Build**: bump next to 14.2.35 to resolve high severity CVEs

# v0.5.143 (2026-09-29)

## Features
- **Usage**: show available models in apikey session usage
- **Models**: allow combo as custom model target with cycle guard

# v0.5.142 (2026-09-29)

## Features
- **Backup**: show centered loading overlay with progress while exporting, importing, or testing a backup
- **Backup**: run backup import as a background job with per-section progress so the UI stays responsive

# v0.5.141 (2026-09-29)

## Features
- **Backup**: include permissions and `createdBy` columns in apiKeys backup export/import
- **Backup**: add backup self-check for round-trip export→import preserving apiKey metadata

## Fixes
- **API Keys**: add `createdBy` `"dashboard"` value for dashboard users in `POST /api/keys`
- **Backup**: fix round-trip `exportDb`/`importDb` to preserve permissions and `createdBy` fields

# v0.5.140 (2026-09-28)

## Fixes
- **Models**: stop the model picker heading a group with a generated node id
- **Models**: disambiguate compatible provider headings with a short uuid suffix so two custom providers never share one label

## Internal
- **Tests**: add structural and distinctness cases for the new heading disambiguation in `providerDisplaySelfCheck`

# v0.5.139 (2026-09-28)

## Fixes
- **Streaming**: correct a streamed tool-call name without holding the stream back
- **Models**: stop the model picker heading a group with a generated node id
- **Tool calls**: rescue tool calls the client would reject with an invalid-args error

# v0.5.138 (2026-09-28)

## Fixes
- **Chat**: restore seren chat core