"use client";

import { PremiseRecord } from "@/lib/types";
import {
  classifyValueSource,
  isLiveSource,
  isOutsideUrl,
  liveSourceUrl,
} from "@/lib/live-feeds";

/** "2 USD / 1M tokens", or "No value yet" when nothing has been reported. */
export function premiseValueText(premise: Pick<PremiseRecord, "currentValue" | "unit">): string {
  return premise.currentValue.trim()
    ? `${premise.currentValue}${premise.unit ? ` ${premise.unit}` : ""}`
    : "No value yet";
}

/** Fixed format so server and client render the same text. */
export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return "unknown time";
  return `${iso.replace("T", " ").slice(0, 16)} UTC`;
}

/**
 * Says where a premise's value came from: a real live fetch (with the source
 * and fetch time), the app's own demo data, or nothing yet.
 */
export default function PremiseSourceBadge({ premise }: { premise: PremiseRecord }) {
  const probe = premise.probes[0];
  const hasValue = premise.currentValue.trim() !== "";
  const lastError = probe?.lastError || null;

  if (hasValue && isLiveSource(premise.valueSource)) {
    const url = liveSourceUrl(premise.valueSource)!;
    return (
      <div className="space-y-1 text-[10px] font-mono">
        <div className="flex flex-wrap items-center gap-1.5 text-zinc-400">
          <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-semibold uppercase">
            Live
          </span>
          <span>from</span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:underline break-all"
          >
            {url}
          </a>
          <span>· fetched {formatUtc(premise.valueObservedAt)}</span>
        </div>
        {lastError && (
          <div className="text-rose-300">
            Last fetch failed: {lastError}. Showing the last real value.
          </div>
        )}
      </div>
    );
  }

  if (!hasValue) {
    const target = probe?.targetUrlOrQuery?.trim() || "";
    const reason =
      !probe || probe.status === "UNBOUND" || !target
        ? "Probe suggested, not connected. Set a real source to start measuring."
        : lastError
          ? `Last fetch failed: ${lastError}`
          : isOutsideUrl(target)
            ? `Waiting for the first fetch from ${target}`
            : "Waiting for a probe to report a value.";
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-400">
        <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold uppercase">
          No value yet
        </span>
        <span className={lastError ? "text-rose-300" : undefined}>{reason}</span>
      </div>
    );
  }

  if (classifyValueSource(premise.valueSource) === "saved") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-400">
        <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-300 border border-violet-500/30 font-semibold uppercase">
          Saved copy
        </span>
        <span>
          From a saved copy of {premise.valueSource!.slice("saved:".length)} fetched{" "}
          {formatUtc(premise.valueObservedAt)}
        </span>
      </div>
    );
  }

  if (classifyValueSource(premise.valueSource) === "reported") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-400">
        <span className="px-1.5 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/30 font-semibold uppercase">
          Reported
        </span>
        <span>
          Pushed to the metric webhook (source: {premise.valueSource}) at{" "}
          {formatUtc(premise.valueObservedAt)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-[10px] font-mono">
      <div className="flex flex-wrap items-center gap-1.5 text-zinc-400">
        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 font-semibold uppercase">
          Demo data
        </span>
        <span>Seeded or simulated by this app, not a real measurement.</span>
      </div>
      {lastError && <div className="text-rose-300">Last probe error: {lastError}</div>}
    </div>
  );
}
