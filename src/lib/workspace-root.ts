/**
 * Root folder that targetLocus paths, codebase scans and local git operations
 * resolve against. Tests point PREMISE_WORKSPACE_ROOT at a scratch copy so they
 * never read or write files in the working checkout.
 */
export function resolveWorkspaceRoot(): string {
  return process.env.PREMISE_WORKSPACE_ROOT || process.cwd();
}
