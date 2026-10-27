"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  History,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Sparkles,
  Sliders,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  X,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Zap,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  ArrowRight,
  Check,
} from "lucide-react";
import {
  BacktestOptions,
  BacktestReport,
  DecisionArtifactRecord,
  InvalidationEventRecord,
  OPERATOR_SYMBOLS,
  ScenarioPreset,
} from "@/lib/types";
import { SCENARIO_PRESETS } from "@/lib/backtest-engine";

interface TimeMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  artifacts: DecisionArtifactRecord[];
  onUpdateArtifacts?: (arts: DecisionArtifactRecord[]) => void;
  onUpdateEvents?: (events: InvalidationEventRecord[]) => void;
  onToast?: (msg: string) => void;
}

export function TimeMachineModal({
  isOpen,
  onClose,
  artifacts,
  onUpdateArtifacts,
  onUpdateEvents,
  onToast,
}: TimeMachineModalProps) {
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<string>("price-war");
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>("ALL");
  const [steps, setSteps] = useState<number>(20);
  const [shockMagnitudePct, setShockMagnitudePct] = useState<number>(-60);
  const [noiseFactorPct, setNoiseFactorPct] = useState<number>(3);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [report, setReport] = useState<BacktestReport | null>(null);

  // Playback & Scrubber State
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 4x
  const [applyingThresholdPremiseId, setApplyingThresholdPremiseId] = useState<
    string | null
  >(null);
  const [appliedThresholds, setAppliedThresholds] = useState<
    Record<string, boolean>
  >({});

  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const selectedPreset = useMemo(() => {
    return (
      SCENARIO_PRESETS.find((s) => s.id === selectedScenarioId) ||
      SCENARIO_PRESETS[0]
    );
  }, [selectedScenarioId]);

  // When switching presets, initialize sensible default parameters
  const handleSelectPreset = (preset: ScenarioPreset) => {
    setSelectedScenarioId(preset.id);
    setSteps(preset.defaultSteps);
    setShockMagnitudePct(preset.defaultShockPct);
    setNoiseFactorPct(preset.defaultNoisePct);
    if (preset.targetArtifactId) {
      setSelectedArtifactId(preset.targetArtifactId);
    } else {
      setSelectedArtifactId("ALL");
    }
  };

  // Run Backtest Simulation via API
  const runSimulation = async () => {
    setIsLoading(true);
    setIsPlaying(false);
    try {
      const options: BacktestOptions = {
        scenarioId: selectedScenarioId,
        artifactId:
          selectedArtifactId === "ALL" ? undefined : selectedArtifactId,
        steps,
        shockMagnitudePct,
        noiseFactorPct,
      };

      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      const data = await res.json();
      if (res.ok && data.report) {
        setReport(data.report);
        setCurrentStep(0);
      } else {
        onToast?.(data.error || "Failed to execute backtest simulation");
      }
    } catch {
      onToast?.("Simulation request failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Run automatically on first open or scenario change
  useEffect(() => {
    if (isOpen && !report) {
      runSimulation();
    }
  }, [isOpen]);

  // Auto-playback loop
  useEffect(() => {
    if (!isPlaying || !report) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalMs = Math.max(80, Math.floor(500 / playbackSpeed));
    playTimerRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= report.totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, report]);

  if (!isOpen) return null;

  // Selected artifact in report view
  const activeArtifactReport =
    report?.artifacts.find((a) =>
      selectedArtifactId !== "ALL"
        ? a.artifactId === selectedArtifactId
        : true
    ) || report?.artifacts[0];

  const activePremise = activeArtifactReport?.premises[0];
  const activeStepSnapshot = activePremise?.steps[currentStep];

  // 1-Click Apply Recommended Threshold to Premise
  const handleApplyThreshold = async (
    premiseId: string,
    recommendedThreshold: string
  ) => {
    const pRecord = artifacts
      .flatMap((a) => a.premises)
      .find((p) => p.id === premiseId);
    if (!pRecord) return;

    setApplyingThresholdPremiseId(premiseId);
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updatePremiseConfig",
          premiseId,
          operator: pRecord.operator,
          thresholdValue: recommendedThreshold,
          decayWarningMargin: pRecord.decayWarningMargin,
        }),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        onUpdateArtifacts?.(data.artifacts);
        onUpdateEvents?.(data.invalidationEvents || []);
        setAppliedThresholds((prev) => ({ ...prev, [premiseId]: true }));
        onToast?.(
          `Applied recommended threshold ${OPERATOR_SYMBOLS[pRecord.operator]} ${recommendedThreshold} to ${pRecord.variableName}`
        );
        // Re-run simulation with newly applied threshold
        runSimulation();
      } else {
        onToast?.(data.error || "Failed to update premise threshold");
      }
    } finally {
      setApplyingThresholdPremiseId(null);
    }
  };

  // Trajectory SVG Chart Coordinate Calculations
  const chartPoints = activePremise ? activePremise.steps : [];
  // Premises with no data have null values and draw no line
  const allSimValues = chartPoints
    .map((p) => p.simulatedValue)
    .filter((v): v is number => v !== null);
  const thrNum = activePremise ? Number(activePremise.thresholdValue) : 0;
  const minVal = Math.min(...allSimValues, thrNum * 0.85);
  const maxVal = Math.max(...allSimValues, thrNum * 1.15, 1);
  const valRange = maxVal - minVal || 1;

  const chartW = 600;
  const chartH = 170;
  const padX = 35;
  const padY = 20;

  const getSvgX = (stepIdx: number) => {
    if (chartPoints.length <= 1) return padX;
    return (
      padX + (stepIdx / (chartPoints.length - 1)) * (chartW - padX * 2)
    );
  };

  const getSvgY = (val: number) => {
    const norm = (val - minVal) / valRange;
    return chartH - padY - norm * (chartH - padY * 2);
  };

  const polylinePoints = chartPoints
    .map((p, idx) =>
      p.simulatedValue === null ? null : `${getSvgX(idx)},${getSvgY(p.simulatedValue)}`
    )
    .filter(Boolean)
    .join(" ");

  const thresholdY = getSvgY(thrNum);
  const currentNeedleX = getSvgX(currentStep);
  const currentNeedleValue = chartPoints[currentStep]?.simulatedValue;
  const currentNeedleY =
    currentNeedleValue !== undefined && currentNeedleValue !== null
      ? getSvgY(currentNeedleValue)
      : thresholdY;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 text-zinc-100 w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        {/* 1. MODAL HEADER */}
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <History className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-wide text-zinc-100">
                  HORIZON C // HISTORICAL DRIFT BACKTESTER & SCENARIO REPLAY
                </span>
                <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/30">
                  TIME-MACHINE ENGINE
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Stress-test premise resilience, threshold safety buffers & multi-hop cascade blast radiuses
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runSimulation}
              disabled={isLoading}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold border border-purple-400 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
              <span>{isLoading ? "Simulating..." : "Run Simulation"}</span>
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

        {/* 2. SCENARIO PRESETS BAR */}
        <div className="px-5 py-2.5 border-b border-zinc-800/80 bg-zinc-900/40 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0 font-bold">
            Scenario Presets:
          </span>
          <div className="flex items-center gap-1.5">
            {SCENARIO_PRESETS.map((preset) => {
              const isSelected = selectedScenarioId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors border ${
                    isSelected
                      ? "bg-purple-950 text-purple-200 border-purple-500 font-semibold"
                      : "bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 border-zinc-800"
                  }`}
                >
                  {preset.name.split(" (")[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. SCENARIO SUMMARY & PARAMETER CONTROLS */}
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/90 grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
          <div className="md:col-span-2 flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-purple-300">
                {selectedPreset.name}
              </span>
              <span className="px-1.5 py-0.2 text-[9px] bg-zinc-900 border border-zinc-800 text-zinc-400">
                {selectedPreset.category}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">
              {selectedPreset.description}
            </p>
          </div>

          {/* Controls: Target Decision & Steps */}
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">
              Target Decision
            </label>
            <select
              value={selectedArtifactId}
              onChange={(e) => setSelectedArtifactId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200"
            >
              <option value="ALL">All Decisions (Full DAG & Cascades)</option>
              {artifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>

            <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400">
              <span>Steps: {steps}</span>
              <input
                type="range"
                min={5}
                max={50}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="w-24 accent-purple-500"
              />
            </div>
          </div>

          {/* Controls: Shock & Noise */}
          <div>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
              <span>Shock Magnitude</span>
              <span
                className={`font-bold ${
                  shockMagnitudePct < 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {shockMagnitudePct > 0 ? `+${shockMagnitudePct}` : shockMagnitudePct}%
              </span>
            </div>
            <input
              type="range"
              min={-90}
              max={150}
              value={shockMagnitudePct}
              onChange={(e) => setShockMagnitudePct(Number(e.target.value))}
              className="w-full accent-purple-500"
            />

            <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400">
              <span>Volatility Noise: {noiseFactorPct}%</span>
              <input
                type="range"
                min={0}
                max={15}
                value={noiseFactorPct}
                onChange={(e) => setNoiseFactorPct(Number(e.target.value))}
                className="w-24 accent-purple-500"
              />
            </div>
          </div>
        </div>

        {/* 4. INTERACTIVE TIME-MACHINE SCRUBBER & PLAYER */}
        <div className="px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-600 flex items-center gap-1.5 transition-colors font-bold"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                  <span>Play Replay</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
              disabled={currentStep === 0}
              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40"
              title="Step Backward"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentStep((s) => Math.min((report?.totalSteps || 20) - 1, s + 1))
              }
              disabled={currentStep >= (report?.totalSteps || 20) - 1}
              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40"
              title="Step Forward"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(0)}
              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300"
              title="Reset to Step 0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1 ml-2 text-[10px] text-zinc-400">
              <span>Speed:</span>
              {[1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-1.5 py-0.5 border ${
                    playbackSpeed === spd
                      ? "bg-purple-950 text-purple-300 border-purple-500 font-bold"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Scrubber needle & timeline slider */}
          <div className="flex-1 max-w-md flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 whitespace-nowrap">
              Tick {currentStep} / {(report?.totalSteps || 20) - 1}
            </span>
            <input
              type="range"
              min={0}
              max={(report?.totalSteps || 20) - 1}
              value={currentStep}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentStep(Number(e.target.value));
              }}
              className="w-full accent-purple-400 cursor-pointer"
            />
            <span className="text-[10px] font-bold text-purple-400 whitespace-nowrap bg-purple-950/70 border border-purple-800/60 px-2 py-0.5">
              +{currentStep}h Virtual
            </span>
          </div>
        </div>

        {/* 5. MAIN CONTENT VIEWPORT */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT 7 COLS: SVG TRAJECTORY & COLLAPSE TIMELINE */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Visual Trajectory Chart Card */}
            <div className="bg-zinc-900/40 border border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                    <span>{activePremise?.claim || "Telemetry Trajectory"}</span>
                    <span className="text-zinc-500 font-normal">
                      ({activePremise?.variableName})
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 flex items-center gap-3 mt-0.5">
                    <span>
                      Required Bound:{" "}
                      <span className="text-sky-300 font-semibold">
                        {OPERATOR_SYMBOLS[activePremise?.operator || "GT"]}{" "}
                        {activePremise?.thresholdValue} {activePremise?.unit}
                      </span>
                    </span>
                    <span>•</span>
                    <span>
                      At Tick #{currentStep}:{" "}
                      <span className="text-zinc-100 font-bold">
                        {activeStepSnapshot?.simulatedValue ?? "No data"}{" "}
                        {activePremise?.unit}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Status at Scrub Position */}
                {activeStepSnapshot && (
                  <span
                    className={`px-2 py-1 text-xs font-bold border ${
                      activeStepSnapshot.status === "VALID"
                        ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                        : activeStepSnapshot.status === "DECAYING"
                        ? "bg-amber-950 text-amber-300 border-amber-500"
                        : "bg-rose-950 text-rose-300 border-rose-500"
                    }`}
                  >
                    {activeStepSnapshot.status === "VALID"
                      ? "● VALID"
                      : activeStepSnapshot.status === "DECAYING"
                      ? "▲ DECAYING"
                      : "✖ BROKEN"}
                  </span>
                )}
              </div>

              {/* Trajectory SVG */}
              <div className="relative w-full bg-zinc-950 border border-zinc-800/80 p-2 overflow-hidden">
                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full h-44 select-none"
                >
                  {/* Grid Lines */}
                  <line
                    x1={padX}
                    y1={padY}
                    x2={chartW - padX}
                    y2={padY}
                    stroke="#27272a"
                    strokeDasharray="2,2"
                  />
                  <line
                    x1={padX}
                    y1={chartH / 2}
                    x2={chartW - padX}
                    y2={chartH / 2}
                    stroke="#27272a"
                    strokeDasharray="2,2"
                  />
                  <line
                    x1={padX}
                    y1={chartH - padY}
                    x2={chartW - padX}
                    y2={chartH - padY}
                    stroke="#27272a"
                    strokeDasharray="2,2"
                  />

                  {/* Required Threshold Line (Dashed Red) */}
                  <line
                    x1={padX}
                    y1={thresholdY}
                    x2={chartW - padX}
                    y2={thresholdY}
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={chartW - padX - 4}
                    y={thresholdY - 5}
                    fill="#f43f5e"
                    fontSize="9"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    BOUND ({OPERATOR_SYMBOLS[activePremise?.operator || "GT"]}{" "}
                    {activePremise?.thresholdValue} {activePremise?.unit})
                  </text>

                  {/* Trajectory Polyline */}
                  <polyline
                    fill="none"
                    stroke="#c084fc"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={polylinePoints}
                  />

                  {/* Breach Marker */}
                  {activePremise && activePremise.breachStep !== null && (
                    <g>
                      <circle
                        cx={getSvgX(activePremise.breachStep)}
                        cy={getSvgY(activePremise.breachValue || thrNum)}
                        r="5"
                        fill="#f43f5e"
                        stroke="#fff"
                        strokeWidth="1.5"
                        className="animate-ping"
                      />
                      <circle
                        cx={getSvgX(activePremise.breachStep)}
                        cy={getSvgY(activePremise.breachValue || thrNum)}
                        r="4"
                        fill="#f43f5e"
                      />
                    </g>
                  )}

                  {/* Current Needle Indicator */}
                  <line
                    x1={currentNeedleX}
                    y1={padY}
                    x2={currentNeedleX}
                    y2={chartH - padY}
                    stroke="#a855f7"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={currentNeedleX}
                    cy={currentNeedleY}
                    r="4.5"
                    fill="#c084fc"
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                </svg>

                {/* Bottom Chart Legend */}
                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-900">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-0.5 bg-rose-500" /> Threshold Bound
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-0.5 bg-purple-400" /> Simulated Trajectory
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-500" /> Current Needle
                    </span>
                  </div>
                  <span>
                    Range: [{minVal.toFixed(2)} .. {maxVal.toFixed(2)}{" "}
                    {activePremise?.unit}]
                  </span>
                </div>
              </div>
            </div>

            {/* Virtual Timeline Transition Progression */}
            <div className="bg-zinc-900/40 border border-zinc-800 p-3">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-2">
                Simulated State Transition Progression
              </span>
              <div className="space-y-2">
                {report?.artifacts.map((art) => (
                  <div key={art.artifactId} className="bg-zinc-950 p-2 border border-zinc-800/80">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-bold text-zinc-200">{art.title}</span>
                      <span
                        className={`px-1.5 py-0.2 text-[10px] border ${
                          art.statusAtEnd === "HEALTHY"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                            : "bg-rose-950 text-rose-300 border-rose-500"
                        }`}
                      >
                        {art.statusAtEnd}
                      </span>
                    </div>

                    {/* Step Bar Visualizer */}
                    <div className="flex gap-0.5 h-3 w-full bg-zinc-900 p-0.5">
                      {art.premises[0]?.steps.map((s, idx) => {
                        const isCurrent = idx === currentStep;
                        return (
                          <div
                            key={idx}
                            title={`Step ${idx}: ${s.simulatedValue ?? "no data"} (${s.status})`}
                            onClick={() => setCurrentStep(idx)}
                            className={`flex-1 cursor-pointer transition-all ${
                              s.status === "VALID"
                                ? "bg-emerald-500/60 hover:bg-emerald-400"
                                : s.status === "DECAYING"
                                ? "bg-amber-500/70 hover:bg-amber-400"
                                : "bg-rose-500/80 hover:bg-rose-400"
                            } ${isCurrent ? "ring-2 ring-white scale-110 z-10" : ""}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLS: RESILIENCE SCORECARD, CASCADE IMPACT & THRESHOLD OPTIMIZER */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Quantitative Resilience Scorecard Card */}
            <div className="bg-zinc-900/40 border border-zinc-800 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-bold">
                    Resilience Scorecard
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span
                      className={`text-3xl font-black tabular-nums ${
                        (activePremise?.resilienceScore || 0) >= 80
                          ? "text-emerald-400"
                          : (activePremise?.resilienceScore || 0) >= 50
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {activePremise?.resilienceScore || 0}
                    </span>
                    <span className="text-zinc-500 text-sm font-bold">/ 100</span>
                    <span
                      className={`px-2 py-0.5 text-xs font-bold border ml-2 ${
                        activePremise?.resilienceRating === "HIGH"
                          ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                          : activePremise?.resilienceRating === "MODERATE"
                          ? "bg-amber-950 text-amber-300 border-amber-500"
                          : "bg-rose-950 text-rose-300 border-rose-500"
                      }`}
                    >
                      {activePremise?.resilienceRating === "HIGH"
                        ? "HIGH RESILIENCE"
                        : activePremise?.resilienceRating === "MODERATE"
                        ? "MODERATE (AT RISK)"
                        : "BRITTLE (COLLAPSE RISK)"}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 block">
                    Survival Rate
                  </span>
                  <span className="text-lg font-bold text-zinc-100 tabular-nums">
                    {activePremise?.survivalRatePct || 0}%
                  </span>
                </div>
              </div>

              {/* Metric Breakdown Grid */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/80 text-[11px]">
                <div className="bg-zinc-950 p-2 border border-zinc-800/60">
                  <span className="text-zinc-500 block text-[9px] uppercase">
                    First Decay Tick
                  </span>
                  <span className="font-bold text-amber-300">
                    {activePremise?.firstDecayingStep !== null
                      ? `Tick #${activePremise?.firstDecayingStep}`
                      : "Never Decayed"}
                  </span>
                </div>

                <div className="bg-zinc-950 p-2 border border-zinc-800/60">
                  <span className="text-zinc-500 block text-[9px] uppercase">
                    Breach Tick
                  </span>
                  <span className="font-bold text-rose-400">
                    {activePremise?.breachStep !== null
                      ? `Tick #${activePremise?.breachStep} (${activePremise?.breachValue} ${activePremise?.unit})`
                      : "SURVIVED"}
                  </span>
                </div>

                <div className="bg-zinc-950 p-2 border border-zinc-800/60">
                  <span className="text-zinc-500 block text-[9px] uppercase">
                    Peak Drift
                  </span>
                  <span className="font-bold text-zinc-200">
                    {activePremise?.maxDriftPercent || 0}%
                  </span>
                </div>

                <div className="bg-zinc-950 p-2 border border-zinc-800/60">
                  <span className="text-zinc-500 block text-[9px] uppercase">
                    Safety Margin
                  </span>
                  <span className="font-bold text-emerald-400">
                    {(
                      (activePremise?.minSafetyMarginRemaining || 0) * 100
                    ).toFixed(0)}
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Multi-Hop Cascade Blast Radius Alert */}
            {activeArtifactReport?.cascadedFromId ? (
              <div className="bg-rose-950/40 border border-rose-500/50 p-3">
                <div className="flex items-center gap-1.5 text-rose-400 font-bold mb-1">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span>MULTI-HOP CASCADE INVALIDATION TRIGGERED</span>
                </div>
                <p className="text-[11px] text-rose-200">
                  This decision was invalidated at Tick #
                  {activeArtifactReport.firstInvalidatedStep} due to upstream dependency
                  failure on <strong>[{activeArtifactReport.cascadedFromId}]</strong>.
                </p>
              </div>
            ) : (activeArtifactReport?.cascadedDownstreamArtifactIds.length || 0) >
              0 ? (
              <div className="bg-sky-950/40 border border-sky-500/40 p-3">
                <div className="flex items-center gap-1.5 text-sky-400 font-bold mb-1">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>CASCADE BLAST RADIUS WARNING</span>
                </div>
                <p className="text-[11px] text-sky-200">
                  If this decision breaks, it will automatically cascade-invalidate{" "}
                  <strong>
                    {activeArtifactReport?.cascadedDownstreamArtifactIds.length}
                  </strong>{" "}
                  dependent decision(s): [
                  {activeArtifactReport?.cascadedDownstreamArtifactIds.join(", ")}].
                </p>
              </div>
            ) : null}

            {/* Actionable Threshold Optimization Advisor */}
            <div className="bg-purple-950/20 border border-purple-500/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="font-bold text-sm text-purple-200">
                  Threshold Safety Buffer Recommendation
                </span>
              </div>

              <div className="bg-zinc-950 p-3 border border-purple-800/40 text-[11px]">
                <div className="text-zinc-300 font-mono mb-2">
                  {activePremise?.recommendedThresholdAdjustment}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <span className="text-[10px] text-zinc-500">
                    Current:{" "}
                    <span className="line-through text-zinc-400">
                      {OPERATOR_SYMBOLS[activePremise?.operator || "GT"]}{" "}
                      {activePremise?.thresholdValue} {activePremise?.unit}
                    </span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold">
                    Recommended:{" "}
                    {OPERATOR_SYMBOLS[activePremise?.operator || "GT"]}{" "}
                    {activePremise?.recommendedThreshold} {activePremise?.unit}
                  </span>
                </div>
              </div>

              {activePremise &&
                activePremise.recommendedThreshold !==
                  activePremise.thresholdValue && (
                  <button
                    type="button"
                    onClick={() =>
                      handleApplyThreshold(
                        activePremise.premiseId,
                        activePremise.recommendedThreshold
                      )
                    }
                    disabled={
                      applyingThresholdPremiseId === activePremise.premiseId ||
                      appliedThresholds[activePremise.premiseId]
                    }
                    className="mt-3 w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold border border-purple-400 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {appliedThresholds[activePremise.premiseId] ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-300" />
                        <span>Threshold Applied to SQLite DB!</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          {applyingThresholdPremiseId === activePremise.premiseId
                            ? "Updating..."
                            : "1-Click Apply Recommended Buffer to DB"}
                        </span>
                      </>
                    )}
                  </button>
                )}
            </div>

            {/* Portfolio Summary Card */}
            <div className="bg-zinc-900/30 border border-zinc-800/60 p-3 text-[10px] text-zinc-400">
              <div className="flex items-center justify-between font-bold text-zinc-200 mb-1">
                <span>PORTFOLIO BACKTEST SUMMARY</span>
                <span className="text-purple-400">
                  {report?.summary.averageResilienceScore}/100 AVG
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total Decisions: {report?.summary.totalArtifacts}</span>
                <span className="text-emerald-400">
                  {report?.summary.survivedArtifacts} Survived
                </span>
                <span className="text-rose-400">
                  {report?.summary.invalidatedArtifacts} Invalidated (
                  {report?.summary.cascadedArtifacts} Cascaded)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 6. MODAL FOOTER */}
        <div className="px-5 py-2.5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span>Deterministic Scenario Replay Engine // Horizon C Complete</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-colors"
            >
              Close Time-Machine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
