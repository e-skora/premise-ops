"use client";

import React, { useState, useEffect } from "react";
import {
  GitBranch,
  FolderSearch,
  Package,
  FileText,
  Code2,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Zap,
  X,
  ExternalLink,
  HelpCircle,
  Inbox,
  Check,
  Sparkles,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  DecisionArtifactRecord,
  DiscoveredPremiseItem,
  InvalidationEventRecord,
  OPERATOR_SYMBOLS,
  RepoScanResult,
} from "@/lib/types";
import { MOCK_REPO_PRESETS } from "@/lib/repo-scanner";

interface RepoScannerModalProps {
  isOpen: boolean;
  initialTab?: "inbox" | "adr" | "manifests" | "inline" | "all";
  onClose: () => void;
  onScanImported: (data: {
    artifacts: DecisionArtifactRecord[];
    invalidationEvents: InvalidationEventRecord[];
    selectedArtifactId?: string;
  }) => void;
  onSelectExistingArtifact?: (artifactId: string) => void;
  onToast?: (msg: string) => void;
}

export function RepoScannerModal({
  isOpen,
  initialTab = "inbox",
  onClose,
  onScanImported,
  onSelectExistingArtifact,
  onToast,
}: RepoScannerModalProps) {
  const [selectedRepoTarget, setSelectedRepoTarget] = useState<string>(
    "github.com/company/core-monorepo"
  );
  const [customPathInput, setCustomPathInput] = useState<string>("");
  const [activeTab, setActiveTab] = useState<
    "inbox" | "adr" | "manifests" | "inline" | "all"
  >(initialTab);
  const [scanResult, setScanResult] = useState<RepoScanResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Record<string, boolean>>({});

  const runScan = async (target?: string) => {
    setIsLoading(true);
    const repoTarget = target || selectedRepoTarget;
    try {
      const res = await fetch(
        `/api/scanner/scan?target=${encodeURIComponent(repoTarget)}`
      );
      const data = await res.json();
      if (res.ok && data.discovered) {
        setScanResult(data);
      } else {
        onToast?.(data.error || "Failed to scan repository");
      }
    } catch {
      onToast?.("Network error while scanning repository");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      runScan();
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // Accept a single discovered premise and immediately hook up live probe
  const handleAcceptSingle = async (item: DiscoveredPremiseItem) => {
    setAcceptingId(item.id);
    try {
      const res = await fetch("/api/scanner/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          itemId: item.id,
          repoTarget: selectedRepoTarget,
        }),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        setAcceptedIds((prev) => ({ ...prev, [item.id]: true }));
        onScanImported({
          artifacts: data.artifacts,
          invalidationEvents: data.invalidationEvents || [],
          selectedArtifactId: data.insertedArtifactId,
        });
        // Re-scan to update inbox counts
        runScan();
        onToast?.(
          `Accepted premise & spun up live ${item.probeType} probe for ${item.variableName}`
        );
      } else {
        onToast?.(data.error || "Failed to accept discovered premise");
      }
    } finally {
      setAcceptingId(null);
    }
  };

  // Accept all unmonitored premises in the inbox
  const handleAcceptAll = async () => {
    setAcceptingId("ALL");
    try {
      const res = await fetch("/api/scanner/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "acceptAll",
          repoTarget: selectedRepoTarget,
        }),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        onScanImported({
          artifacts: data.artifacts,
          invalidationEvents: data.invalidationEvents || [],
          selectedArtifactId: data.insertedIds?.[0],
        });
        runScan();
        onToast?.(
          `Spun up live probes for ${data.acceptedCount} discovered premises!`
        );
      } else {
        onToast?.(data.error || "Failed to batch-accept discovered premises");
      }
    } finally {
      setAcceptingId(null);
    }
  };

  const allDiscovered = scanResult?.discovered || [];
  const pendingInboxItems = allDiscovered.filter(
    (d) => !d.alreadyMonitored && !acceptedIds[d.id]
  );
  const adrItems = allDiscovered.filter((d) => d.sourceType === "ADR_FOLDER");
  const manifestItems = allDiscovered.filter(
    (d) => d.sourceType === "DEPENDENCY_MANIFEST"
  );
  const inlineItems = allDiscovered.filter(
    (d) => d.sourceType === "INLINE_CODE"
  );

  const visibleItems =
    activeTab === "inbox"
      ? pendingInboxItems
      : activeTab === "adr"
      ? adrItems
      : activeTab === "manifests"
      ? manifestItems
      : activeTab === "inline"
      ? inlineItems
      : allDiscovered;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 text-zinc-100 w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        {/* 1. MODAL HEADER */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-sky-950/80 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-wide text-zinc-100">
                  GITHUB REPOSITORY SCANNER // PREMISEOPS ENGINE v2
                </span>
                <span className="px-1.5 py-0.5 text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/30">
                  AUTO-EXTRACTOR
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Automated extraction of decision logs (docs/adr), dependency manifests (package.json) &amp; inline rules
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runScan()}
              disabled={isLoading}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-sky-400 ${
                  isLoading ? "animate-spin" : ""
                }`}
              />
              <span>{isLoading ? "Scanning..." : "Rescan Repo"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. REPOSITORY PICKER & CONNECTION BAR */}
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-zinc-500 shrink-0">
              Target Repo:
            </span>
            <div className="flex items-center gap-1.5">
              {MOCK_REPO_PRESETS.map((preset) => {
                const isSelected = selectedRepoTarget === preset.repoUrlOrPath;
                return (
                  <button
                    key={preset.repoUrlOrPath}
                    type="button"
                    onClick={() => {
                      setSelectedRepoTarget(preset.repoUrlOrPath);
                      runScan(preset.repoUrlOrPath);
                    }}
                    className={`px-2.5 py-1 text-[11px] border flex items-center gap-1.5 transition-colors ${
                      isSelected
                        ? "bg-sky-950 text-sky-200 border-sky-500 font-semibold"
                        : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border-zinc-800"
                    }`}
                  >
                    <GitBranch className="w-3 h-3 text-sky-400" />
                    <span>{preset.repoName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom path or repo URL input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Or enter custom folder path or repo URL..."
              value={customPathInput}
              onChange={(e) => setCustomPathInput(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-200 w-64 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500"
            />
            <button
              type="button"
              onClick={() => {
                if (customPathInput.trim()) {
                  setSelectedRepoTarget(customPathInput.trim());
                  runScan(customPathInput.trim());
                }
              }}
              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-colors"
            >
              Scan
            </button>
          </div>
        </div>

        {/* 3. INBOX TABS & BATCH ACTION BAR */}
        <div className="px-5 py-2.5 border-b border-zinc-800 bg-zinc-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("inbox")}
              className={`px-3 py-1 border flex items-center gap-1.5 transition-colors ${
                activeTab === "inbox"
                  ? "bg-purple-950/80 text-purple-200 border-purple-500 font-bold"
                  : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border-zinc-800"
              }`}
            >
              <Inbox className="w-3.5 h-3.5 text-purple-400" />
              <span>Discovered Inbox</span>
              <span className="px-1.5 py-0.2 rounded-full bg-purple-500 text-zinc-950 font-black text-[10px]">
                {pendingInboxItems.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("adr")}
              className={`px-3 py-1 border flex items-center gap-1.5 transition-colors ${
                activeTab === "adr"
                  ? "bg-sky-950/80 text-sky-200 border-sky-500 font-bold"
                  : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border-zinc-800"
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>ADRs ({adrItems.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("manifests")}
              className={`px-3 py-1 border flex items-center gap-1.5 transition-colors ${
                activeTab === "manifests"
                  ? "bg-sky-950/80 text-sky-200 border-sky-500 font-bold"
                  : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border-zinc-800"
              }`}
            >
              <Package className="w-3.5 h-3.5 text-sky-400" />
              <span>Dependencies ({manifestItems.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("inline")}
              className={`px-3 py-1 border flex items-center gap-1.5 transition-colors ${
                activeTab === "inline"
                  ? "bg-sky-950/80 text-sky-200 border-sky-500 font-bold"
                  : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border-zinc-800"
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Inline Code ({inlineItems.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 border flex items-center gap-1.5 transition-colors ${
                activeTab === "all"
                  ? "bg-zinc-800 text-zinc-200 border-zinc-600 font-bold"
                  : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border-zinc-800"
              }`}
            >
              <span>All Findings ({allDiscovered.length})</span>
            </button>
          </div>

          {/* Accept All Batch Action */}
          {pendingInboxItems.length > 0 && (
            <button
              type="button"
              onClick={handleAcceptAll}
              disabled={acceptingId !== null}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold border border-emerald-400 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>
                {acceptingId === "ALL"
                  ? "Spinning Up Probes..."
                  : `Accept All & Spin Up Probes (${pendingInboxItems.length})`}
              </span>
            </button>
          )}
        </div>

        {/* 4. DISCOVERED PREMISES FEED / INBOX */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {visibleItems.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-zinc-800 bg-zinc-900/20">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-zinc-200">
                Inbox Clean — All Extracted Premises Monitored
              </h3>
              <p className="text-[11px] text-zinc-500 max-w-md mx-auto mt-1">
                All discovered architectural decision records and heavy package dependencies in this repository are actively monitored in ./premise.db.
              </p>
            </div>
          ) : (
            visibleItems.map((item) => {
              const isAccepted = acceptedIds[item.id] || item.alreadyMonitored;
              const isAccepting = acceptingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`border transition-all ${
                    isAccepted
                      ? "bg-zinc-950/60 border-zinc-800/80 opacity-75"
                      : "bg-zinc-900/50 border-zinc-700 hover:border-sky-500/70"
                  } p-4`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {item.sourceType === "ADR_FOLDER" ? (
                        <span className="px-2 py-0.5 text-[10px] bg-sky-950 text-sky-300 border border-sky-500/50 font-bold flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          <span>ADR DECISION LOG</span>
                        </span>
                      ) : item.sourceType === "DEPENDENCY_MANIFEST" ? (
                        <span className="px-2 py-0.5 text-[10px] bg-purple-950 text-purple-300 border border-purple-500/50 font-bold flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          <span>DEPENDENCY: {item.detectedPackage?.name}</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] bg-amber-950 text-amber-300 border border-amber-500/50 font-bold flex items-center gap-1">
                          <Code2 className="w-3 h-3" />
                          <span>INLINE CODE ANNOTATION</span>
                        </span>
                      )}

                      <span className="text-[11px] text-zinc-500">
                        {item.sourceFile}
                      </span>
                    </div>

                    <div>
                      {isAccepted ? (
                        <span className="px-2 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>MONITORED IN DB</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] bg-purple-950 text-purple-300 border border-purple-500/40 font-bold flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          <span>PENDING INBOX</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Architectural Question Prompt */}
                  <div className="mt-2.5">
                    <h3 className="text-sm font-bold text-zinc-100">
                      {item.title}
                    </h3>
                    {item.architecturalPrompt && (
                      <div className="mt-1.5 p-2 bg-purple-950/20 border border-purple-800/40 text-[11px] text-purple-200 flex items-start gap-2">
                        <HelpCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Architectural Prompt: </span>
                          <span>{item.architecturalPrompt}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Extracted Premise Bound & Telemetry */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-zinc-800/80">
                    <div className="bg-zinc-950 p-2.5 border border-zinc-800">
                      <span className="text-[9px] uppercase text-zinc-500 block">
                        Load-Bearing Bound
                      </span>
                      <div className="font-bold text-sky-300 text-xs mt-0.5">
                        {item.variableName}{" "}
                        <span className="text-purple-400 font-extrabold">
                          {OPERATOR_SYMBOLS[item.operator]}{" "}
                          {item.thresholdValue}
                        </span>{" "}
                        <span className="text-zinc-400 font-normal">
                          {item.unit}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-0.5 block">
                        {item.currentValue
                          ? `Current value: ${item.currentValue} ${item.unit}`
                          : "No value yet: the probe is a suggestion until you connect a real source"}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 border border-zinc-800">
                      <span className="text-[9px] uppercase text-zinc-500 block">
                        Recommended Live Probe
                      </span>
                      <div className="font-bold text-emerald-400 text-xs mt-0.5">
                        {item.probeType}
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono truncate block mt-0.5">
                        {item.targetUrlOrQuery}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 border border-zinc-800">
                      <span className="text-[9px] uppercase text-zinc-500 block">
                        Target Locus
                      </span>
                      <div className="text-zinc-200 text-xs font-mono truncate mt-0.5">
                        {item.targetLocus}
                      </div>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">
                        Warning Margin: {item.decayWarningMargin * 100}%
                      </span>
                    </div>
                  </div>

                  {/* Blast Radius & Action Button */}
                  <div className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 max-w-xl">
                      <span className="font-bold text-zinc-300">Blast Radius:</span>
                      <span className="truncate">{item.blastRadius}</span>
                    </div>

                    <div>
                      {isAccepted ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectExistingArtifact && item.matchedArtifactId) {
                              onSelectExistingArtifact(item.matchedArtifactId);
                              onClose();
                            }
                          }}
                          className="px-3 py-1 bg-zinc-900 text-zinc-400 border border-zinc-800 flex items-center gap-1 text-[11px]"
                        >
                          <span>View in Control Plane</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAcceptSingle(item)}
                          disabled={isAccepting}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold border border-emerald-400 flex items-center gap-1.5 transition-colors disabled:opacity-50 text-[11px]"
                        >
                          <Zap className="w-3.5 h-3.5 fill-white" />
                          <span>
                            {isAccepting
                              ? "Spinning Up Probe..."
                              : "Accept & Spin Up Live Probe"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 5. MODAL FOOTER */}
        <div className="px-5 py-2.5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
          <div className="flex items-center gap-3">
            <span>
              Scanned: {scanResult?.adrFilesScanned.length || 0} ADRs |{" "}
              {scanResult?.manifestsScanned.length || 0} Manifests
            </span>
            <span>•</span>
            <span className="text-purple-400 font-semibold">
              {pendingInboxItems.length} Unreviewed Findings
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-colors"
            >
              Close Scanner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
