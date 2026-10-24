"use client";

import React, { useState } from "react";
import {
  Flame,
  Zap,
  RotateCcw,
  Sliders,
  Terminal,
  Copy,
  Check,
  AlertOctagon,
  X,
} from "lucide-react";
import {
  DecisionArtifactRecord,
  OPERATOR_SYMBOLS,
  PremiseRecord,
} from "@/lib/types";
import { getSimulationRange } from "@/lib/evaluator";

interface ChaosDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  artifacts: DecisionArtifactRecord[];
  selectedArtifactId: string;
  onSelectArtifact: (id: string) => void;
  onMutateMetric: (params: {
    variableName: string;
    premiseId: string;
    value: number | string;
    source: string;
  }) => Promise<void>;
  onResetSeed: () => Promise<void>;
  isResetting: boolean;
}

interface ChaosPreset {
  id: string;
  label: string;
  description: string;
  artifactId: string;
  variableName: string;
  premiseId: string;
  targetValue: number;
  unit: string;
}

const CHAOS_PRESETS: ChaosPreset[] = [
  {
    id: "preset-llm-price-drop",
    label: "Simulate Frontier LLM Price Cut ($3.00 → $1.25/1M)",
    description:
      "Crosses ADR-014 threshold (<= $2.00/1M), invalidating the 4,200 LOC Redis Semantic Cache.",
    artifactId: "art-adr-014",
    variableName: "upstream_llm_input_cost_usd",
    premiseId: "prem-adr-014-cost",
    targetValue: 1.25,
    unit: "USD / 1M tokens",
  },
  {
    id: "preset-ttft-drop",
    label: "Simulate Upstream API Latency Dropping (695ms → 310ms)",
    description:
      "Crosses ADR-014 latency threshold (<= 650ms), rendering custom caching layer obsolete.",
    artifactId: "art-adr-014",
    variableName: "upstream_ttft_p95_ms",
    premiseId: "prem-adr-014-ttft",
    targetValue: 310,
    unit: "ms",
  },
  {
    id: "preset-webhook-sla-fixed",
    label: "Simulate Primary Webhook SLA Reaching 99.96%",
    description:
      "Crosses PR #892 SLA threshold (>= 99.9%), making the BullMQ failover queue & secondary relay dead weight.",
    artifactId: "art-pr-892",
    variableName: "primary_webhook_uptime_pct",
    premiseId: "prem-pr-892-uptime",
    targetValue: 99.96,
    unit: "%",
  },
  {
    id: "preset-cac-spike",
    label: "Simulate Paid Search CAC Spiking ($61.20 → $78.50)",
    description:
      "Breaches GTM-Q3 CAC ceiling (>= $65.00), triggering immediate kill-switch on $45k/mo ad spend.",
    artifactId: "art-gtm-q3",
    variableName: "blended_search_cac_usd",
    premiseId: "prem-gtm-q3-cac",
    targetValue: 78.5,
    unit: "USD",
  },
];

export function ChaosDrawer({
  isOpen,
  onClose,
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
  onMutateMetric,
  onResetSeed,
  isResetting,
}: ChaosDrawerProps) {
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  if (!isOpen) return null;

  const allPremises: Array<{
    premise: PremiseRecord;
    artifactTitle: string;
    artifactId: string;
  }> = artifacts.flatMap((art) =>
    art.premises.map((p) => ({
      premise: p,
      artifactTitle: art.title,
      artifactId: art.id,
    }))
  );

  const selectedArtifact =
    artifacts.find((a) => a.id === selectedArtifactId) || artifacts[0];
  const samplePremise =
    selectedArtifact?.premises[0] || allPremises[0]?.premise;

  const webhookCurlCommand = samplePremise
    ? `curl -X POST http://localhost:3000/api/webhooks/metric \\
  -H "Content-Type: application/json" \\
  -d '{"variableName": "${samplePremise.variableName}", "value": ${samplePremise.thresholdValue}, "source": "ci-cd-telemetry"}'`
    : "";

  const handleCopyCurl = () => {
    if (!webhookCurlCommand) return;
    navigator.clipboard.writeText(webhookCurlCommand);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="border-b border-amber-500/40 bg-zinc-950/95 shadow-2xl relative z-30">
      {/* Top Accent Strip */}
      <div className="h-0.5 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-emerald-500" />

      <div className="px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Flame className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                  Pipeline C // Simulate Reality Drift (Chaos Engine)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  LIVE STATE MACHINE MUTATOR
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Drag any telemetry slider past its assertion boundary or fire a
                synthetic drift spike to trigger real-time invalidation &amp;
                teardown specs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetSeed}
              disabled={isResetting}
              className="px-2.5 py-1 text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw
                className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`}
              />
              <span>Reset All Telemetry to Seed Baseline</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              title="Close Chaos Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1-Click Synthetic Telemetry Spike / Drop Presets */}
        <div className="py-2.5 border-b border-zinc-800/80">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>1-Click Synthetic Telemetry Drift Injectors:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            {CHAOS_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={async () => {
                  onSelectArtifact(preset.artifactId);
                  setLocalValues((prev) => ({
                    ...prev,
                    [preset.premiseId]: String(preset.targetValue),
                  }));
                  await onMutateMetric({
                    variableName: preset.variableName,
                    premiseId: preset.premiseId,
                    value: preset.targetValue,
                    source: `chaos-preset:${preset.id}`,
                  });
                }}
                className="text-left p-2.5 bg-zinc-900/90 hover:bg-rose-950/30 border border-zinc-800 hover:border-rose-500/50 transition-all group"
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-mono font-semibold text-zinc-100 group-hover:text-rose-300 transition-colors">
                    {preset.label}
                  </span>
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0 opacity-70 group-hover:opacity-100" />
                </div>
                <p className="text-[11px] text-zinc-400 line-clamp-2 leading-snug">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Sliders for Active Premises + Webhook CLI Inspector */}
        <div className="pt-3 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 space-y-2 max-h-52 overflow-y-auto pr-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Sliders className="w-3 h-3 text-emerald-400" />
              <span>
                Continuous Telemetry Drift Sliders (All Bound Premises):
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {allPremises.map(({ premise, artifactTitle, artifactId }) => {
                const range = getSimulationRange(premise);
                const displayVal =
                  localValues[premise.id] ?? premise.currentValue;
                const numericVal = Number(displayVal);
                const statusColor =
                  premise.status === "BROKEN"
                    ? "border-rose-500/60 bg-rose-950/20"
                    : premise.status === "DECAYING"
                    ? "border-amber-500/50 bg-amber-950/15"
                    : "border-zinc-800 bg-zinc-900/60";

                return (
                  <div
                    key={premise.id}
                    onClick={() => onSelectArtifact(artifactId)}
                    className={`p-2.5 border transition-colors cursor-pointer ${statusColor}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-mono text-zinc-300 truncate font-medium">
                        {premise.variableName}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 font-semibold border ${
                          premise.status === "BROKEN"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            : premise.status === "DECAYING"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        }`}
                      >
                        {premise.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1.5">
                      <span className="truncate max-w-[180px] text-zinc-500">
                        {artifactTitle}
                      </span>
                      <span>
                        LIVE:{" "}
                        <strong className="text-zinc-100">
                          {displayVal} {premise.unit}
                        </strong>{" "}
                        | REQ: {OPERATOR_SYMBOLS[premise.operator]}{" "}
                        {premise.thresholdValue}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {range.min}
                      </span>
                      <input
                        type="range"
                        min={range.min}
                        max={range.max}
                        step={range.step}
                        value={
                          Number.isNaN(numericVal) ? range.min : numericVal
                        }
                        onChange={async (e) => {
                          const nextVal = e.target.value;
                          setLocalValues((prev) => ({
                            ...prev,
                            [premise.id]: nextVal,
                          }));
                          onSelectArtifact(artifactId);
                          await onMutateMetric({
                            variableName: premise.variableName,
                            premiseId: premise.id,
                            value: Number(nextVal),
                            source: "chaos-slider-drift",
                          });
                        }}
                        className="w-full accent-amber-500 h-1.5 bg-zinc-800 cursor-ew-resize"
                      />
                      <span className="text-[10px] font-mono text-zinc-500">
                        {range.max}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right 4 cols: Live Webhook Ingest Endpoint Snippet */}
          <div className="lg:col-span-4 bg-zinc-900/90 border border-zinc-800 p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-zinc-300">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>External CI/CD Webhook Ingest</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCurl}
                  className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1"
                >
                  {copiedWebhook ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy cURL</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-[10px] font-mono text-emerald-300/90 bg-zinc-950 p-2 border border-zinc-800/80 overflow-x-auto leading-relaxed">
                {webhookCurlCommand}
              </pre>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-2">
              POSTing `{`{ variableName, value }`}` to `/api/webhooks/metric`
              immediately evaluates all bound premises in SQLite.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
