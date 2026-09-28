# Changelog

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
