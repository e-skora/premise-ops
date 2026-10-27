/**
 * Bun test preload (see bunfig.toml). Runs once before any test file loads and
 * makes the suite hermetic:
 *  - scrubs project and vendor env vars so no real token or URL leaks in
 *  - creates a fresh scratch folder per run and points HOME, the SQLite
 *    database and the locus workspace root at it
 *  - copies the demo fixture files the tests patch into that scratch folder,
 *    so apply/rollback never touches the working checkout
 *  - replaces fetch with a guard that refuses every outside request
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRUBBED_PREFIXES = [
  "PREMISE_",
  "OPENAI_",
  "GITHUB_",
  "SLACK_",
  "PAGERDUTY_",
  "ANTHROPIC_",
];
const SCRUBBED_KEYS = ["GH_TOKEN", "NEXT_PUBLIC_APP_URL"];

for (const key of Object.keys(process.env)) {
  if (
    SCRUBBED_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    SCRUBBED_KEYS.includes(key)
  ) {
    delete process.env[key];
  }
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "premise-test-"));
const workspaceRoot = path.join(scratchRoot, "workspace");
const homeDir = path.join(scratchRoot, "home");

const FIXTURE_PATHS = ["examples/demo-repo"];

fs.mkdirSync(workspaceRoot, { recursive: true });
fs.mkdirSync(homeDir, { recursive: true });
for (const rel of FIXTURE_PATHS) {
  const src = path.join(repoRoot, rel);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(workspaceRoot, rel), { recursive: true });
  }
}

process.env.HOME = homeDir;
process.env.PREMISE_DB_PATH = path.join(scratchRoot, "premise-test.db");
process.env.PREMISE_WORKSPACE_ROOT = workspaceRoot;
process.env.PREMISE_SANDBOX_DIR = path.join(scratchRoot, "sandboxes");

// No test may reach a real outside API. Tests that need a response swap in
// their own fetch mock and restore this guard afterwards.
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  throw new Error(`Network access is blocked in tests (attempted: ${url})`);
}) as unknown as typeof fetch;

process.on("exit", () => {
  try {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  } catch {
    // Scratch folder lives in the OS temp dir; leaving it behind is harmless
  }
});
