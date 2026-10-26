import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { closeDatabaseAt, openDatabaseAt } from "@/db";
import { runWithSandboxDb } from "@/db/sandbox-context";
import {
  DEMO_DISABLED_MESSAGE,
  SANDBOX_COOKIE,
  isPublicDemo,
} from "@/lib/demo-mode";

/**
 * Public demo sandboxes: every visitor gets a private copy of the seeded
 * database, keyed by the premise_sandbox cookie, so one visitor's chaos slider
 * never changes what another visitor sees.
 */
export const SANDBOX_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_SANDBOXES = 500;

const SANDBOX_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SANDBOX_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.db$/;
const TEMPLATE_FILE = "_template.db";

export function resolveSandboxDir(): string {
  return process.env.PREMISE_SANDBOX_DIR || "/tmp/premise-sandboxes";
}

export function isValidSandboxId(id: string | null | undefined): id is string {
  return typeof id === "string" && SANDBOX_ID_PATTERN.test(id);
}

export function sandboxDbPath(id: string): string {
  return path.join(resolveSandboxDir(), `${id}.db`);
}

function removeSandboxFiles(dbPath: string) {
  closeDatabaseAt(dbPath);
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    } catch {
      // Best effort; a later prune retries
    }
  }
}

/**
 * Deletes sandboxes older than 24 hours, then the oldest ones until at most
 * `limit` remain. The seed template is never pruned.
 */
export function pruneSandboxes(limit: number = MAX_SANDBOXES, now: number = Date.now()) {
  const dir = resolveSandboxDir();
  let entries: Array<{ dbPath: string; mtimeMs: number }> = [];
  try {
    entries = fs
      .readdirSync(dir)
      .filter((name) => SANDBOX_FILE_PATTERN.test(name))
      .map((name) => {
        const dbPath = path.join(dir, name);
        return { dbPath, mtimeMs: fs.statSync(dbPath).mtimeMs };
      });
  } catch {
    return;
  }

  const fresh: typeof entries = [];
  for (const entry of entries) {
    if (now - entry.mtimeMs > SANDBOX_TTL_MS) {
      removeSandboxFiles(entry.dbPath);
    } else {
      fresh.push(entry);
    }
  }

  fresh.sort((a, b) => a.mtimeMs - b.mtimeMs);
  while (fresh.length > limit) {
    removeSandboxFiles(fresh.shift()!.dbPath);
  }
}

/**
 * Returns the visitor's sandbox database path, creating it from the seeded
 * template when missing or older than 24 hours.
 */
export function ensureVisitorSandbox(id: string): string {
  const dir = resolveSandboxDir();
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = sandboxDbPath(id);

  if (fs.existsSync(dbPath)) {
    const ageMs = Date.now() - fs.statSync(dbPath).mtimeMs;
    if (ageMs <= SANDBOX_TTL_MS) return dbPath;
    removeSandboxFiles(dbPath);
  }

  // Make room for the new sandbox before creating it
  pruneSandboxes(MAX_SANDBOXES - 1);
  const template = openDatabaseAt(path.join(dir, TEMPLATE_FILE));
  template.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`);
  return dbPath;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function buildSandboxCookie(id: string, secure: boolean): string {
  const maxAge = Math.floor(SANDBOX_TTL_MS / 1000);
  return `${SANDBOX_COOKIE}=${id}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${
    secure ? "; Secure" : ""
  }`;
}

function isHttpsRequest(req: Request): boolean {
  return (
    req.headers.get("x-forwarded-proto") === "https" ||
    req.url.startsWith("https:")
  );
}

/**
 * Runs `fn` against the visitor's sandbox database identified by `cookieId`.
 * Returns the sandbox id actually used (a new one when the cookie is missing).
 */
export async function runInVisitorSandbox<T>(
  cookieId: string | null | undefined,
  fn: () => T | Promise<T>
): Promise<{ id: string; result: T }> {
  const id = isValidSandboxId(cookieId) ? cookieId : randomUUID();
  const dbPath = ensureVisitorSandbox(id);
  const result = await runWithSandboxDb(dbPath, fn);
  return { id, result };
}

type RouteHandler<R extends Request, A extends unknown[]> = (
  req: R,
  ...rest: A
) => Response | Promise<Response>;

/**
 * Wraps an API route so that, in public demo mode, every database call it
 * makes goes to the caller's own sandbox. Outside demo mode it is a no-op.
 */
export function withDemoSandbox<R extends Request, A extends unknown[]>(
  handler: RouteHandler<R, A>
): RouteHandler<R, A> {
  return async (req, ...rest) => {
    if (!isPublicDemo()) return handler(req, ...rest);
    const cookieId = readCookie(req, SANDBOX_COOKIE);
    const { id, result } = await runInVisitorSandbox(cookieId, () =>
      handler(req, ...rest)
    );
    if (id !== cookieId) {
      try {
        result.headers.append(
          "Set-Cookie",
          buildSandboxCookie(id, isHttpsRequest(req))
        );
      } catch {
        // Immutable headers; the middleware cookie covers page visits
      }
    }
    return result;
  };
}

export function demoDisabledResponse() {
  return NextResponse.json({ error: DEMO_DISABLED_MESSAGE }, { status: 403 });
}
