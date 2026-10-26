/**
 * Public demo mode switches. Kept free of Node imports so middleware (edge)
 * and client-safe modules can read the same flags.
 */
export const SANDBOX_COOKIE = "premise_sandbox";
export const DEMO_DISABLED_MESSAGE = "Disabled in public demo";

/** PREMISE_PUBLIC_DEMO=1: per-visitor sandboxes, no outbound calls, no file writes. */
export function isPublicDemo(): boolean {
  return process.env.PREMISE_PUBLIC_DEMO === "1";
}

/** Repo scanner targets that resolve to the bundled demo repo. */
export const DEMO_REPO_SCAN_TARGETS = [
  "github.com/company/core-monorepo",
  "examples/demo-repo",
];

export function isDemoRepoScanTarget(target: string | null | undefined): boolean {
  return !target || DEMO_REPO_SCAN_TARGETS.includes(target.trim());
}
