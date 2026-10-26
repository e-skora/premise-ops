"use client";

import React, { useState } from "react";
import {
  AlertOctagon,
  Check,
  Copy,
  FileCode2,
  Flame,
  GitPullRequest,
  ShieldCheck,
  Trash2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Send,
  BellRing,
  Webhook,
  Loader2,
  Bot,
  GitBranch,
  Terminal,
  Sparkles,
  RefreshCw,
  FolderTree,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  DecisionArtifactRecord,
  DispatchChannel,
  InvalidationEventRecord,
  OPERATOR_SYMBOLS,
  formatTeardownBranchName,
} from "@/lib/types";
import { synthesizeReplacementAdr } from "@/lib/sunset-synthesizer";
import { buildMultiFileTeardownPatch } from "@/lib/locus-inspector";
import { formatUsd } from "@/lib/finops-engine";

interface TeardownPaneProps {
  selectedArtifact: DecisionArtifactRecord | null;
  allInvalidationEvents: InvalidationEventRecord[];
  onAcknowledgeEvent: (eventId: string) => Promise<void>;
  onDispatchAlert: (
    eventId: string,
    channel: DispatchChannel,
    options?: {
      repo?: string;
      branchName?: string;
      baseBranch?: string;
      githubToken?: string;
      dryRun?: boolean;
    }
  ) => Promise<any>;
  onSimulateBreachForSelected: () => Promise<void>;
  onSelectArtifact: (artifactId: string) => void;
  onRetireAndPromote?: (artifactId: string) => Promise<void>;
  /** PREMISE_EXTRAS: shows the PagerDuty dispatch button */
  extras?: boolean;
}

export function TeardownPane({
  selectedArtifact,
  allInvalidationEvents,
  onAcknowledgeEvent,
  onDispatchAlert,
  onSimulateBreachForSelected,
  onSelectArtifact,
  onRetireAndPromote,
  extras = false,
}: TeardownPaneProps) {
  const [scope, setScope] = useState<"selected" | "global">("selected");
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
  const [previewPayloadId, setPreviewPayloadId] = useState<string | null>(null);
  const [dispatchingKey, setDispatchingKey] = useState<string | null>(null);

  // Horizon E: Autonomous Sunset Synthesizer State
  const [retiringArtifactId, setRetiringArtifactId] = useState<string | null>(null);
  const [expandedMultiFileDiffs, setExpandedMultiFileDiffs] = useState<
    Record<string, boolean>
  >({});
  const [retiredArtifactIds, setRetiredArtifactIds] = useState<
    Record<string, string>
  >({});

  const handleRetireAndPromoteClick = async (artifactId: string) => {
    if (!onRetireAndPromote) return;
    setRetiringArtifactId(artifactId);
    try {
      await onRetireAndPromote(artifactId);
      setRetiredArtifactIds((prev) => ({
        ...prev,
        [artifactId]: "RETIRED_AND_PROMOTED",
      }));
    } finally {
      setRetiringArtifactId(null);
    }
  };

  // Horizon B: Autonomous GitHub PR Bot Form State
  const [prRepoByEvent, setPrRepoByEvent] = useState<Record<string, string>>({});
  const [prBranchByEvent, setPrBranchByEvent] = useState<Record<string, string>>({});
  const [prTokenByEvent, setPrTokenByEvent] = useState<Record<string, string>>({});
  const [copiedGhCmd, setCopiedGhCmd] = useState<string | null>(null);
  const [latestPrResultByEvent, setLatestPrResultByEvent] = useState<
    Record<string, any>
  >({});

  const selectedEvents = selectedArtifact?.invalidationEvents || [];
  const displayedEvents =
    scope === "selected" && selectedEvents.length > 0
      ? selectedEvents
      : scope === "global"
      ? allInvalidationEvents
      : selectedEvents;

  const buildGitHubPrPayload = (ev: InvalidationEventRecord): string => {
    const title = ev.artifactTitle || selectedArtifact?.title || "Decision";
    const locus =
      ev.targetLocus || selectedArtifact?.targetLocus || "unknown-locus";
    const op = ev.operator ? OPERATOR_SYMBOLS[ev.operator] : "";
    const unit = ev.unit ? ` ${ev.unit}` : "";

    return `## [PREMISE KILL-SWITCH] Teardown Obsolete Infrastructure: ${title}

### Automated Invalidation Summary
- **Violated Premise:** ${ev.premiseClaim || "Load-bearing assumption violated"}
- **Monitored Metric:** \`${ev.variableName || "metric"}\`
- **Required Assertion:** \`${op} ${ev.thresholdValue}${unit}\`
- **Previous Value:** \`${ev.previousValue}${unit}\`
- **Breaking Telemetry Value:** \`${ev.breakingValue}${unit}\`
- **Triggered At:** \`${ev.triggeredAt}\`
- **Target Code/Ops Locus:** \`${locus}\`

---

${ev.remediationPlan}

---
### Checklist for Teardown PR
- [ ] Rip out obsolete workaround at \`${locus}\`
- [ ] Decommission associated infrastructure / budget in blast radius
- [ ] Update status of **${title}** to \`DEPRECATED_BY_PREMISE_ENGINE\`
`;
  };

  const handleExportPayload = (ev: InvalidationEventRecord) => {
    const markdown = buildGitHubPrPayload(ev);
    navigator.clipboard.writeText(markdown);
    setCopiedEventId(ev.id);
    setPreviewPayloadId((prev) => (prev === ev.id ? null : ev.id));
    setTimeout(() => setCopiedEventId(null), 2500);
  };

  const handleDispatchClick = async (
    eventId: string,
    channel: DispatchChannel
  ) => {
    const key = `${eventId}:${channel}`;
    setDispatchingKey(key);
    try {
      await onDispatchAlert(eventId, channel);
    } finally {
      setDispatchingKey(null);
    }
  };

  const handleOpenGitHubPr = async (ev: InvalidationEventRecord) => {
    const key = `${ev.id}:GITHUB_PR`;
    setDispatchingKey(key);
    const defaultBranch = formatTeardownBranchName(ev.artifactId);
    const branchName = prBranchByEvent[ev.id] || defaultBranch;
    const repo = prRepoByEvent[ev.id] || "org/core-monorepo";
    const token = prTokenByEvent[ev.id] || "";

    try {
      const res = await onDispatchAlert(ev.id, "GITHUB_PR", {
        repo,
        branchName,
        githubToken: token.trim() || undefined,
        dryRun: !token.trim(),
      });
      if (res?.prResult) {
        setLatestPrResultByEvent((prev) => ({
          ...prev,
          [ev.id]: res.prResult,
        }));
      }
    } finally {
      setDispatchingKey(null);
    }
  };

  return (
    <aside
      data-tour="teardown-dispatch"
      className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 overflow-hidden"
    >
      {/* Pane Header */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trash2
            className={`w-4 h-4 ${
              allInvalidationEvents.length > 0
                ? "text-rose-400"
                : "text-zinc-400"
            }`}
          />
          <div>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-100">
              Invalidation &amp; Teardown Feed
            </h2>
            <p className="text-[10px] font-mono text-zinc-400">
              Kill-Switch Specs, PR Dispatches &amp; Webhooks
            </p>
          </div>
        </div>

        {/* Scope Toggle */}
        <div className="flex items-center border border-zinc-800 bg-zinc-900 p-0.5 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setScope("selected")}
            className={`px-2 py-0.5 transition-colors ${
              scope === "selected"
                ? "bg-zinc-800 text-zinc-100 font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Selected ({selectedEvents.length})
          </button>
          <button
            type="button"
            onClick={() => setScope("global")}
            className={`px-2 py-0.5 transition-colors ${
              scope === "global"
                ? "bg-zinc-800 text-zinc-100 font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Global ({allInvalidationEvents.length})
          </button>
        </div>
      </div>

      {/* Feed Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayedEvents.length === 0 ? (
          <div className="space-y-4">
            <div className="p-4 border border-zinc-800 bg-zinc-900/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono font-semibold uppercase text-emerald-400">
                    Kill-Switch Armed // Standing By
                  </span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-400">
                  0 BROKEN
                </span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                All load-bearing premises for{" "}
                <strong className="text-zinc-200">
                  {selectedArtifact?.title || "this decision"}
                </strong>{" "}
                currently satisfy their boundaries. No teardown action required
                yet.
              </p>

              {selectedArtifact && (
                <div className="p-3 bg-zinc-950 border border-zinc-800/80 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-amber-400 flex items-center justify-between">
                    <span>Queued Blast Radius (On Invalidation)</span>
                    <span>Gate: {selectedArtifact.logicCombinator || "ANY"}</span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    Locus:{" "}
                    <code className="text-zinc-200">
                      {selectedArtifact.targetLocus}
                    </code>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {selectedArtifact.blastRadius}
                  </p>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={onSimulateBreachForSelected}
                  className="w-full py-2 px-3 text-xs font-mono font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 flex items-center justify-center gap-2 transition-colors"
                >
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  <span>
                    Simulate Premise Breach → Generate Teardown Spec
                  </span>
                </button>
              </div>
            </div>

            {allInvalidationEvents.length > 0 && scope === "selected" && (
              <div className="p-3 bg-rose-950/20 border border-rose-500/30 flex items-center justify-between">
                <span className="text-xs font-mono text-rose-300">
                  {allInvalidationEvents.length} broken premise(s) in other
                  decisions
                </span>
                <button
                  type="button"
                  onClick={() => setScope("global")}
                  className="text-xs font-mono underline text-rose-300 hover:text-rose-200"
                >
                  View Global Feed →
                </button>
              </div>
            )}
          </div>
        ) : (
          displayedEvents.map((ev) => {
            const isCopied = copiedEventId === ev.id;
            const showPayload = previewPayloadId === ev.id;
            const opSymbol = ev.operator ? OPERATOR_SYMBOLS[ev.operator] : "";
            const unitStr = ev.unit ? ` ${ev.unit}` : "";
            const dispatches = ev.dispatchLogs || [];

            return (
              <div
                key={ev.id}
                className="border border-rose-500/50 bg-rose-950/10 shadow-lg overflow-hidden"
              >
                {/* Event Alert Banner */}
                <div className="px-3.5 py-2.5 bg-rose-950/40 border-b border-rose-500/30 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                    <span className="text-xs font-mono font-bold uppercase text-rose-200 truncate">
                      TEARDOWN SPEC // {ev.variableName || "PREMISE BROKEN"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ev.acknowledged ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700">
                        ACKED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold">
                        ACTION REQUIRED
                      </span>
                    )}
                  </div>
                </div>

                {/* Artifact & Telemetry Delta */}
                <div className="p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => onSelectArtifact(ev.artifactId)}
                      className="text-zinc-200 hover:text-emerald-400 font-semibold flex items-center gap-1 truncate"
                    >
                      <span>{ev.artifactTitle || "Decision Artifact"}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </button>
                    <span className="text-zinc-500 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(ev.triggeredAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>

                  {/* Numeric Violation Readout */}
                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-zinc-950 border border-zinc-800 font-mono text-[11px]">
                    <div>
                      <div className="text-[9px] uppercase text-zinc-500">
                        Previous
                      </div>
                      <div className="text-zinc-300">
                        {ev.previousValue}
                        {unitStr}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-rose-400">
                        Breaking Value
                      </div>
                      <div className="text-rose-300 font-bold">
                        {ev.breakingValue}
                        {unitStr}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-zinc-500">
                        Required Bound
                      </div>
                      <div className="text-emerald-400">
                        {opSymbol} {ev.thresholdValue}
                        {unitStr}
                      </div>
                    </div>
                  </div>

                  {/* Target Locus Chip */}
                  {ev.targetLocus && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-zinc-900/90 px-2.5 py-1.5 border border-zinc-800">
                      <FileCode2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">{ev.targetLocus}</span>
                    </div>
                  )}

                  {/* Rendered Teardown Plan & Diff */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      Generated Teardown &amp; Refactoring Plan:
                    </div>
                    <pre className="p-3 bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap overflow-x-auto leading-relaxed max-h-64 overflow-y-auto">
                      {ev.remediationPlan}
                    </pre>
                  </div>

                  {/* Horizon E: Autonomous Sunset Synthesizer & Multi-File Blast Radius */}
                  {(() => {
                    const art =
                      selectedArtifact?.id === ev.artifactId
                        ? selectedArtifact
                        : null;
                    if (!art) return null;

                    const synthAdr = synthesizeReplacementAdr({
                      artifact: art,
                      breachingEvent: ev,
                    });

                    let multiFilePatch = null;
                    try {
                      if (art.targetLocus) {
                        multiFilePatch = buildMultiFileTeardownPatch({
                          targetLocus: art.targetLocus,
                          artifactTitle: art.title,
                          variableName: ev.variableName || "metric",
                          operator: ev.operator || "GT",
                          thresholdValue: ev.thresholdValue || "0",
                          breakingValue: ev.breakingValue || "0",
                          unit: ev.unit || "",
                          blastRadius: art.blastRadius,
                        });
                      }
                    } catch {
                      // ignore
                    }

                    const isRetiring = retiringArtifactId === art.id;
                    const isRetired =
                      retiredArtifactIds[art.id] ||
                      art.status === "DEPRECATED_BY_PREMISE_ENGINE";
                    const showDiff = Boolean(expandedMultiFileDiffs[ev.id]);

                    return (
                      <div className="border border-sky-500/40 bg-zinc-900/60 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-sky-400">
                            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                            <span>Autonomous Sunset Synthesizer</span>
                          </div>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 bg-sky-950 text-sky-300 border border-sky-800">
                            HORIZON E
                          </span>
                        </div>

                        {/* Synthesized Replacement ADR Header */}
                        <div className="p-2.5 bg-zinc-950 border border-zinc-800 space-y-1.5 font-mono">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-zinc-500 uppercase">
                              Replacement Architecture Pattern
                            </span>
                            <span className="text-emerald-400 font-bold">
                              +{formatUsd(synthAdr.estimatedAnnualSavingsUsd)}/yr Saved
                            </span>
                          </div>
                          <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                            <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <span>{synthAdr.title}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                            {synthAdr.rationale}
                          </p>
                          <div className="text-[10px] text-sky-300 flex items-center gap-2 pt-1 border-t border-zinc-900">
                            <span>Pattern: <strong>{synthAdr.patternName}</strong></span>
                            <span>•</span>
                            <span>{synthAdr.forwardLookingPremisesCount} Forward Guardrails</span>
                          </div>
                        </div>

                        {/* Multi-File Caller Blast Radius Scanner */}
                        {multiFilePatch && (
                          <div className="p-2 bg-zinc-950/80 border border-zinc-800 space-y-2 font-mono">
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                                <FolderTree className="w-3.5 h-3.5 text-amber-400" />
                                <span>Multi-File Caller Blast Radius:</span>
                                <span className="px-1.5 py-0.2 bg-zinc-900 border border-zinc-700 text-amber-300 text-[10px]">
                                  {multiFilePatch.totalFilesAffected} file(s) ({multiFilePatch.callerFiles.length} caller references)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedMultiFileDiffs((prev) => ({
                                    ...prev,
                                    [ev.id]: !prev[ev.id],
                                  }))
                                }
                                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                              >
                                <span>{showDiff ? "Hide Diff" : "View Multi-File Diff"}</span>
                                {showDiff ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            </div>

                            {multiFilePatch.callerFiles.length > 0 ? (
                              <div className="space-y-1">
                                <div className="text-[10px] text-zinc-500 uppercase">
                                  Discovered Workspace Call Sites:
                                </div>
                                {multiFilePatch.callerFiles.map((caller) => (
                                  <div
                                    key={caller.filePath}
                                    className="text-[10px] px-2 py-1 bg-zinc-900 border border-zinc-800 flex items-center justify-between text-zinc-300"
                                  >
                                    <span className="text-zinc-200">{caller.filePath}</span>
                                    <span className="text-zinc-500">
                                      {caller.matchedSymbols.join(", ")}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] text-zinc-500">
                                Primary locus isolated; 0 caller references in workspace.
                              </div>
                            )}

                            {/* Expanded Unified Diff Preview */}
                            {showDiff && (
                              <pre className="p-2 bg-zinc-950 border border-zinc-800/80 text-[10px] font-mono text-zinc-300 whitespace-pre-wrap overflow-x-auto max-h-48 leading-relaxed">
                                {multiFilePatch.combinedUnifiedDiff}
                              </pre>
                            )}
                          </div>
                        )}

                        {/* 1-Click Retire & Promote Workflow Button */}
                        <div>
                          {isRetired ? (
                            <div className="p-2 bg-emerald-950/60 border border-emerald-500/50 flex items-center justify-between text-xs font-mono text-emerald-300">
                              <span className="flex items-center gap-1.5 font-bold">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                RETIRED &amp; PROMOTED: {synthAdr.id.toUpperCase()} ACTIVE
                              </span>
                              <span className="text-[10px] text-emerald-400">PROBES BOOTED</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isRetiring}
                              onClick={() => handleRetireAndPromoteClick(art.id)}
                              className="w-full py-2 px-3 text-xs font-mono font-bold bg-sky-500 hover:bg-sky-400 text-zinc-950 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            >
                              {isRetiring ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" />
                                  <span>Applying Teardown &amp; Booting {synthAdr.id}...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 text-zinc-950" />
                                  <span>1-Click Retire &amp; Promote: Boot {synthAdr.title.split(":")[0]}</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Horizon B: Autonomous GitHub PR Bot & Outbound Dispatch */}
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <div className="border border-emerald-500/40 bg-zinc-900/60 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                          <Bot className="w-3.5 h-3.5" />
                          <span>Autonomous GitHub PR Bot</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800">
                          HORIZON B
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div className="space-y-0.5">
                          <label className="text-zinc-400">Target Repo</label>
                          <input
                            type="text"
                            value={prRepoByEvent[ev.id] ?? "org/core-monorepo"}
                            onChange={(e) =>
                              setPrRepoByEvent((prev) => ({
                                ...prev,
                                [ev.id]: e.target.value,
                              }))
                            }
                            className="w-full bg-zinc-950 border border-zinc-800 px-2 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500"
                            placeholder="owner/repo"
                          />
                        </div>

                        <div className="space-y-0.5">
                          <label className="text-zinc-400">Teardown Branch</label>
                          <input
                            type="text"
                            value={
                              prBranchByEvent[ev.id] ??
                              formatTeardownBranchName(ev.artifactId)
                            }
                            onChange={(e) =>
                              setPrBranchByEvent((prev) => ({
                                ...prev,
                                [ev.id]: e.target.value,
                              }))
                            }
                            className="w-full bg-zinc-950 border border-zinc-800 px-2 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500"
                            placeholder="premise/teardown-..."
                          />
                        </div>
                      </div>

                      <div className="space-y-0.5 text-[10px] font-mono">
                        <div className="flex items-center justify-between text-zinc-400">
                          <label>GitHub Personal Access Token (Optional)</label>
                          <span className="text-[9px] text-zinc-500">
                            Blank = Staged Dry-Run
                          </span>
                        </div>
                        <input
                          type="password"
                          value={prTokenByEvent[ev.id] ?? ""}
                          onChange={(e) =>
                            setPrTokenByEvent((prev) => ({
                              ...prev,
                              [ev.id]: e.target.value,
                            }))
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 px-2 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500"
                          placeholder="ghp_... (reads from process.env.GITHUB_TOKEN if empty)"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenGitHubPr(ev)}
                        disabled={dispatchingKey === `${ev.id}:GITHUB_PR`}
                        className="w-full py-2 px-3 text-xs font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {dispatchingKey === `${ev.id}:GITHUB_PR` ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Opening Teardown Branch &amp; PR...</span>
                          </>
                        ) : (
                          <>
                            <GitPullRequest className="w-3.5 h-3.5" />
                            <span>🤖 Dispatch Autonomous Teardown PR</span>
                          </>
                        )}
                      </button>

                      {/* Display Staged PR Result if available */}
                      {(latestPrResultByEvent[ev.id] ||
                        dispatches.find((d) => d.channel === "GITHUB_PR")) && (
                        <div className="p-2 bg-zinc-950 border border-emerald-500/30 text-[10px] font-mono space-y-1.5">
                          <div className="flex items-center justify-between text-emerald-300 font-semibold">
                            <span className="flex items-center gap-1">
                              <GitBranch className="w-3 h-3 text-sky-400" />
                              <span className="truncate max-w-[170px]">
                                {latestPrResultByEvent[ev.id]?.branchName ||
                                  prBranchByEvent[ev.id] ||
                                  formatTeardownBranchName(ev.artifactId)}
                              </span>
                            </span>
                            <a
                              href={
                                latestPrResultByEvent[ev.id]?.prUrl ||
                                dispatches.find((d) => d.channel === "GITHUB_PR")
                                  ?.externalUrl ||
                                "#"
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0"
                            >
                              <span>View PR</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>

                          {latestPrResultByEvent[ev.id]?.ghCliCommand && (
                            <div className="flex items-center justify-between gap-1 bg-zinc-900 p-1.5 border border-zinc-800">
                              <code className="text-zinc-300 text-[9px] truncate">
                                {latestPrResultByEvent[ev.id].ghCliCommand}
                              </code>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    latestPrResultByEvent[ev.id].ghCliCommand
                                  );
                                  setCopiedGhCmd(ev.id);
                                  setTimeout(() => setCopiedGhCmd(null), 2000);
                                }}
                                className="text-[9px] px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 shrink-0"
                              >
                                {copiedGhCmd === ev.id ? "Copied!" : "Copy gh"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Secondary Channel Triggers */}
                    <div
                      className={`grid ${extras ? "grid-cols-2" : "grid-cols-1"} gap-1.5 pt-1`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleDispatchClick(ev.id, "SLACK_WEBHOOK")
                        }
                        disabled={dispatchingKey === `${ev.id}:SLACK_WEBHOOK`}
                        className="py-1.5 px-2 text-[10px] font-mono font-semibold bg-zinc-900 hover:bg-zinc-800 text-sky-300 border border-sky-500/40 flex items-center justify-center gap-1 transition-colors"
                      >
                        {dispatchingKey === `${ev.id}:SLACK_WEBHOOK` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Webhook className="w-3 h-3" />
                        )}
                        <span>Slack Alert</span>
                      </button>

                      {extras && (
                        <button
                          type="button"
                          onClick={() =>
                            handleDispatchClick(ev.id, "PAGERDUTY_EVENT")
                          }
                          disabled={dispatchingKey === `${ev.id}:PAGERDUTY_EVENT`}
                          className="py-1.5 px-2 text-[10px] font-mono font-semibold bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/40 flex items-center justify-center gap-1 transition-colors"
                        >
                          {dispatchingKey === `${ev.id}:PAGERDUTY_EVENT` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <BellRing className="w-3 h-3" />
                          )}
                          <span>PagerDuty Alert</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dispatched Audit Trail */}
                  {dispatches.length > 0 && (
                    <div className="p-2.5 bg-zinc-950 border border-emerald-500/30 space-y-1.5">
                      <div className="text-[9px] font-mono uppercase text-emerald-400 font-semibold flex items-center justify-between">
                        <span>
                          Outbound Dispatch Audit Log ({dispatches.length})
                        </span>
                        <span>HTTP 201 CREATED</span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {dispatches.map((d) => (
                          <div
                            key={d.id}
                            className="text-[10px] font-mono p-1.5 bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <span className="px-1 py-0.2 bg-zinc-800 text-emerald-300 mr-1.5">
                                {d.channel}
                              </span>
                              <span className="text-zinc-300 truncate">
                                {d.summary}
                              </span>
                            </div>
                            <span className="text-zinc-500 shrink-0">
                              {new Date(d.dispatchedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons: Export GitHub Issue / PR Payload + Acknowledge */}
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleExportPayload(ev)}
                      className="w-full py-2 px-3 text-xs font-mono font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            Copied GitHub Issue / PR Markdown Payload!
                          </span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Export GitHub Issue / PR Payload</span>
                        </>
                      )}
                    </button>

                    {!ev.acknowledged && (
                      <button
                        type="button"
                        onClick={() => onAcknowledgeEvent(ev.id)}
                        className="w-full py-1.5 px-3 text-[11px] font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Acknowledge Kill-Switch Alert</span>
                      </button>
                    )}
                  </div>

                  {/* Collapsible Markdown Payload Inspector */}
                  {showPayload && (
                    <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400">
                        <span>GITHUB PR / ISSUE PAYLOAD PREVIEW (COPIED)</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              buildGitHubPrPayload(ev)
                            );
                            setCopiedEventId(ev.id);
                          }}
                          className="underline hover:text-emerald-300 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy Again</span>
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={buildGitHubPrPayload(ev)}
                        rows={8}
                        className="w-full p-2 bg-zinc-950 border border-emerald-500/40 text-[10px] font-mono text-zinc-300 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
