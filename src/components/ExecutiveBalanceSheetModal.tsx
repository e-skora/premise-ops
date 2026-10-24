"use client";

import React, { useState } from "react";
import {
  DollarSign,
  TrendingDown,
  Sparkles,
  Clock,
  Layers,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  X,
  FileCode2,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { FinOpsLedgerSummary } from "@/lib/types";
import { formatUsd } from "@/lib/finops-engine";

interface ExecutiveBalanceSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledger: FinOpsLedgerSummary;
  onSelectArtifact?: (artifactId: string) => void;
}

export function ExecutiveBalanceSheetModal({
  isOpen,
  onClose,
  ledger,
  onSelectArtifact,
}: ExecutiveBalanceSheetModalProps) {
  const [filter, setFilter] = useState<"ALL" | "DRAGGING" | "SAVED">("ALL");

  if (!isOpen) return null;

  const filteredArtifacts = ledger.artifacts.filter((a) => {
    if (filter === "DRAGGING") return a.isBroken || a.isDecaying;
    if (filter === "SAVED") return a.isTeardownApplied;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono text-zinc-100 uppercase tracking-tight">
                  Architecture Balance Sheet & FinOps Drag Ledger
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300">
                  HORIZON E
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                Executive FinOps accounting of architectural debt, active drag burn rate, and eliminated cloud waste.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Executive KPI Ticker Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5 border-b border-zinc-800 bg-zinc-900/30 shrink-0">
          {/* Card 1: Active Invalidation Drag */}
          <div className="bg-zinc-950/90 border border-rose-900/50 p-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-rose-400">
                <AlertOctagon className="w-3.5 h-3.5" />
                Active Breach Drag
              </span>
              <span className="text-[10px] text-zinc-500">MONTHLY</span>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400 mt-1 tabular-nums">
              {formatUsd(ledger.activeInvalidationMonthlyDragUsd)}
              <span className="text-xs font-normal text-zinc-400">/mo</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-1 flex items-center gap-1">
              <span>Amortized Daily:</span>
              <span className="font-bold text-rose-300">
                {formatUsd(ledger.totalActiveDragDailyUsd)}/day
              </span>
            </div>
          </div>

          {/* Card 2: Decaying Risk */}
          <div className="bg-zinc-950/90 border border-amber-900/50 p-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Decaying At-Risk Drag
              </span>
              <span className="text-[10px] text-zinc-500">WARNING</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1 tabular-nums">
              {formatUsd(ledger.activeDecayingMonthlyDragUsd)}
              <span className="text-xs font-normal text-zinc-400">/mo</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-1">
              {ledger.decayingDecisionsCount} decision(s) drifting toward breach
            </div>
          </div>

          {/* Card 3: Total Waste Eliminated */}
          <div className="bg-zinc-950/90 border border-emerald-900/50 p-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Sparkles className="w-3.5 h-3.5" />
                Waste Eliminated
              </span>
              <span className="text-[10px] text-zinc-500">ANNUAL SAVINGS</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">
              {formatUsd(ledger.cumulativeAnnualSavingsUsd)}
              <span className="text-xs font-normal text-zinc-400">/yr</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-1 flex items-center gap-1">
              <span>Run-Rate:</span>
              <span className="font-bold text-emerald-300">
                {formatUsd(ledger.cumulativeMonthlySavingsUsd)}/mo
              </span>
            </div>
          </div>

          {/* Card 4: Engineering Capacity */}
          <div className="bg-zinc-950/90 border border-zinc-800 p-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-sky-400">
                <Clock className="w-3.5 h-3.5" />
                Eng Capacity Drag
              </span>
              <span className="text-[10px] text-zinc-500">
                @{ledger.blendedHourlyEngRateUsd}/hr
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-100 mt-1 tabular-nums">
              {ledger.wastedEngHoursPerMonth}{" "}
              <span className="text-xs font-normal text-zinc-400">hrs/mo</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-1 flex items-center gap-1">
              <span>Freed:</span>
              <span className="font-bold text-emerald-400">
                +{ledger.freedEngHoursPerYear} hrs/yr
              </span>
            </div>
          </div>
        </div>

        {/* Filter Controls & Ledger Table Header */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400 uppercase font-semibold">
              Filter Decisions:
            </span>
            <div className="inline-flex border border-zinc-800 divide-x divide-zinc-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setFilter("ALL")}
                className={`px-3 py-1 transition-colors ${
                  filter === "ALL"
                    ? "bg-zinc-800 text-zinc-100 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All ({ledger.artifacts.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("DRAGGING")}
                className={`px-3 py-1 transition-colors ${
                  filter === "DRAGGING"
                    ? "bg-rose-950/70 text-rose-300 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Active Drag (
                {
                  ledger.artifacts.filter((a) => a.isBroken || a.isDecaying)
                    .length
                }
                )
              </button>
              <button
                type="button"
                onClick={() => setFilter("SAVED")}
                className={`px-3 py-1 transition-colors ${
                  filter === "SAVED"
                    ? "bg-emerald-950/70 text-emerald-300 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Saved / Torn Down ({ledger.appliedTeardownsCount})
              </button>
            </div>
          </div>

          <div className="text-xs font-mono text-zinc-500">
            Total Monitored Architecture Spend:{" "}
            <span className="font-bold text-zinc-300">
              {formatUsd(
                ledger.artifacts.reduce(
                  (acc, a) => acc + a.monthlyCloudSpendUsd,
                  0
                )
              )}
              /mo
            </span>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          {filteredArtifacts.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 font-mono text-xs">
              No architectural decisions match filter '{filter}'.
            </div>
          ) : (
            <div className="border border-zinc-800 divide-y divide-zinc-800 bg-zinc-950 font-mono text-xs">
              <div className="grid grid-cols-12 px-4 py-2 bg-zinc-900/60 text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
                <div className="col-span-4">Decision Artifact / Title</div>
                <div className="col-span-2 text-right">Cloud Spend</div>
                <div className="col-span-2 text-right">Eng Maintenance</div>
                <div className="col-span-2 text-right">Total Drag / Burn</div>
                <div className="col-span-2 text-right">Balance Status</div>
              </div>

              {filteredArtifacts.map((art) => (
                <div
                  key={art.artifactId}
                  onClick={() => {
                    if (onSelectArtifact) {
                      onSelectArtifact(art.artifactId);
                      onClose();
                    }
                  }}
                  className={`grid grid-cols-12 px-4 py-3 items-center hover:bg-zinc-900/40 transition-colors cursor-pointer ${
                    art.isTeardownApplied
                      ? "bg-emerald-950/10"
                      : art.isBroken
                      ? "bg-rose-950/15"
                      : art.isDecaying
                      ? "bg-amber-950/10"
                      : ""
                  }`}
                >
                  <div className="col-span-4 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-200 truncate">
                        {art.title}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                      <span className="px-1 py-0.2 bg-zinc-900 border border-zinc-800">
                        {art.type}
                      </span>
                      <span>ID: {art.artifactId}</span>
                      {art.cascadedFromId && (
                        <span className="text-amber-400">
                          (Cascade: {art.cascadedFromId})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 text-right tabular-nums">
                    <div className="font-bold text-zinc-200">
                      {formatUsd(art.monthlyCloudSpendUsd)}/mo
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {formatUsd(art.monthlyCloudSpendUsd * 12)}/yr
                    </div>
                  </div>

                  <div className="col-span-2 text-right tabular-nums">
                    <div className="font-bold text-zinc-200">
                      {art.maintenanceHoursPerMonth} hrs/mo
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {formatUsd(art.blendedEngCostMonthlyUsd)}/mo
                    </div>
                  </div>

                  <div className="col-span-2 text-right tabular-nums">
                    <div
                      className={`font-bold ${
                        art.isTeardownApplied
                          ? "text-emerald-400"
                          : art.isBroken
                          ? "text-rose-400"
                          : art.isDecaying
                          ? "text-amber-400"
                          : "text-zinc-300"
                      }`}
                    >
                      {formatUsd(art.totalMonthlyDragUsd)}/mo
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {formatUsd(art.dailyDragUsd)}/day
                    </div>
                  </div>

                  <div className="col-span-2 flex items-center justify-end gap-1.5">
                    {art.isTeardownApplied ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        TORN DOWN (+{formatUsd(art.realizedAnnualSavingsUsd)}/yr)
                      </span>
                    ) : art.isBroken ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[10px] font-bold">
                        <AlertOctagon className="w-3 h-3 text-rose-400" />
                        ACTIVE DRAG
                      </span>
                    ) : art.isDecaying ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-950/80 border border-amber-500/50 text-amber-300 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        DECAYING RISK
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px]">
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        HEALTHY
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/60 font-mono text-xs">
          <div className="text-zinc-500">
            * Blended engineering rate defaulted to $150/hr for custom workaround maintenance.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold transition-colors"
          >
            Close Balance Sheet
          </button>
        </div>
      </div>
    </div>
  );
}
