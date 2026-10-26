import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped database selection for public demo mode. While a request runs
 * inside runWithSandboxDb, getDb() returns that visitor's private SQLite file
 * instead of the shared database.
 */
type SandboxStore = { dbPath: string };

declare global {
  // eslint-disable-next-line no-var
  var __premiseSandboxStorage: AsyncLocalStorage<SandboxStore> | undefined;
}

const storage: AsyncLocalStorage<SandboxStore> =
  global.__premiseSandboxStorage ??
  (global.__premiseSandboxStorage = new AsyncLocalStorage<SandboxStore>());

export function runWithSandboxDb<T>(dbPath: string, fn: () => T): T {
  return storage.run({ dbPath }, fn);
}

export function getActiveSandboxDbPath(): string | null {
  return storage.getStore()?.dbPath ?? null;
}
