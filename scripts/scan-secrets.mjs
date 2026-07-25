#!/usr/bin/env node
/**
 * scan-secrets.mjs — dependency-free secret scanner (defense-in-depth).
 *
 * Fails with exit code 1 if a high-signal credential pattern appears in the
 * files it checks. Two modes:
 *   --staged  (default; used by the pre-commit hook) — scans files staged for commit.
 *   --all     (used by CI)                           — scans every git-tracked text file.
 *
 * It only ever reads git-tracked / staged files (never node_modules, never
 * history) and skips lockfiles, binaries, and itself to avoid false positives.
 * This complements — it does not replace — GitHub's native secret scanning /
 * push protection, which should also be enabled once the repo is public.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const mode = process.argv.includes("--all") ? "all" : "staged";

/** High-signal credential patterns, kept tight to avoid crying wolf. */
const PATTERNS = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9]{20,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["GitHub fine-grained PAT", /\bgithub_pat_[A-Za-z0-9_]{22,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Slack webhook", /hooks\.slack\.com\/services\/[A-Za-z0-9\/]{20,}/],
  ["Discord webhook", /discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}/],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  [
    "fal.ai key (id:secret)",
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32,}\b/,
  ],
  [
    "assigned credential literal",
    /(?:api[_-]?key|secret|token|passwd|password)\s*[:=]\s*['"][A-Za-z0-9_\-./+=]{16,}['"]/i,
  ],
];

/** Files never scanned: false-positive sources, binaries, and this script. */
const EXCLUDE = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)scripts\/scan-secrets\.mjs$/,
  /(^|\/)\.githooks\//,
  /\.(png|jpe?g|gif|ico|svg|webp|pdf|zip|gz|woff2?|ttf|eot|mp4|mov)$/i,
];

/** Returns the list of files to scan for the active mode. */
function filesToScan() {
  const args =
    mode === "all"
      ? ["ls-files"]
      : ["diff", "--cached", "--name-only", "--diff-filter=ACM"];
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

let hits = 0;
for (const file of filesToScan()) {
  if (EXCLUDE.some((re) => re.test(file))) continue;
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    continue; // staged-but-deleted, or unreadable
  }
  if (buf.includes(0)) continue; // binary
  const lines = buf.toString("utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [name, re] of PATTERNS) {
      if (re.test(line)) {
        console.error(`  ✖ ${file}:${i + 1}  possible ${name}`);
        hits++;
      }
    }
  });
}

if (hits > 0) {
  console.error(`\nsecret-scan: ${hits} possible secret(s) found (${mode} mode) — blocked.`);
  console.error(
    "If this is a false positive, tighten scripts/scan-secrets.mjs; otherwise move the value " +
      "to a GitHub Actions secret and purge it. Emergency bypass (local): git commit --no-verify."
  );
  process.exit(1);
}
console.log(`secret-scan: clean (${mode} mode).`);
