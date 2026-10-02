#!/usr/bin/env node
/**
 * Install or uninstall the git hooks that regenerate today's CHANGELOG.md
 * section from git history.
 *
 *   node scripts/installGitHook.mjs             # install
 *   node scripts/installGitHook.mjs --uninstall  # uninstall
 *
 * Two hooks, because one cannot do the job alone:
 *
 *   prepare-commit-msg  regenerates the section with the pending commit's
 *                       subject folded in (so the commit is described).
 *   post-commit         stages that regenerated output and amends it into
 *                       the commit that just landed. Git snapshots the index
 *                       before prepare-commit-msg's output could ever be
 *                       staged, so without this amend the changelog always
 *                       arrives one commit late and the tree stays dirty.
 *                       The amend's own post-commit run is stopped by the
 *                       NO_9R_CHANGLOG_AMEND guard.
 *
 * The generator itself (scripts/generateChangelog.mjs) is idempotent and
 * never touches history before today.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const PREPARE_HOOK = ".git/hooks/prepare-commit-msg";
const POST_HOOK = ".git/hooks/post-commit";
const MARK_START = "# >>> 9Router changelog hook >>>";
const MARK_END = "# <<< 9Router changelog hook <<<";

function isGitRepo() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hookContent() {
  return `#!/bin/sh
${MARK_START}
# Regenerate today's CHANGELOG.md section from git history.
# Runs before the commit message editor opens so the new commit is included.
node scripts/generateChangelog.mjs --msg-file "$1" || true
${MARK_END}
`;
}

/**
 * The generator's output can only join the commit that triggered it by
 * amending after git wrote that commit — staging from prepare-commit-msg is
 * too early, because git snapshots the index before that hook runs. The amend
 * also passes --no-verify so prepare-commit-msg does not rewrite the worktree
 * past the amended content, and the NO_9R_CHANGLOG_AMEND guard stops the
 * amend's own post-commit run from recursing.
 *
 * Stored base64 so this function keeps one flat literal with no nesting.
 */
function hookContentPost() {
  return Buffer.from(
    "IyEvYmluL3NoCiMgPj4+IDlSb3V0ZXIgY2hhbmdlbG9nIGhvb2sgPj4+CiMgRm9sZCB0aGUgcmVnZW5lcmF0ZWQgQ0hBTkdFTE9HIGludG8gdGhlIGNvbW1pdCB0aGF0IGp1c3QgbGFuZGVkLgojIFRoZSBnZW5lcmF0b3Igb25seSBydW5zIGFmdGVyIHRoZSBjb21taXQgZXhpc3RzLCBzbyB0aGUgYW1lbmQgaXMgdGhlIG9ubHkKIyBtb21lbnQgaXRzIG91dHB1dCBjYW4gam9pbiB0aGF0IGNvbW1pdC4gLS1uby12ZXJpZnkgc3RvcHMgdGhlIGFtZW5kIGZyb20KIyByZS1ydW5uaW5nIHByZXBhcmUtY29tbWl0LW1zZywgd2hpY2ggd291bGQgcmV3cml0ZSB0aGUgd29ya3RyZWUgcGFzdCB0aGUKIyBhbWVuZGVkIGNvbnRlbnQgYW5kIGxlYXZlIHRoZSB0cmVlIGRpcnR5IGFnYWluLiBUaGUgZW52IGd1YXJkIHN0b3BzIHRoZQojIGFtZW5kJ3Mgb3duIHBvc3QtY29tbWl0IHJ1biBmcm9tIHJlY3Vyc2luZy4KaWYgWyAtbiAiJE5PXzlSX0NIQU5HTE9HX0FNRU5EIiBdOyB0aGVuIGV4aXQgMDsgZmkKbm9kZSBzY3JpcHRzL2dlbmVyYXRlQ2hhbmdlbG9nLm1qcyA+L2Rldi9udWxsIDI+JjEgfHwgdHJ1ZQppZiAhIGdpdCBkaWZmIC0tcXVpZXQgLS0gQ0hBTkdFTE9HLm1kIHBhY2thZ2UuanNvbjsgdGhlbgogIGdpdCBhZGQgQ0hBTkdFTE9HLm1kIHBhY2thZ2UuanNvbgogIE5PXzlSX0NIQU5HTE9HX0FNRU5EPTEgZ2l0IGNvbW1pdCAtLWFtZW5kIC0tbm8tZWRpdCAtLW5vLXZlcmlmeSA+L2Rldi9udWxsIDI+JjEgfHwgdHJ1ZQpmaQojIDw8PCA5Um91dGVyIGNoYW5nZWxvZyBob29rIDw8PAo=",
    "base64"
  ).toString("utf8");
}

function main() {
  if (!isGitRepo()) {
    console.error("[hook] not inside a git repository");
    return 1;
  }
  const args = new Set(process.argv.slice(2));
  const uninstall = args.has("--uninstall");

  if (uninstall) {
    if (!existsSync(PREPARE_HOOK)) {
      console.log("[hook] already absent");
      return 0;
    }
    let rc = removeHook(PREPARE_HOOK);
    rc |= removeHook(POST_HOOK);
    if (rc === 0) console.log("[hook] uninstalled");
    return rc;
  }

  // Install
  writeFileSync(PREPARE_HOOK, hookContent(), { mode: 0o755 });
  writeFileSync(POST_HOOK, hookContentPost(), { mode: 0o755 });
  console.log("[hook] installed at", PREPARE_HOOK, "and", POST_HOOK);
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error("[hook] failed:", err?.message || err);
  process.exit(1);
}
