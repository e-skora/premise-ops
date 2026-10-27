import fs from "node:fs";
import path from "node:path";
import type { LiveFetchResult } from "./live-feeds";

/**
 * Offline feed mode for CI: when PREMISE_FEED_FIXTURE_DIR is set, outside
 * probes read saved copies listed in <dir>/manifest.json instead of the
 * network. fetchedAt is the time the saved copy was really fetched.
 */
interface FeedManifest {
  feeds: Record<string, { file: string; fetchedAt: string }>;
}

export function savedFeedDir(): string | null {
  return process.env.PREMISE_FEED_FIXTURE_DIR?.trim() || null;
}

export function loadSavedFeed(url: string, dir: string): LiveFetchResult {
  const manifestPath = path.resolve(dir, "manifest.json");
  let manifest: FeedManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as FeedManifest;
  } catch (err) {
    return {
      ok: false,
      error: `Offline feed mode: cannot read ${manifestPath} (${err instanceof Error ? err.message : String(err)})`,
      latencyMs: 0,
    };
  }
  const entry = manifest.feeds?.[url.trim()];
  if (!entry) {
    return {
      ok: false,
      error: `Offline feed mode: no saved copy of ${url} in ${manifestPath}`,
      latencyMs: 0,
    };
  }
  try {
    const json = JSON.parse(fs.readFileSync(path.resolve(dir, entry.file), "utf8")) as unknown;
    return { ok: true, json, fetchedAt: entry.fetchedAt, fromCache: false, latencyMs: 0 };
  } catch (err) {
    return {
      ok: false,
      error: `Offline feed mode: cannot read saved copy ${entry.file} (${err instanceof Error ? err.message : String(err)})`,
      latencyMs: 0,
    };
  }
}
