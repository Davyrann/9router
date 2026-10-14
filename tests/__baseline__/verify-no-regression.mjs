// Gate: so kết quả test hiện tại với baseline known-fails.
// PASS nếu KHÔNG có test nào pass(baseline) → fail(now). Test mới được phép.
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
const nowFails = r.testResults.flatMap(f =>
  f.assertionResults.filter(a => a.status === "failed")
    .map(a => relPath(f.name) + " :: " + a.fullName)
);

// Regression = fail bây giờ NHƯNG không có trong baseline known-fails
const regressions = nowFails.filter(f => !knownFails.has(f));

if (regressions.length) {
  console.error(`\n❌ REGRESSION: ${regressions.length} test pass→fail:\n`);
  regressions.forEach(f => console.error("  - " + f));
  process.exit(1);
}
console.log(`✅ No regression. (now fails=${nowFails.length}, baseline known=${knownFails.size}, all known)`);
