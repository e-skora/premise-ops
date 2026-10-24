"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Code2,
  Database,
  FolderSearch,
  Loader2,
  PlusCircle,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  DecisionArtifactRecord,
  DiscoveredCodebasePremise,
  InvalidationEventRecord,
  OPERATOR_SYMBOLS,
} from "@/lib/types";

interface CodebaseScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanImported: (data: {
    artifacts: DecisionArtifactRecord[];
    invalidationEvents: InvalidationEventRecord[];
    selectedArtifactId?: string;
  }) => void;
  onSelectExistingArtifact: (artifactId: string) => void;
}

export function CodebaseScannerModal({
  isOpen,
  onClose,
  onScanImported,
  onSelectExistingArtifact,
}: CodebaseScannerModalProps) {
  const [discovered, setDiscovered] = useState<DiscoveredCodebasePremise[]>([]);
  const [scannedDirs, setScannedDirs] = useState<string[]>([
    "packages",
    "services",
    "infra",
    "ops",
  ]);
  const [totalFilesScanned, setTotalFilesScanned] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "untracked" | "monitored">(
    "all"
  );

  const runScan = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scan");
      const data = await res.json();
      if (Array.isArray(data.discovered)) {
        setDiscovered(data.discovered);
      }
      if (Array.isArray(data.scannedDirectories)) {
        setScannedDirs(data.scannedDirectories);
      }
      if (typeof data.totalFilesScanned === "number") {
        setTotalFilesScanned(data.totalFilesScanned);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runScan();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const untrackedItems = discovered.filter((d) => !d.alreadyMonitored);
  const monitoredItems = discovered.filter((d) => d.alreadyMonitored);

  const visibleItems =
    filter === "untracked"
      ? untrackedItems
      : filter === "monitored"
      ? monitoredItems
      : discovered;

  const handleImportSingle = async (item: DiscoveredCodebasePremise) => {
    setImportingId(item.id);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        if (Array.isArray(data.discovered)) {
          setDiscovered(data.discovered);
        }
        const newlyCreatedId = data.importedArtifacts?.[0]?.id;
        onScanImported({
          artifacts: data.artifacts,
          invalidationEvents: data.invalidationEvents || [],
          selectedArtifactId: newlyCreatedId,
        });
      }
    } finally {
      setImportingId(null);
    }
  };

  const handleImportAllUntracked = async () => {
    if (untrackedItems.length === 0) return;
    setImportingId("ALL");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importAllUntracked: true }),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        if (Array.isArray(data.discovered)) {
          setDiscovered(data.discovered);
        }
        const firstNewId = data.importedArtifacts?.[0]?.id;
        onScanImported({
          artifacts: data.artifacts,
          invalidationEvents: data.invalidationEvents || [],
          selectedArtifactId: firstNewId,
        });
      }
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col max-h-[88vh] overflow-hidden font-mono">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FolderSearch className="w-4 h-4 text-sky-400" />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-100">
                Codebase Assumption Scanner (@premise / @premise-locus)
              </h2>
              <p className="text-[11px] text-zinc-400">
                Walks local repository directories (
                {scannedDirs.map((d) => `${d}/`).join(", ")}) to discover inline
                quantitative assumptions &amp; compile them into live probes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary & Filter Bar */}
        <div className="px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300">
              Scanned: <strong>{totalFilesScanned}</strong> files
            </span>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-2.5 py-0.5 border transition-colors ${
                filter === "all"
                  ? "bg-zinc-800 border-zinc-600 text-zinc-100 font-bold"
                  : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All ({discovered.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("untracked")}
              className={`px-2.5 py-0.5 border transition-colors ${
                filter === "untracked"
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-200 font-bold"
                  : "bg-zinc-950 border-zinc-800 text-amber-400/80 hover:text-amber-200"
              }`}
            >
              Untracked Discoveries ({untrackedItems.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("monitored")}
              className={`px-2.5 py-0.5 border transition-colors ${
                filter === "monitored"
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200 font-bold"
                  : "bg-zinc-950 border-zinc-800 text-emerald-400/80 hover:text-emerald-200"
              }`}
            >
              Already Monitored ({monitoredItems.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runScan}
              disabled={loading}
              className="px-2.5 py-1 text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw
                className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}
              />
              <span>Rescan</span>
            </button>

            {untrackedItems.length > 0 && (
              <button
                type="button"
                disabled={importingId !== null}
                onClick={handleImportAllUntracked}
                className="px-3 py-1 text-[11px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/50 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {importingId === "ALL" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  Import All Untracked ({untrackedItems.length})
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Discovered List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400 text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
              <span>Scanning local workspace files for @premise blocks...</span>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              No codebase premises match the current filter.
            </div>
          ) : (
            visibleItems.map((item) => {
              const opSymbol = OPERATOR_SYMBOLS[item.operator] || item.operator;
              return (
                <div
                  key={item.id}
                  className={`border p-3.5 space-y-2.5 ${
                    item.alreadyMonitored
                      ? "border-zinc-800 bg-zinc-900/20"
                      : "border-amber-500/40 bg-amber-950/10"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.alreadyMonitored ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>MONITORED</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <Sparkles className="w-3 h-3" />
                            <span>UNTRACKED IN CODEBASE</span>
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 text-[10px] bg-zinc-900 border border-zinc-700 text-zinc-300">
                          {item.type}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] bg-sky-500/15 border border-sky-500/40 text-sky-300 flex items-center gap-1">
                          <Database className="w-2.5 h-2.5" />
                          <span>{item.probeType}</span>
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-400 flex items-center gap-1">
                          <Code2 className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{item.targetLocus}</span>
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-zinc-100">
                        {item.title}
                      </h3>
                    </div>

                    <div>
                      {item.alreadyMonitored && item.matchedArtifactId ? (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectExistingArtifact(item.matchedArtifactId!);
                            onClose();
                          }}
                          className="px-2.5 py-1 text-[10px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-emerald-300 border border-emerald-500/40 transition-colors"
                        >
                          Inspect in Control Plane →
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={importingId !== null}
                          onClick={() => handleImportSingle(item)}
                          className="px-3 py-1 text-[11px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {importingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <PlusCircle className="w-3.5 h-3.5" />
                          )}
                          <span>Compile &amp; Monitor Locus</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Extracted Guardrail & Probe Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] bg-zinc-950/80 border border-zinc-800/80 p-2.5">
                    <div>
                      <div className="text-[10px] uppercase text-zinc-500">
                        Extracted Premise Claim
                      </div>
                      <div className="text-zinc-200">{item.claim}</div>
                      <div className="mt-1 text-emerald-300">
                        Bound: <code>{item.variableName}</code> {opSymbol}{" "}
                        <strong>
                          {item.thresholdValue}
                          {item.unit ? ` ${item.unit}` : ""}
                        </strong>{" "}
                        <span className="text-zinc-400">
                          (Observed: {item.currentValue}
                          {item.unit ? ` ${item.unit}` : ""})
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-zinc-500">
                        Bound Probe Query / Expression ({item.probeType})
                      </div>
                      <div className="text-sky-300 break-all">
                        <code>{item.targetUrlOrQuery}</code>
                      </div>
                      <div className="mt-1 text-zinc-400 text-[10px]">
                        Blast Radius: {item.blastRadius}
                      </div>
                    </div>
                  </div>

                  {/* Source File Preview */}
                  <pre className="p-2.5 bg-zinc-950 border border-zinc-900 text-[10px] text-zinc-400 overflow-x-auto leading-relaxed">
                    {item.codeSnippet}
                  </pre>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
