// Gate: compare current vitest JSON results with baseline known-fails.
// PASS when no test that PASSED in the baseline now FAILS. New tests are allowed.
// Usage: node tests/__baseline__/verify-no-regression.mjs <current-results.json>
import { readFileSync } from "fs";

const knownFails = new Set(
  readFileSync(new URL("./known-fails.txt", import.meta.url), "utf8")
    .split("\n").map(s => s.trim()).filter(Boolean)
);

const resultsPath = process.argv[2];
if (!resultsPath) { console.error("Missing results.json path"); process.exit(2); }

const r = JSON.parse(readFileSync(resultsPath, "utf8"));
// Path format: repo root may be anything (/app/, /home/runner/work/x/x/, D:\...).
// Normalize separators and key on the `tests/` prefix so known-fails.txt
// (written as `tests/unit/foo.test.js :: test name`) matches everywhere.
const relPath = (p) => {
  const norm = p.replace(/\\/g, "/");
  const i = norm.indexOf("tests/");
  return i >= 0 ? norm.slice(i) : norm;
};
const stripFingerprint = (s) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>");

const nowFails = r.testResults.flatMap(f =>
  f.assertionResults.filter(a => a.status === "failed")
    .map(a => relPath(f.name) + " :: " + stripFingerprint(a.fullName))
);

// Regression = fails now but NOT in baseline known-fails (match on raw or
// fingerprint-stripped full names).
const knownRaw = new Set([...knownFails].map(stripFingerprint));
const regressions = nowFails.filter(f => !knownFails.has(f) && !knownRaw.has(f));

if (regressions.length) {
  console.error(`\n❌ REGRESSION: ${regressions.length} test pass→fail:\n`);
  regressions.forEach(f => console.error("  - " + f));
  process.exit(1);
}
console.log(`✅ No regression. (now fails=${nowFails.length}, baseline known=${knownFails.size}, all known)`);
