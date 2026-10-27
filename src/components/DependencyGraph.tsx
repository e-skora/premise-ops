"use client";

import React, { useState } from "react";
import {
  GitMerge,
  Radio,
  ShieldAlert,
  Cpu,
  Network,
  ArrowRight,
  Link2,
  X,
  Zap,
} from "lucide-react";
import {
  DecisionArtifactRecord,
  LogicCombinator,
  OPERATOR_SYMBOLS,
} from "@/lib/types";
import { premiseValueText } from "./PremiseSourceBadge";

interface DependencyGraphProps {
  artifact: DecisionArtifactRecord;
  allArtifacts: DecisionArtifactRecord[];
  onSelectArtifact: (artifactId: string) => void;
  onChangeCombinator: (
    artifactId: string,
    combinator: LogicCombinator
  ) => Promise<void>;
  onUpdateDependencies: (
    artifactId: string,
    dependsOnIds: string[]
  ) => Promise<void>;
}

export function DependencyGraph({
  artifact,
  allArtifacts,
  onSelectArtifact,
  onChangeCombinator,
  onUpdateDependencies,
}: DependencyGraphProps) {
  const [isLinkingUpstream, setIsLinkingUpstream] = useState(false);
  const [isUpdatingDeps, setIsUpdatingDeps] = useState(false);

  const combinator: LogicCombinator = artifact.logicCombinator || "ANY";
  const upstreamIds = artifact.dependsOnIds || [];
  const downstreamIds = artifact.downstreamDependentIds || [];

  const upstreamArtifacts = upstreamIds
    .map((id) => allArtifacts.find((a) => a.id === id))
    .filter((a): a is DecisionArtifactRecord => Boolean(a));

  const downstreamArtifacts = downstreamIds
    .map((id) => allArtifacts.find((a) => a.id === id))
    .filter((a): a is DecisionArtifactRecord => Boolean(a));

  const cascadedFromArt = artifact.cascadedFromId
    ? allArtifacts.find((a) => a.id === artifact.cascadedFromId) || null
    : null;

  const candidateUpstreams = allArtifacts.filter(
    (a) =>
      a.id !== artifact.id &&
      !upstreamIds.includes(a.id) &&
      !(a.dependsOnIds || []).includes(artifact.id)
  );

  const handleToggleUpstream = async (targetId: string) => {
    setIsUpdatingDeps(true);
    try {
      const next = upstreamIds.includes(targetId)
        ? upstreamIds.filter((id) => id !== targetId)
        : [...upstreamIds, targetId];
      await onUpdateDependencies(artifact.id, next);
      setIsLinkingUpstream(false);
    } finally {
      setIsUpdatingDeps(false);
    }
  };

  return (
    <div className="border border-zinc-800 bg-zinc-900/25 p-3.5 space-y-3.5">
      {/* Header & Combinator Gate Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-sky-400" />
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
              Assertion Dependency DAG &amp; Multi-Hop Cascade Gate
            </h3>
            <p className="text-[10px] font-mono text-zinc-500">
              {combinator === "ANY"
                ? "OR Kill-Switch (ANY): Decision invalidates immediately when ANY single premise breaks."
                : "AND Kill-Switch (ALL): Decision invalidates only when ALL bound premises break simultaneously."}
            </p>
          </div>
        </div>

        {/* Boolean Combinator Selector */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 p-0.5 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => onChangeCombinator(artifact.id, "ANY")}
            className={`px-2.5 py-1 transition-colors ${
              combinator === "ANY"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            GATE: ANY (OR)
          </button>
          <button
            type="button"
            onClick={() => onChangeCombinator(artifact.id, "ALL")}
            className={`px-2.5 py-1 transition-colors ${
              combinator === "ALL"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/50 font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            GATE: ALL (AND)
          </button>
        </div>
      </div>

      {/* Cascade Alert Banner if this Artifact was Invalidated via Upstream Cascade */}
      {cascadedFromArt && (
        <div className="p-2.5 bg-rose-950/40 border border-rose-500/60 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
          <div className="flex items-center gap-2 text-rose-200">
            <Zap className="w-4 h-4 text-rose-400 animate-bounce shrink-0" />
            <span>
              <strong>MULTI-HOP CASCADE TRIGGERED:</strong> Automatically
              invalidated because upstream prerequisite{" "}
              <code className="text-rose-300 underline">
                {cascadedFromArt.title}
              </code>{" "}
              is <strong>INVALIDATED</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectArtifact(cascadedFromArt.id)}
            className="px-2 py-0.5 text-[10px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/50 shrink-0"
          >
            Inspect Upstream Root →
          </button>
        </div>
      )}

      {/* Interactive Intra-Artifact DAG Flow Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center font-mono">
        {/* Column 1: Live Premise Nodes (5 cols) */}
        <div className="lg:col-span-5 space-y-2">
          {artifact.premises.map((p) => {
            const nodeStyle =
              p.status === "BROKEN"
                ? "border-rose-500/60 bg-rose-950/25 text-rose-200"
                : p.status === "DECAYING"
                ? "border-amber-500/50 bg-amber-950/20 text-amber-200"
                : "border-emerald-500/40 bg-emerald-950/15 text-emerald-200";

            return (
              <div
                key={p.id}
                className={`p-2 border text-[11px] flex items-center justify-between gap-2 ${nodeStyle}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Radio className="w-3 h-3 shrink-0" />
                    <span className="font-bold truncate">{p.variableName}</span>
                  </div>
                  <div className="text-[10px] opacity-80 truncate">
                    {premiseValueText(p)} {OPERATOR_SYMBOLS[p.operator]}{" "}
                    {p.thresholdValue} {p.unit}
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 bg-zinc-950/80 border border-current shrink-0 font-bold">
                  {p.status}
                </span>
              </div>
            );
          })}
        </div>

        {/* Column 2: Boolean Logic Combinator Gate Node (3 cols) */}
        <div className="lg:col-span-3 flex flex-col items-center justify-center py-2">
          <div className="w-full p-2.5 bg-zinc-950 border border-zinc-700 text-center space-y-1 relative">
            <div className="text-[9px] uppercase text-zinc-500">
              KILL-SWITCH GATE
            </div>
            <div className="text-xs font-bold text-zinc-100 flex items-center justify-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>
                {combinator === "ANY" ? "OR_BREAK (ANY)" : "AND_BREAK (ALL)"}
              </span>
            </div>
            <div className="text-[9px] text-zinc-400">
              {artifact.premises.filter((p) => p.status === "BROKEN").length} of{" "}
              {artifact.premises.length} Broken
            </div>
          </div>
        </div>

        {/* Column 3: Resulting Target Artifact & Blast Radius State (4 cols) */}
        <div className="lg:col-span-4">
          <div
            className={`p-2.5 border ${
              artifact.status === "INVALIDATED"
                ? "border-rose-500 bg-rose-950/30 text-rose-200"
                : artifact.status === "AT_RISK"
                ? "border-amber-500/60 bg-amber-950/20 text-amber-200"
                : "border-emerald-500/50 bg-emerald-950/15 text-emerald-200"
            }`}
          >
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="uppercase opacity-75">LOCUS STATE</span>
              <span className="font-bold px-1.5 py-0.2 bg-zinc-950/80 border border-current">
                {artifact.status}
              </span>
            </div>
            <div className="text-xs font-bold truncate mb-1">
              {artifact.targetLocus || "No code location set"}
            </div>
            <div className="text-[10px] opacity-85 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {artifact.cascadedFromId
                  ? "CASCADED KILL-SWITCH → TEARDOWN"
                  : artifact.status === "INVALIDATED"
                  ? "KILL-SWITCH FIRED → TEARDOWN"
                  : artifact.status === "AT_RISK"
                  ? "DECAY WARNING → MONITOR"
                  : "CONSTRAINTS HOLDING"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cross-Artifact Multi-Hop Cascade Graph Section */}
      <div className="pt-2.5 border-t border-zinc-800/80 space-y-2 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-300 font-bold">
            <Network className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Cross-Artifact Multi-Hop Cascade Topology (Blast Radius Chain)
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsLinkingUpstream((prev) => !prev)}
            className="px-2 py-0.5 text-[10px] bg-zinc-950 hover:bg-zinc-800 text-sky-300 border border-zinc-700 flex items-center gap-1 transition-colors"
          >
            <Link2 className="w-3 h-3" />
            <span>
              {isLinkingUpstream
                ? "Close Dependency Linker"
                : "+ Link Upstream Decision"}
            </span>
          </button>
        </div>

        {isLinkingUpstream && (
          <div className="p-2.5 bg-zinc-950 border border-sky-500/40 space-y-2 text-[11px]">
            <div className="text-zinc-400">
              Select an upstream <strong>DecisionArtifact</strong> that{" "}
              <span className="text-zinc-100 font-semibold">
                {artifact.title}
              </span>{" "}
              depends on (invalidating upstream will automatically cascade here):
            </div>
            {candidateUpstreams.length === 0 ? (
              <div className="text-zinc-500 text-[10px]">
                All eligible non-cyclic upstream artifacts are already linked.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {candidateUpstreams.map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    disabled={isUpdatingDeps}
                    onClick={() => handleToggleUpstream(cand.id)}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 text-[10px]"
                  >
                    <span className="text-emerald-400">+</span>
                    <span>{cand.title}</span>
                    <span className="text-zinc-500">[{cand.status}]</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-11 gap-2 items-center text-[10px]">
          {/* Upstream Prerequisite Decisions */}
          <div className="md:col-span-4 p-2 bg-zinc-950 border border-zinc-800 space-y-1.5">
            <div className="text-[9px] uppercase text-zinc-500 flex items-center justify-between">
              <span>UPSTREAM PREREQUISITES ({upstreamArtifacts.length})</span>
              <span>DEPENDS ON</span>
            </div>
            {upstreamArtifacts.length === 0 ? (
              <div className="text-zinc-500 py-1">
                Root Decision (No upstream artifact dependencies)
              </div>
            ) : (
              upstreamArtifacts.map((up) => (
                <div
                  key={up.id}
                  className={`p-1.5 border flex items-center justify-between gap-1.5 ${
                    up.status === "INVALIDATED"
                      ? "border-rose-500/60 bg-rose-950/30 text-rose-200"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectArtifact(up.id)}
                    className="truncate text-left hover:underline font-semibold flex-1"
                  >
                    {up.title}
                  </button>
                  <span className="px-1 py-0.2 bg-zinc-950 border border-current text-[9px] shrink-0">
                    {up.status}
                  </span>
                  <button
                    type="button"
                    disabled={isUpdatingDeps}
                    onClick={() => handleToggleUpstream(up.id)}
                    title="Unlink upstream dependency"
                    className="text-zinc-500 hover:text-rose-400 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="md:col-span-1 flex justify-center text-zinc-500">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Current Decision Node */}
          <div className="md:col-span-2 p-2 bg-zinc-900 border border-zinc-700 text-center">
            <div className="text-[9px] text-zinc-400 uppercase">THIS NODE</div>
            <div className="text-zinc-100 font-bold truncate">
              {artifact.type}
            </div>
            <div
              className={`text-[9px] font-bold ${
                artifact.status === "INVALIDATED"
                  ? "text-rose-400"
                  : artifact.status === "AT_RISK"
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {artifact.status}
            </div>
          </div>

          <div className="md:col-span-1 flex justify-center text-zinc-500">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Downstream Dependent Decisions (Multi-Hop Blast Radius) */}
          <div className="md:col-span-3 p-2 bg-zinc-950 border border-zinc-800 space-y-1.5">
            <div className="text-[9px] uppercase text-zinc-500 flex items-center justify-between">
              <span>DOWNSTREAM CASCADE ({downstreamArtifacts.length})</span>
              <span>AUTO-KILL</span>
            </div>
            {downstreamArtifacts.length === 0 ? (
              <div className="text-zinc-500 py-1">
                Leaf Decision (0 downstream dependents)
              </div>
            ) : (
              downstreamArtifacts.map((down) => (
                <button
                  key={down.id}
                  type="button"
                  onClick={() => onSelectArtifact(down.id)}
                  className={`w-full p-1.5 border flex items-center justify-between gap-1.5 text-left ${
                    down.status === "INVALIDATED"
                      ? "border-rose-500/60 bg-rose-950/30 text-rose-200"
                      : "border-sky-500/40 bg-sky-950/15 text-sky-200"
                  }`}
                >
                  <span className="truncate font-semibold">{down.title}</span>
                  <span className="px-1 py-0.2 bg-zinc-950 border border-current text-[9px] shrink-0">
                    {down.cascadedFromId ? "CASCADED" : down.status}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
