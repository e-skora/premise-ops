"use client";

import React, { useState } from "react";
import {
  X,
  Cpu,
  FileCode2,
  GitPullRequest,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Terminal,
} from "lucide-react";
import {
  ArtifactType,
  CompiledArtifactOutput,
  DecisionArtifactRecord,
  InvalidationEventRecord,
  OPERATOR_SYMBOLS,
} from "@/lib/types";
import { CompilerTemplate } from "@/db/seed-data";

interface CompilerModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: CompilerTemplate[];
  onArtifactCompiled: (data: {
    artifact: DecisionArtifactRecord;
    artifacts: DecisionArtifactRecord[];
    invalidationEvents: InvalidationEventRecord[];
  }) => void;
}

export function CompilerModal({
  isOpen,
  onClose,
  templates,
  onArtifactCompiled,
}: CompilerModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || ""
  );
  const [rawContent, setRawContent] = useState<string>(
    templates[0]?.rawContent || ""
  );
  const [overrideTitle, setOverrideTitle] = useState<string>(
    templates[0]?.title || ""
  );
  const [overrideType, setOverrideType] = useState<ArtifactType>(
    templates[0]?.type || "ADR"
  );
  // Starts empty: a path is only saved when the document or the user names one
  const [overrideLocus, setOverrideLocus] = useState<string>("");

  const [previewCompiled, setPreviewCompiled] =
    useState<CompiledArtifactOutput | null>(templates[0]?.precompiled || null);
  const [compilerEngine, setCompilerEngine] = useState<string>(
    "deterministic-ast-parser"
  );
  const [isCompiling, setIsCompiling] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // e.g. "AI extraction failed: ... Used the basic parser."
  const [notice, setNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectTemplate = (tpl: CompilerTemplate) => {
    setSelectedTemplateId(tpl.id);
    setRawContent(tpl.rawContent);
    setOverrideTitle(tpl.title);
    setOverrideType(tpl.type);
    setOverrideLocus(tpl.targetLocus);
    setPreviewCompiled(tpl.precompiled);
    setError(null);
    setNotice(null);
  };

  const handleLoadCustomExample = () => {
    setSelectedTemplateId("");
    const customDoc = `# ADR-029: Custom Redis Read-Through Caching Layer

## Context
We maintain this custom Redis caching layer because Upstream API X takes >800ms and costs $15/1M tokens. Additionally, acquisition channel Y is viable as long as CAC stays under $45.

## Blast Radius
Delete 1,600 LOC Redis read-through cache in \`src/services/cache-router.ts:L42-110\` and decommission the $380/mo ElastiCache cluster.`;
    setRawContent(customDoc);
    setOverrideTitle("ADR-029: Custom Redis Read-Through Caching Layer");
    setOverrideType("ADR");
    setOverrideLocus("");
    setPreviewCompiled(null);
    setError(null);
  };

  const handlePreviewExtract = async () => {
    setIsCompiling(true);
    setError(null);
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent,
          templateId: selectedTemplateId || undefined,
          overrideTitle: overrideTitle || undefined,
          overrideType,
          overrideLocus: overrideLocus || undefined,
          persist: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Compilation failed");
      }
      setPreviewCompiled(data.compiled);
      setCompilerEngine(
        data.llmModel ? `${data.compilerEngine} (${data.llmProvider}: ${data.llmModel})` : data.compilerEngine
      );
      setNotice(data.notice || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse document");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleCompileAndRegister = async () => {
    setIsPersisting(true);
    setError(null);
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent,
          templateId: selectedTemplateId || undefined,
          overrideTitle: overrideTitle || undefined,
          overrideType,
          overrideLocus: overrideLocus || undefined,
          persist: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to compile and persist artifact");
      }
      onArtifactCompiled({
        artifact: data.artifact,
        artifacts: data.artifacts,
        invalidationEvents: data.invalidationEvents,
      });
      if (data.notice) {
        // Saved, but keep the modal open so the fallback is not hidden
        setNotice(`${data.notice} Saved anyway.`);
        setPreviewCompiled(data.compiled);
        setCompilerEngine(data.compilerEngine);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save artifact");
    } finally {
      setIsPersisting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-100 uppercase">
                  Pipeline A // Premise Compiler
                </h2>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700">
                  POST /api/compile
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Ingest an ADR, GitHub PR, Strategy Memo, or Vendor Contract and
                compile natural-language assumptions into live executable probes.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pre-loaded Template Bar */}
        <div className="px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/30 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mr-1">
            Load Scenario Template:
          </span>
          {templates.map((tpl) => {
            const active = selectedTemplateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tpl)}
                className={`px-2.5 py-1 text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                  active
                    ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                <span className="text-[10px] px-1 bg-zinc-800 text-zinc-400">
                  {tpl.badge}
                </span>
                <span>{tpl.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleLoadCustomExample}
            className={`px-2.5 py-1 text-xs font-mono border transition-colors flex items-center gap-1.5 ${
              selectedTemplateId === ""
                ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <Terminal className="w-3 h-3" />
            <span>Custom Freeform Markdown</span>
          </button>
        </div>

        {/* Main Split Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* Left: Raw Artifact Input */}
          <div className="lg:col-span-6 p-5 border-b lg:border-b-0 lg:border-r border-zinc-800 flex flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-12 gap-2.5">
              <div className="col-span-8">
                <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                  Decision Title
                </label>
                <input
                  type="text"
                  value={overrideTitle}
                  onChange={(e) => {
                    setOverrideTitle(e.target.value);
                    setSelectedTemplateId("");
                  }}
                  placeholder="e.g., ADR-021: Self-Hosted GPU Whisper Fleet"
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="col-span-4">
                <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                  Artifact Type
                </label>
                <select
                  value={overrideType}
                  onChange={(e) =>
                    setOverrideType(e.target.value as ArtifactType)
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                >
                  <option value="ADR">ADR</option>
                  <option value="GITHUB_PR">GITHUB_PR</option>
                  <option value="STRATEGY_MEMO">STRATEGY_MEMO</option>
                  <option value="VENDOR_CONTRACT">VENDOR_CONTRACT</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                Target Code / Operational Locus
              </label>
              <input
                type="text"
                value={overrideLocus}
                onChange={(e) => {
                  setOverrideLocus(e.target.value);
                  setSelectedTemplateId("");
                }}
                placeholder="e.g., src/services/router.ts:L42-110"
                className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex-1 flex flex-col min-h-[240px]">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400">
                  Raw Decision Document (Markdown)
                </label>
                <button
                  type="button"
                  onClick={handlePreviewExtract}
                  disabled={isCompiling}
                  className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  {isCompiling ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>Re-Run Extraction Preview</span>
                </button>
              </div>
              <textarea
                value={rawContent}
                onChange={(e) => {
                  setRawContent(e.target.value);
                  setSelectedTemplateId("");
                }}
                rows={12}
                className="w-full flex-1 p-3 text-xs font-mono leading-relaxed bg-zinc-900/90 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
                placeholder="Paste ADR, GitHub PR description, or strategy memo containing quantitative assumptions..."
              />
            </div>
          </div>

          {/* Right: Compiled Output Preview */}
          <div className="lg:col-span-6 p-5 bg-zinc-900/20 flex flex-col gap-3 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-semibold">
                  Compiled Assertion AST
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Zod Strict Validated
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                Engine: {compilerEngine}
              </span>
            </div>

            {error && (
              <div className="p-3 bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 font-mono">
                {error}
              </div>
            )}

            {notice && (
              <div className="p-3 bg-amber-950/40 border border-amber-500/40 text-xs text-amber-300 font-mono">
                {notice}
              </div>
            )}

            {!previewCompiled ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-800">
                <Cpu className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-400 mb-3">
                  Click{" "}
                  <span className="text-emerald-400 font-mono">
                    Re-Run Extraction Preview
                  </span>{" "}
                  or{" "}
                  <span className="text-emerald-400 font-mono">
                    Compile & Save
                  </span>{" "}
                  to extract load-bearing premises from your document.
                </p>
                <button
                  type="button"
                  onClick={handlePreviewExtract}
                  className="px-3 py-1.5 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                >
                  Extract Premises Now
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Blast Radius Box */}
                <div className="p-3 bg-zinc-900/80 border border-zinc-800">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase text-amber-400 mb-1">
                    <span>Extracted Blast Radius (Obsolete If Invalidated)</span>
                    <span>
                      {previewCompiled.targetLocus
                        ? `Locus: ${previewCompiled.targetLocus}`
                        : "No code location set"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {previewCompiled.blastRadius}
                  </p>
                </div>

                {/* Extracted Premises */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-mono uppercase text-zinc-400">
                    Extracted Load-Bearing Premises (
                    {previewCompiled.premises.length})
                  </div>
                  {previewCompiled.premises.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-zinc-900 border border-zinc-800 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-zinc-200 font-medium">
                          &ldquo;{p.claim}&rdquo;
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                          MARGIN ±{Math.round(p.decayWarningMargin * 100)}%
                        </span>
                      </div>

                      <div className="p-2 bg-zinc-950 border border-zinc-800/80 font-mono text-xs flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-zinc-500">VARIABLE: </span>
                          <span className="text-sky-400">{p.variableName}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">ASSERTION: </span>
                          <span className="text-emerald-400 font-semibold">
                            {OPERATOR_SYMBOLS[p.operator]} {p.thresholdValue}{" "}
                            {p.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">VALUE: </span>
                          <span className="text-zinc-200">
                            {p.currentValue ? `${p.currentValue} ${p.unit}` : "No value yet"}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-800/60">
                        <span>
                          PROBE:{" "}
                          <strong className="text-zinc-300">
                            {p.recommendedProbe.probeType}
                          </strong>{" "}
                          →{" "}
                          {p.recommendedProbe.targetUrlOrQuery && p.recommendedProbe.status !== "UNBOUND"
                            ? p.recommendedProbe.targetUrlOrQuery
                            : "suggested, not connected"}
                        </span>
                        <span className="text-zinc-500">
                          every {p.recommendedProbe.pollingIntervalSeconds}s
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Saves to SQLite. Suggested probes stay unconnected until you set a
              real source.
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePreviewExtract}
              disabled={isCompiling || isPersisting}
              className="px-3.5 py-1.5 text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-colors"
            >
              {isCompiling ? "Parsing..." : "Preview AST"}
            </button>
            <button
              type="button"
              onClick={handleCompileAndRegister}
              disabled={isPersisting}
              className="px-4 py-1.5 text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 text-zinc-950 flex items-center gap-1.5 transition-colors"
            >
              {isPersisting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              <span>Compile & Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
