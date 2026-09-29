# Changelog

## v0.5.145

- fix: pin @types/react-dom to existing 18.x to fix Railway install

## v0.5.144

- fix: bump next to 14.2.35 to resolve high severity CVEs

## v0.5.143

- feat: show available models in apikey session usage
- feat: allow combo as custom model target with cycle guard

## v0.5.142

- feat: show centered loading overlay with progress while exporting, importing, or testing a backup
- feat: run backup import as a background job with per section progress so the UI stays responsive

## v0.5.141

- feat: include permissions and createdBy columns in apiKeys backup export/import
- fix: added createdBy "dashboard" value for dashboard users in POST /api/keys
- feat: add backup self-check for round-trip export->import preserving apiKey metadata
- fix: fix round-trip exportDb/importDb to preserve permissions and createdBy fields

## v0.5.140

- fix: stop the model picker heading a group with a generated node id
- fix: disambiguate compatible provider headings with a short uuid suffix so two custom providers never share one label
- test: add structural and distinctness cases for the new heading disambiguation in providerDisplaySelfCheck

## v0.5.139

- fix: correct a streamed tool-call name without holding the stream back
- fix: stop the model picker heading a group with a generated node id
- fix: rescue tool calls the client would reject with an invalid-args error

## v0.5.138

- fix: restore seren chat core