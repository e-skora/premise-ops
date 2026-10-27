"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  FileCheck2,
  FileWarning,
  GitCompare,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import {
  DecisionArtifactRecord,
  LocusInspectionResult,
} from "@/lib/types";

interface LocusInspectorPanelProps {
  artifact: DecisionArtifactRecord;
}

export function LocusInspectorPanel({ artifact }: LocusInspectorPanelProps) {
  const [inspection, setInspection] = useState<LocusInspectionResult | null>(
    null
  );
  const [unifiedDiff, setUnifiedDiff] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"source" | "patch">("source");
  const [copiedPatch, setCopiedPatch] = useState(false);
  const [mutatingFile, setMutatingFile] = useState<
    "apply" | "rollback" | null
  >(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const primaryPremise =
    artifact.premises.find((p) => p.status === "BROKEN") ||
    artifact.premises[0];

  useEffect(() => {
    let cancelled = false;
    if (!artifact.targetLocus) {
      setInspection(null);
      setUnifiedDiff("");
      return;
    }
    const params = new URLSearchParams({
      targetLocus: artifact.targetLocus,
      artifactTitle: artifact.title,
      variableName: primaryPremise?.variableName || "metric",
      operator: primaryPremise?.operator || "GT",
      thresholdValue: primaryPremise?.thresholdValue || "0",
      breakingValue: primaryPremise?.currentValue || "no value reported",
      unit: primaryPremise?.unit || "",
      blastRadius: artifact.blastRadius,
    });

    fetch(`/api/locus?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.inspection) {
          setInspection(data.inspection);
        }
        if (typeof data.unifiedDiff === "string") {
          setUnifiedDiff(data.unifiedDiff);
        }
      })
      .catch(() => {
        // ignore fetch errors
      });

    return () => {
      cancelled = true;
    };
  }, [
    artifact.id,
    artifact.targetLocus,
    artifact.title,
    artifact.blastRadius,
    artifact.status,
    primaryPremise?.variableName,
    primaryPremise?.operator,
    primaryPremise?.thresholdValue,
    primaryPremise?.currentValue,
    primaryPremise?.unit,
  ]);

  // Automatically switch to patch tab when artifact is INVALIDATED (unless already patched on disk)
  useEffect(() => {
    if (artifact.status === "INVALIDATED" && !inspection?.isPatched) {
      setActiveTab("patch");
    }
  }, [artifact.status, inspection?.isPatched]);

  const handleCopyPatch = () => {
    if (!unifiedDiff) return;
    navigator.clipboard.writeText(unifiedDiff + "\n");
    setCopiedPatch(true);
    setTimeout(() => setCopiedPatch(false), 2200);
  };

  const handleMutateLocusFile = async (action: "apply" | "rollback") => {
    setMutatingFile(action);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/locus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          targetLocus: artifact.targetLocus,
          artifactId: artifact.id,
          artifactTitle: artifact.title,
          variableName: primaryPremise?.variableName || "metric",
          operator: primaryPremise?.operator || "GT",
          thresholdValue: primaryPremise?.thresholdValue || "0",
          breakingValue: primaryPremise?.currentValue || "no value reported",
          unit: primaryPremise?.unit || "",
          blastRadius: artifact.blastRadius,
        }),
      });
      const data = await res.json();
      if (res.ok && data.inspection) {
        setInspection(data.inspection);
        if (typeof data.unifiedDiff === "string") {
          setUnifiedDiff(data.unifiedDiff);
        }
        setActiveTab("source");
        setStatusBanner(
          action === "apply"
            ? `Applied teardown patch to ${data.inspection.resolvedPath} on disk (original backed up in SQLite).`
            : `Restored ${data.inspection.resolvedPath} to original pre-teardown implementation.`
        );
        setTimeout(() => setStatusBanner(null), 4000);
      }
    } finally {
      setMutatingFile(null);
    }
  };

  if (!artifact.targetLocus) {
    return (
      <div className="border border-zinc-800 bg-zinc-900/25 px-4 py-3 font-mono">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
          <Code2 className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>No code location set</span>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          This decision does not name a file, so there is no code to show or patch.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 bg-zinc-900/25 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-2 font-mono">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Real Codebase Locus Inspector &amp; Patch Applier
              </span>
              {inspection?.exists ? (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-semibold">
                  <FileCheck2 className="w-3 h-3" />
                  <span>
                    LOCAL FILE VERIFIED ({inspection.lines.length}L // L
                    {inspection.startLine}-L{inspection.endLine})
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/40">
                  <FileWarning className="w-3 h-3" />
                  <span>SYNTHETIC LOCUS</span>
                </span>
              )}

              {inspection?.isPatched && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold">
                  <ShieldAlert className="w-3 h-3" />
                  <span>TEARDOWN PATCH APPLIED ON DISK</span>
                </span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500 truncate">
              Target: <code className="text-zinc-300">{artifact.targetLocus || "No code location set"}</code>
            </div>
          </div>
        </div>

        {/* Controls: Tab Switcher + Copy Patch + Live Apply / Rollback */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center bg-zinc-950 border border-zinc-800 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setActiveTab("source")}
              className={`px-2 py-0.5 transition-colors ${
                activeTab === "source"
                  ? "bg-zinc-800 text-zinc-100 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Live File Lines
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("patch")}
              className={`px-2 py-0.5 flex items-center gap-1 transition-colors ${
                activeTab === "patch"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <GitCompare className="w-3 h-3" />
              <span>git apply Diff</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyPatch}
            className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-zinc-950 hover:bg-zinc-800 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 transition-colors"
            title="Copy git apply-ready unified diff patch"
          >
            {copiedPatch ? (
              <>
                <Check className="w-3 h-3" />
                <span>Copied Patch!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy git apply</span>
              </>
            )}
          </button>

          {inspection?.exists && (
            <>
              {inspection.isPatched ? (
                <button
                  type="button"
                  disabled={mutatingFile !== null}
                  onClick={() => handleMutateLocusFile("rollback")}
                  className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 flex items-center gap-1 transition-colors disabled:opacity-50"
                  title="Restore local file from SQLite LocusBackup snapshot"
                >
                  {mutatingFile === "rollback" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  <span>Rollback File to Original</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={mutatingFile !== null}
                  onClick={() => handleMutateLocusFile("apply")}
                  className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/50 flex items-center gap-1 transition-colors disabled:opacity-50"
                  title="Write teardown patch directly to local workspace file (with 1-click rollback)"
                >
                  {mutatingFile === "apply" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  <span>Apply Teardown to File</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Live status feedback banner */}
      {statusBanner && (
        <div className="px-4 py-1.5 bg-emerald-950/50 border-b border-emerald-500/40 text-[11px] font-mono text-emerald-200 flex items-center justify-between">
          <span>{statusBanner}</span>
        </div>
      )}

      {/* Body */}
      <div className="bg-zinc-950 max-h-64 overflow-y-auto overflow-x-auto font-mono text-[11px]">
        {activeTab === "source" ? (
          inspection?.exists && inspection.lines.length > 0 ? (
            <div className="divide-y divide-zinc-900/60 py-1">
              {inspection.lines.map((line) => (
                <div
                  key={line.lineNumber}
                  className="flex items-start px-3 py-0.5 hover:bg-zinc-900/50 leading-relaxed"
                >
                  <span className="w-10 shrink-0 text-right pr-3 text-zinc-600 select-none tabular-nums">
                    {line.lineNumber}
                  </span>
                  <span
                    className={`whitespace-pre ${
                      line.content.includes("[PREMISE KILL-SWITCH APPLIED]") ||
                      line.content.includes("[PREMISE INVALIDATED]")
                        ? "text-rose-300 font-semibold"
                        : "text-zinc-300"
                    }`}
                  >
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-xs text-zinc-500">
              Target locus <code>{artifact.targetLocus}</code> points to an
              external path not mounted in the local repository. Switch to{" "}
              <strong>git apply Diff</strong> to inspect the generated
              remediation patch.
            </div>
          )
        ) : (
          <div className="p-3 space-y-0.5 leading-relaxed">
            {unifiedDiff.split("\n").map((line, idx) => {
              let lineColor = "text-zinc-400";
              let bgColor = "";
              if (line.startsWith("+++") || line.startsWith("---")) {
                lineColor = "text-zinc-300 font-bold";
              } else if (line.startsWith("@@")) {
                lineColor = "text-sky-400 font-semibold";
                bgColor = "bg-sky-950/20";
              } else if (line.startsWith("+")) {
                lineColor = "text-emerald-300";
                bgColor = "bg-emerald-950/25";
              } else if (line.startsWith("-")) {
                lineColor = "text-rose-300";
                bgColor = "bg-rose-950/25";
              }

              return (
                <div
                  key={idx}
                  className={`px-2 py-0.2 whitespace-pre ${lineColor} ${bgColor}`}
                >
                  {line}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
