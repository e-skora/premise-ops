/**
 * Real outside data for probes: source labels, the public demo allowlist and
 * a short cache so many visitors share one upstream request.
 */

// Public, keyless list of models with per-token prices.
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// The only outside URLs a public demo probe may fetch (exact match)
export const PUBLIC_DEMO_FETCH_ALLOWLIST: ReadonlySet<string> = new Set([
  OPENROUTER_MODELS_URL,
]);

export const LIVE_FEED_CACHE_TTL_MS = 10 * 60 * 1000;
const LIVE_FEED_TIMEOUT_MS = 8000;

// Premise.valueSource labels
export const DEMO_SEED_SOURCE = "demo-seed";
const LIVE_SOURCE_PREFIX = "live:";

export function liveSourceLabel(url: string): string {
  return `${LIVE_SOURCE_PREFIX}${url}`;
}

// A real response saved earlier and replayed offline (CI)
const SAVED_SOURCE_PREFIX = "saved:";

export function savedSourceLabel(url: string): string {
  return `${SAVED_SOURCE_PREFIX}${url}`;
}

export function isLiveSource(source: string | null | undefined): boolean {
  return Boolean(source && source.startsWith(LIVE_SOURCE_PREFIX));
}

export function liveSourceUrl(source: string | null | undefined): string | null {
  return isLiveSource(source) ? source!.slice(LIVE_SOURCE_PREFIX.length) : null;
}

// Sources that mean the app made the value up for the demo (seed, chaos
// drawer, CLI simulations, the demo feed and its jitter)
const DEMO_SOURCE_PREFIXES = [
  DEMO_SEED_SOURCE,
  "chaos-",
  "premise-cli-",
  "sse-autonomous-daemon",
  "probe:",
  "historical",
];

/** live: fetched from a real outside source. saved: a real response saved earlier. reported: pushed in by someone. demo: made up by this app. */
export function classifyValueSource(
  source: string | null | undefined
): "live" | "saved" | "reported" | "demo" {
  if (isLiveSource(source)) return "live";
  if (source && source.startsWith(SAVED_SOURCE_PREFIX)) return "saved";
  if (!source || DEMO_SOURCE_PREFIXES.some((prefix) => source.startsWith(prefix))) {
    return "demo";
  }
  return "reported";
}

export function isOutsideUrl(target: string): boolean {
  return /^https?:\/\//i.test(target.trim());
}

export function isAllowedInPublicDemo(url: string): boolean {
  return PUBLIC_DEMO_FETCH_ALLOWLIST.has(url.trim());
}

export type LiveFetchResult =
  | { ok: true; json: unknown; fetchedAt: string; fromCache: boolean; latencyMs: number }
  | { ok: false; error: string; latencyMs: number };

interface CacheEntry {
  json: unknown;
  fetchedAt: string;
  expiresAtMs: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __premiseLiveFeedCache: Map<string, CacheEntry> | undefined;
}

function cache(): Map<string, CacheEntry> {
  return (global.__premiseLiveFeedCache ??= new Map());
}

export function clearLiveFeedCache(): void {
  cache().clear();
}

/**
 * GETs a JSON document. Allowlisted URLs are cached for 10 minutes; fetchedAt
 * is always the time of the real network request, even on a cache hit.
 */
export async function fetchLiveJson(url: string): Promise<LiveFetchResult> {
  const startMs = Date.now();
  const cacheable = isAllowedInPublicDemo(url);
  if (cacheable) {
    const hit = cache().get(url);
    if (hit && hit.expiresAtMs > startMs) {
      return { ok: true, json: hit.json, fetchedAt: hit.fetchedAt, fromCache: true, latencyMs: 0 };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${res.status} from ${url}${body ? `: ${body.slice(0, 160)}` : ""}`,
        latencyMs: Date.now() - startMs,
      };
    }
    const json = (await res.json()) as unknown;
    const fetchedAt = new Date().toISOString();
    if (cacheable) {
      cache().set(url, { json, fetchedAt, expiresAtMs: Date.now() + LIVE_FEED_CACHE_TTL_MS });
    }
    return { ok: true, json, fetchedAt, fromCache: false, latencyMs: Date.now() - startMs };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Timed out after ${LIVE_FEED_TIMEOUT_MS}ms fetching ${url}`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: message, latencyMs: Date.now() - startMs };
  } finally {
    clearTimeout(timer);
  }
}
