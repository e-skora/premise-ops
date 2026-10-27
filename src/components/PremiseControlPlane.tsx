"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  AlertOctagon,
  ArrowLeft,
  FileCode2,
  Flame,
  Layers,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Wifi,
  Settings2,
  Check,
  FolderSearch,
  Terminal,
  Zap,
  History,
  GitBranch,
  Inbox,
  DollarSign,
  TrendingDown,
  Network,
  Command,
  Compass,
} from "lucide-react";
import {
  ArtifactStatus,
  ArtifactType,
  DecisionArtifactRecord,
  DispatchChannel,
  InvalidationEventRecord,
  LogicCombinator,
  Operator,
  OPERATOR_LABELS,
  OPERATOR_SYMBOLS,
  PremiseRecord,
  ProbeType,
} from "@/lib/types";
import {
  evaluatePremiseState,
  getSimulationRange,
} from "@/lib/evaluator";
import { CompilerTemplate } from "@/db/seed-data";
import { CompilerModal } from "./CompilerModal";
import { CodebaseScannerModal } from "./CodebaseScannerModal";
import { RepoScannerModal } from "./RepoScannerModal";
import { TimeMachineModal } from "./TimeMachineModal";
import { ChaosDrawer } from "./ChaosDrawer";
import { ConnectorSettingsModal } from "./ConnectorSettingsModal";
import { ExecutiveBalanceSheetModal } from "./ExecutiveBalanceSheetModal";
import { calculateFinOpsLedger, formatUsd } from "@/lib/finops-engine";

import { TeardownPane } from "./TeardownPane";
import { SparklineChart } from "./SparklineChart";
import { DependencyGraph } from "./DependencyGraph";
import { LocusInspectorPanel } from "./LocusInspectorPanel";
import { CommandPalette } from "./CommandPalette";
import { VisualTopologyGraph } from "./VisualTopologyGraph";
import { WalkthroughTour } from "./WalkthroughTour";
import PremiseSourceBadge, { premiseValueText } from "./PremiseSourceBadge";

interface PremiseControlPlaneProps {
  initialArtifacts: DecisionArtifactRecord[];
  initialInvalidationEvents: InvalidationEventRecord[];
  compilerTemplates: CompilerTemplate[];
  /** Public demo mode: shows the private-sandbox banner */
  publicDemo?: boolean;
  /** PREMISE_EXTRAS: FinOps, Time Machine, Topology Graph and PagerDuty */
  extras?: boolean;
}

interface InlineEditDraft {
  claim: string;
  operator: Operator;
  thresholdValue: string;
  decayWarningMargin: string;
  probeType: ProbeType;
  targetUrlOrQuery: string;
  jsonPath: string;
  valueMultiplier: string;
}

export function PremiseControlPlane({
  initialArtifacts,
  initialInvalidationEvents,
  compilerTemplates,
  publicDemo = false,
  extras = false,
}: PremiseControlPlaneProps) {
  const [artifacts, setArtifacts] =
    useState<DecisionArtifactRecord[]>(initialArtifacts);
  const [invalidationEvents, setInvalidationEvents] = useState<
    InvalidationEventRecord[]
  >(initialInvalidationEvents);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(
    initialArtifacts[0]?.id || ""
  );

  // Filters for Left Pane Registry
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ArtifactType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<ArtifactStatus | "ALL">(
    "ALL"
  );

  // Modals / Drawers / Loading states
  const [isCompilerOpen, setIsCompilerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isRepoScannerOpen, setIsRepoScannerOpen] = useState(false);
  const [repoScannerTab, setRepoScannerTab] = useState<
    "inbox" | "adr" | "manifests" | "inline" | "all"
  >("inbox");
  const [discoveredInboxCount, setDiscoveredInboxCount] = useState<number>(0);
  const [isChaosOpen, setIsChaosOpen] = useState(false);
  const [isTimeMachineOpen, setIsTimeMachineOpen] = useState(false);
  const [isConnectorSettingsOpen, setIsConnectorSettingsOpen] = useState(false);
  const [isExecutiveBalanceSheetOpen, setIsExecutiveBalanceSheetOpen] = useState(false);
  const [configuredConnectorsCount, setConfiguredConnectorsCount] = useState<number>(0);
  const [isRunningProbes, setIsRunningProbes] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [centerViewMode, setCenterViewMode] = useState<"assertions" | "topology">("assertions");
  const [isTourOpen, setIsTourOpen] = useState(false);

  // Check URL query parameter on mount (?tour=true) or localStorage to auto-open tour on first visit
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tourQuery = urlParams.get("tour");
      const tourCompleted = localStorage.getItem("premise_walkthrough_completed");
      if (tourQuery === "true" || (!tourCompleted && tourQuery !== "false")) {
        setIsTourOpen(true);
      }
    } catch {
      // LocalStorage or URL search params unavailable
    }
  }, []);

  // Global Keyboard Shortcuts (Cmd+K for Command Palette, Cmd+G for Topology view)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if (extras && (e.metaKey || e.ctrlKey) && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        setCenterViewMode((prev) => (prev === "topology" ? "assertions" : "topology"));
      }
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [extras]);

  // Track Discovered Premises count from GitHub Repo Scanner
  useEffect(() => {
    let isMounted = true;
    const fetchDiscoveredCount = async () => {
      try {
        const res = await fetch(
          "/api/scanner/scan?target=github.com/company/core-monorepo"
        );
        const data = await res.json();
        if (isMounted && data && typeof data.pendingInboxCount === "number") {
          setDiscoveredInboxCount(data.pendingInboxCount);
        }
      } catch {
        // Ignore background badge fetch errors
      }
    };
    fetchDiscoveredCount();
    return () => {
      isMounted = false;
    };
  }, [artifacts]);

  // Track Configured Production Connectors count (Prometheus, Datadog, Slack, PagerDuty)
  const refreshConnectorCount = async () => {
    try {
      const res = await fetch("/api/connectors");
      const data = await res.json();
      if (data && Array.isArray(data.connectors)) {
        const count = data.connectors.filter(
          (c: any) => c.isConfigured && (extras || c.connectorType !== "PAGERDUTY")
        ).length;
        setConfiguredConnectorsCount(count);
      }
    } catch {
      // Ignore background connector badge errors
    }
  };

  useEffect(() => {
    refreshConnectorCount();
  }, []);

  const [runningPremiseId, setRunningPremiseId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isAutoStreamActive, setIsAutoStreamActive] = useState(false);
  const [sseTickCount, setSseTickCount] = useState(0);
  const [copiedCliCmd, setCopiedCliCmd] = useState(false);

  // Inline Premise & Probe Config Editor state
  const [editingPremiseIds, setEditingPremiseIds] = useState<
    Record<string, boolean>
  >({});
  const [editDrafts, setEditDrafts] = useState<Record<string, InlineEditDraft>>(
    {}
  );
  const [savingPremiseId, setSavingPremiseId] = useState<string | null>(null);

  const [expandedProbeIds, setExpandedProbeIds] = useState<
    Record<string, boolean>
  >({
    "prem-adr-014-cost": true,
    "prem-adr-014-ttft": true,
  });
  const [sliderOverrides, setSliderOverrides] = useState<
    Record<string, string>
  >({});
  const [statusBannerMsg, setStatusBannerMsg] = useState<string | null>(null);

  // Track 3: Autonomous SSE Stream Subscription
  useEffect(() => {
    if (!isAutoStreamActive) return;

    const es = new EventSource("/api/stream");
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "probe_tick" && data.artifacts) {
          setArtifacts(data.artifacts);
          setInvalidationEvents(data.invalidationEvents || []);
          setSseTickCount(data.tick || 0);
        }
      } catch {
        // Ignore malformed SSE frame
      }
    };
    es.onerror = () => {
      es.close();
      setIsAutoStreamActive(false);
    };

    return () => {
      es.close();
    };
  }, [isAutoStreamActive]);

  // Compute Telemetry Bar Metrics
  const telemetryCounts = useMemo(() => {
    const allPremises = artifacts.flatMap((a) => a.premises);
    const totalDecisions = artifacts.length;
    const totalPremises = allPremises.length;
    const decayingCount = allPremises.filter(
      (p) => p.status === "DECAYING"
    ).length;
    const brokenCount = allPremises.filter((p) => p.status === "BROKEN").length;
    const invalidatedDecisions = artifacts.filter(
      (a) => a.status === "INVALIDATED"
    ).length;
    const cascadedCount = artifacts.filter((a) =>
      Boolean(a.cascadedFromId)
    ).length;
    return {
      totalDecisions,
      totalPremises,
      decayingCount,
      brokenCount,
      invalidatedDecisions,
      cascadedCount,
    };
  }, [artifacts]);

  // Horizon E: Architecture Balance Sheet & FinOps Ledger Calculations
  const finOpsLedger = useMemo(() => {
    return calculateFinOpsLedger(artifacts, invalidationEvents);
  }, [artifacts, invalidationEvents]);

  // Filtered Left Pane Artifacts
  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((art) => {
      if (typeFilter !== "ALL" && art.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && art.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = art.title.toLowerCase().includes(q);
        const matchLocus = art.targetLocus.toLowerCase().includes(q);
        const matchVar = art.premises.some(
          (p) =>
            p.variableName.toLowerCase().includes(q) ||
            p.claim.toLowerCase().includes(q)
        );
        return matchTitle || matchLocus || matchVar;
      }
      return true;
    });
  }, [artifacts, typeFilter, statusFilter, searchQuery]);

  const selectedArtifact = useMemo(() => {
    return (
      artifacts.find((a) => a.id === selectedArtifactId) ||
      filteredArtifacts[0] ||
      artifacts[0] ||
      null
    );
  }, [artifacts, selectedArtifactId, filteredArtifacts]);

  const showToast = (msg: string) => {
    setStatusBannerMsg(msg);
    setTimeout(() => {
      setStatusBannerMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Pipeline B: Run All Probes Now
  const handleRunAllProbes = async (premiseId?: string) => {
    if (premiseId) {
      setRunningPremiseId(premiseId);
    } else {
      setIsRunningProbes(true);
    }
    try {
      const res = await fetch("/api/probes/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(premiseId ? { premiseId } : {}),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        setArtifacts(data.artifacts);
        setInvalidationEvents(data.invalidationEvents || []);
        showToast(
          `Executed ${data.probesExecuted} live probe(s) across SQLite telemetry bus`
        );
      }
    } finally {
      setIsRunningProbes(false);
      setRunningPremiseId(null);
    }
  };

  // Pipeline B & C: Mutate Metric via /api/webhooks/metric
  const handleMutateMetric = async (params: {
    variableName: string;
    premiseId: string;
    value: number | string;
    source: string;
  }) => {
    const res = await fetch("/api/webhooks/metric", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variableName: params.variableName,
        premiseId: params.premiseId,
        value: params.value,
        source: params.source,
      }),
    });
    const data = await res.json();
    if (res.ok && data.artifacts) {
      setArtifacts(data.artifacts);
      setInvalidationEvents(data.invalidationEvents || []);
    }
  };

  // Track 2: Update Boolean Logic Combinator (ANY vs ALL)
  const handleChangeCombinator = async (
    artifactId: string,
    combinator: LogicCombinator
  ) => {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "setCombinator",
        artifactId,
        combinator,
      }),
    });
    const data = await res.json();
    if (res.ok && data.artifacts) {
      setArtifacts(data.artifacts);
      setInvalidationEvents(data.invalidationEvents || []);
      showToast(
        `Updated kill-switch boolean gate to ${combinator} (${
          combinator === "ANY" ? "OR Gate" : "AND Gate"
        })`
      );
    }
  };

  // Cross-Artifact Multi-Hop Cascade: Update Upstream Dependencies
  const handleUpdateDependencies = async (
    artifactId: string,
    dependsOnIds: string[]
  ) => {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "setDependencies",
        artifactId,
        dependsOnIds,
      }),
    });
    const data = await res.json();
    if (res.ok && data.artifacts) {
      setArtifacts(data.artifacts);
      setInvalidationEvents(data.invalidationEvents || []);
      showToast(
        `Updated multi-hop cascade graph (${dependsOnIds.length} upstream link${
          dependsOnIds.length === 1 ? "" : "s"
        })`
      );
    } else if (data.error) {
      showToast(`Error: ${data.error}`);
    }
  };

  // Horizon E: 1-Click "Retire & Promote" Workflow
  const handleRetireAndPromote = async (artifactId: string) => {
    try {
      const res = await fetch("/api/synthesizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retireAndPromote",
          artifactId,
          applyMultiFileTeardown: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        setArtifacts(data.artifacts);
        if (data.result?.promotedArtifact?.id) {
          setSelectedArtifactId(data.result.promotedArtifact.id);
        }
        showToast(
          `RETIRED & PROMOTED: ${
            data.result?.promotedArtifact?.title || "New ADR active"
          } (${formatUsd(data.result?.realizedAnnualSavingsUsd || 0)}/yr saved)`
        );
      } else if (data.error) {
        showToast(`Retire & Promote Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Retire & Promote failed: ${msg}`);
    }
  };

  // Inline Premise & Probe Configuration Editor: Open/Toggle & Save
  const handleToggleInlineEditor = (premise: PremiseRecord) => {
    const isCurrentlyOpen = Boolean(editingPremiseIds[premise.id]);
    if (!isCurrentlyOpen) {
      const probe = premise.probes[0];
      setEditDrafts((prev) => ({
        ...prev,
        [premise.id]: {
          claim: premise.claim,
          operator: premise.operator,
          thresholdValue: premise.thresholdValue,
          decayWarningMargin: String(premise.decayWarningMargin),
          probeType: probe?.probeType || "HTTP_JSON_PATH",
          targetUrlOrQuery: probe?.targetUrlOrQuery || "",
          jsonPath: probe?.jsonPath || "$.value",
          valueMultiplier: String(probe?.valueMultiplier ?? 1),
        },
      }));
    }
    setEditingPremiseIds((prev) => ({
      ...prev,
      [premise.id]: !isCurrentlyOpen,
    }));
  };

  const handleSavePremiseConfig = async (premiseId: string) => {
    const draft = editDrafts[premiseId];
    if (!draft) return;

    setSavingPremiseId(premiseId);
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updatePremiseConfig",
          premiseId,
          claim: draft.claim,
          operator: draft.operator,
          thresholdValue: draft.thresholdValue,
          decayWarningMargin: Number(draft.decayWarningMargin) || 0.1,
          probeType: draft.probeType,
          targetUrlOrQuery: draft.targetUrlOrQuery,
          jsonPath: draft.jsonPath,
          valueMultiplier: Number(draft.valueMultiplier) || 1,
        }),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        setArtifacts(data.artifacts);
        setInvalidationEvents(data.invalidationEvents || []);
        setEditingPremiseIds((prev) => ({ ...prev, [premiseId]: false }));
        showToast(
          `Saved premise bound (${OPERATOR_SYMBOLS[draft.operator]} ${
            draft.thresholdValue
          }) & re-evaluated cascades`
        );
      } else if (data.error) {
        showToast(`Failed to update premise: ${data.error}`);
      }
    } finally {
      setSavingPremiseId(null);
    }
  };

  // Track 4: Outbound Dispatch (GitHub PR / Slack / PagerDuty)
  const handleDispatchAlert = async (
    eventId: string,
    channel: DispatchChannel,
    options?: {
      repo?: string;
      branchName?: string;
      baseBranch?: string;
      githubToken?: string;
      dryRun?: boolean;
    }
  ) => {
    const res = await fetch("/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, channel, ...options }),
    });
    const data = await res.json();
    if (res.ok) {
      setArtifacts(data.artifacts);
      setInvalidationEvents(data.invalidationEvents);
      showToast(data.dispatchLog?.summary || `Dispatched ${channel}`);
    } else if (data.error) {
      showToast(`Dispatch error: ${data.error}`);
    }
    return data;
  };

  // Reset database to seed state
  const handleResetSeed = async () => {
    setIsResetting(true);
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (res.ok && data.artifacts) {
        setArtifacts(data.artifacts);
        setInvalidationEvents(data.invalidationEvents || []);
        setSliderOverrides({});
        setEditingPremiseIds({});
        showToast("Reset database to initial 4-artifact seed state");
      }
    } finally {
      setIsResetting(false);
    }
  };

  // Acknowledge Invalidation Event
  const handleAcknowledgeEvent = async (eventId: string) => {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", eventId }),
    });
    const data = await res.json();
    if (res.ok) {
      setArtifacts(data.artifacts);
      setInvalidationEvents(data.invalidationEvents);
    }
  };

  // Simulate Breach for currently selected artifact (1-click test)
  const handleSimulateBreachForSelected = async () => {
    if (!selectedArtifact || selectedArtifact.premises.length === 0) return;
    const targetPremise =
      selectedArtifact.premises.find((p) => p.status !== "BROKEN") ||
      selectedArtifact.premises[0];
    const threshold = Number(targetPremise.thresholdValue);
    let breakingVal = threshold;

    if (targetPremise.operator === "GT" || targetPremise.operator === "GTE") {
      breakingVal = Number((threshold * 0.62).toFixed(2));
    } else if (
      targetPremise.operator === "LT" ||
      targetPremise.operator === "LTE"
    ) {
      if (targetPremise.unit === "%" && threshold >= 95) {
        breakingVal = 99.96;
      } else {
        breakingVal = Number((threshold * 1.22).toFixed(2));
      }
    } else {
      breakingVal = threshold + 10;
    }

    setSliderOverrides((prev) => ({
      ...prev,
      [targetPremise.id]: String(breakingVal),
    }));

    await handleMutateMetric({
      variableName: targetPremise.variableName,
      premiseId: targetPremise.id,
      value: breakingVal,
      source: "chaos-killswitch-simulation",
    });

    showToast(
      `BREACH TRIGGERED: ${targetPremise.variableName} mutated to ${breakingVal} ${targetPremise.unit}`
    );
  };

  // Inline Document Highlighter: highlights extracted premise claims inside rawContent
  const renderHighlightedDocument = (artifact: DecisionArtifactRecord) => {
    const lines = artifact.rawContent.split(/\r?\n/);

    return lines.map((line, lineIdx) => {
      const matchedPremise = artifact.premises.find((p) =>
        line.toLowerCase().includes(p.claim.toLowerCase())
      );

      if (matchedPremise) {
        const lowerLine = line.toLowerCase();
        const lowerClaim = matchedPremise.claim.toLowerCase();
        const startIdx = lowerLine.indexOf(lowerClaim);
        const before = line.slice(0, startIdx);
        const matchedText = line.slice(
          startIdx,
          startIdx + matchedPremise.claim.length
        );
        const after = line.slice(startIdx + matchedPremise.claim.length);

        const badgeStyles =
          matchedPremise.status === "BROKEN"
            ? "bg-rose-500/20 border-rose-500/60 text-rose-200"
            : matchedPremise.status === "DECAYING"
            ? "bg-amber-500/20 border-amber-500/60 text-amber-200"
            : "bg-emerald-500/15 border-emerald-500/50 text-emerald-200";

        return (
          <div
            key={lineIdx}
            className="py-1 px-2 -mx-2 my-0.5 bg-zinc-900/90 border-l-2 border-emerald-500 font-mono text-xs text-zinc-300 leading-relaxed"
          >
            <span>{before}</span>
            <mark
              className={`px-1.5 py-0.5 border font-semibold ${badgeStyles}`}
            >
              {matchedText}
            </mark>
            <span>{after}</span>
            <span
              className={`ml-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 border font-mono ${badgeStyles}`}
            >
              [{matchedPremise.status}: {premiseValueText(matchedPremise)}{" "}
              {OPERATOR_SYMBOLS[matchedPremise.operator]}{" "}
              {matchedPremise.thresholdValue} {matchedPremise.unit}]
            </span>
          </div>
        );
      }

      if (line.startsWith("# ")) {
        return (
          <h3
            key={lineIdx}
            className="text-sm font-bold text-zinc-100 font-mono mt-2 mb-1"
          >
            {line.replace(/^#\s+/, "")}
          </h3>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h4
            key={lineIdx}
            className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono mt-3 mb-1 border-b border-zinc-800/80 pb-0.5"
          >
            {line.replace(/^##\s+/, "")}
          </h4>
        );
      }
      if (!line.trim()) {
        return <div key={lineIdx} className="h-2" />;
      }

      return (
        <div
          key={lineIdx}
          className="text-xs font-mono text-zinc-400 leading-relaxed"
        >
          {line}
        </div>
      );
    });
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-100 select-none">
      {publicDemo && (
        <div
          role="status"
          className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-[11px] font-mono text-amber-300"
        >
          Public demo. Your changes are private to you and reset after 24 hours.
        </div>
      )}
      {/* 1. TOP TELEMETRY BAR */}
      <header className="border-b border-zinc-800 bg-zinc-950 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-40">
        {/* Left: Brand & System Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-zinc-900 border border-zinc-700 flex items-center justify-center">
              <Radio className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold tracking-tight text-zinc-100">
                  PREMISE
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-400">
                  v3.0 // CI/CD FOR DECISIONS
                </span>
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[10px] font-mono text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors ml-1"
                  title="Return to Product Landing Page"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Home</span>
                </Link>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  SQLITE WAL + PROMQL + LIVE PATCHER
                </span>
                <span>•</span>
                <span>
                  {isAutoStreamActive
                    ? `SSE STREAM TICK #${sseTickCount}`
                    : "MULTI-HOP CASCADE ENGINE"}
                </span>
              </div>
            </div>
          </div>

          {/* High-Density Telemetry Readouts */}
          <div className="hidden xl:flex items-center border border-zinc-800 bg-zinc-900/50 divide-x divide-zinc-800 ml-3">
            <div className="px-3 py-1 flex items-center gap-2.5">
              <div>
                <div className="text-[9px] font-mono uppercase text-zinc-500">
                  Active Decisions
                </div>
                <div className="text-xs font-mono font-bold tabular-nums text-zinc-100">
                  {telemetryCounts.totalDecisions}
                </div>
              </div>
            </div>

            <div className="px-3 py-1 flex items-center gap-2.5">
              <div>
                <div className="text-[9px] font-mono uppercase text-zinc-500">
                  Load-Bearing Premises
                </div>
                <div className="text-xs font-mono font-bold tabular-nums text-sky-400">
                  {telemetryCounts.totalPremises}{" "}
                  <span className="text-[10px] font-normal text-zinc-500">
                    MONITORED
                  </span>
                </div>
              </div>
            </div>

            <div className="px-3 py-1 flex items-center gap-2.5">
              <div>
                <div className="text-[9px] font-mono uppercase text-amber-400/90">
                  Decaying (Warning)
                </div>
                <div className="text-xs font-mono font-bold tabular-nums text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{telemetryCounts.decayingCount}</span>
                </div>
              </div>
            </div>

            <div
              className={`px-3 py-1 flex items-center gap-2.5 ${
                telemetryCounts.brokenCount > 0 ? "bg-rose-950/40" : ""
              }`}
            >
              <div>
                <div className="text-[9px] font-mono uppercase text-rose-400">
                  Broken / Cascaded
                </div>
                <div className="text-xs font-mono font-bold tabular-nums text-rose-400 flex items-center gap-1">
                  <AlertOctagon
                    className={`w-3 h-3 ${
                      telemetryCounts.brokenCount > 0 ? "animate-bounce" : ""
                    }`}
                  />
                  <span>
                    {telemetryCounts.brokenCount} ({telemetryCounts.cascadedCount}{" "}
                    Cascade)
                  </span>
                </div>
              </div>
            </div>

            {/* Discovered Premises Inbox Counter */}
            <button
              type="button"
              onClick={() => {
                setRepoScannerTab("inbox");
                setIsRepoScannerOpen(true);
              }}
              className={`px-3 py-1 flex items-center gap-2.5 transition-colors text-left ${
                discoveredInboxCount > 0
                  ? "bg-sky-950/40 hover:bg-sky-900/50"
                  : "hover:bg-zinc-800/40"
              }`}
              title="Discovered Premises Inbox (ADRs & Heavy Dependencies)"
            >
              <div>
                <div className="text-[9px] font-mono uppercase text-sky-400 flex items-center gap-1">
                  <Inbox className="w-3 h-3" />
                  <span>Discovered Inbox</span>
                </div>
                <div className="text-xs font-mono font-bold tabular-nums text-sky-300 flex items-center gap-1.5">
                  <span>{discoveredInboxCount} New</span>
                  {discoveredInboxCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                  )}
                </div>
              </div>
            </button>

            {/* Horizon E: Architecture Balance Sheet Inefficiency Ticker */}
            {extras && (
              <button
                data-tour="top-telemetry-controls"
                type="button"
                onClick={() => setIsExecutiveBalanceSheetOpen(true)}
                className="px-3 py-1 flex items-center gap-3 bg-zinc-900/60 hover:bg-zinc-800/80 border-l border-zinc-800 transition-colors text-left"
                title="Open Architecture Balance Sheet & FinOps Inefficiency Drag"
              >
                <div>
                  <div className="text-[9px] font-mono uppercase text-amber-400 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    <span>FinOps Drag</span>
                  </div>
                  <div className="text-xs font-mono font-bold tabular-nums text-amber-300 flex items-center gap-1.5">
                    <span>{formatUsd(finOpsLedger.totalActiveDragMonthlyUsd)}/mo</span>
                    <span className="text-[10px] text-zinc-500 font-normal hidden lg:inline">
                      ({formatUsd(finOpsLedger.totalActiveDragDailyUsd)}/d)
                    </span>
                  </div>
                </div>
                <div className="border-l border-zinc-800 pl-2.5">
                  <div className="text-[9px] font-mono uppercase text-emerald-400 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    <span>Waste Eliminated</span>
                  </div>
                  <div className="text-xs font-mono font-bold tabular-nums text-emerald-300">
                    {formatUsd(finOpsLedger.cumulativeAnnualSavingsUsd)}/yr
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Right: Global Control Actions */}
        <div className="flex items-center gap-2">
          {statusBannerMsg && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-emerald-500/40 text-[11px] font-mono text-emerald-300">
              <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate max-w-[230px]">{statusBannerMsg}</span>
            </div>
          )}

          {/* Glowing Guided Walkthrough Tour Button */}
          <button
            type="button"
            onClick={() => setIsTourOpen(true)}
            className="flex px-2.5 py-1.5 text-xs font-mono font-semibold bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/60 hover:border-cyan-400 items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:shadow-[0_0_22px_rgba(6,182,212,0.45)] active:scale-95"
            title="Start 60-second interactive guided walkthrough tour of Premise"
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>Guided Tour</span>
            <span className="px-1.5 py-0.2 text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold rounded-sm uppercase tracking-wider">
              60s Tour
            </span>
          </button>

          {/* Quick Search & Command Palette (Cmd+K) Trigger */}
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="flex px-2.5 py-1.5 text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 items-center gap-2 transition-colors shadow-sm"
            title="Open Command Palette & Quick Navigation (Cmd+K)"
          >
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline text-zinc-300">Commands...</span>
            <kbd className="px-1.5 py-0.2 text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-sm">
              ⌘K
            </kbd>
          </button>

          {/* Toggle Visual Topology Graph Button */}
          {extras && (
            <button
              type="button"
              onClick={() =>
                setCenterViewMode((prev) => (prev === "topology" ? "assertions" : "topology"))
              }
              className={`px-2.5 py-1.5 text-xs font-mono border flex items-center gap-1.5 transition-colors shadow-sm ${
                centerViewMode === "topology"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-semibold"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700"
              }`}
              title="Toggle Visual Topology Graph (Cmd+G)"
            >
              <Network
                className={`w-3.5 h-3.5 ${
                  centerViewMode === "topology" ? "text-emerald-400" : "text-zinc-400"
                }`}
              />
              <span className="hidden sm:inline">Topology</span>
              <kbd className="hidden md:inline px-1 py-0.2 text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-sm">
                ⌘G
              </kbd>
            </button>
          )}

          {/* Executable CI/CD CLI Runner Quick-Copy Button */}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText("bun ./bin/premise-cli.ts check");
              setCopiedCliCmd(true);
              showToast("Copied CI/CD CLI command: bun ./bin/premise-cli.ts check");
              setTimeout(() => setCopiedCliCmd(false), 2200);
            }}
            className="hidden lg:flex px-2.5 py-1.5 text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 items-center gap-1.5 transition-colors"
            title="Copy standalone CI/CD CLI runner command (bin/premise-cli.ts)"
          >
            {copiedCliCmd ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{copiedCliCmd ? "CLI Copied!" : "CLI: premise check"}</span>
          </button>

          {/* Track 3: Autonomous SSE Probe Daemon Toggle */}
          <button
            type="button"
            onClick={() => setIsAutoStreamActive((prev) => !prev)}
            className={`px-2.5 py-1.5 text-xs font-mono border flex items-center gap-1.5 transition-colors ${
              isAutoStreamActive
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-semibold"
                : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700"
            }`}
            title="Stream autonomous background probe ticks via Server-Sent Events (/api/stream)"
          >
            <Wifi
              className={`w-3.5 h-3.5 ${
                isAutoStreamActive
                  ? "text-emerald-400 animate-pulse"
                  : "text-zinc-400"
              }`}
            />
            <span>{isAutoStreamActive ? "SSE Live: ON" : "Auto-Poll SSE"}</span>
          </button>

          {/* Connect Repository & ADR Auto-Extractor Button */}
          <button
            type="button"
            onClick={() => {
              setRepoScannerTab("inbox");
              setIsRepoScannerOpen(true);
            }}
            className="px-3 py-1.5 text-xs font-mono font-medium bg-zinc-900 hover:bg-zinc-800 text-sky-200 border border-sky-500/50 flex items-center gap-1.5 transition-colors shadow-sm"
            title="Connect repository to automatically scan ADRs and heavy dependency manifests"
          >
            <GitBranch className="w-3.5 h-3.5 text-sky-400" />
            <span>Connect Repo</span>
            {discoveredInboxCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold rounded-sm">
                {discoveredInboxCount}
              </span>
            )}
          </button>

          {/* Horizon D: Production Telemetry & Outbound Dispatch Connectors Button */}
          <button
            type="button"
            onClick={() => setIsConnectorSettingsOpen(true)}
            className="px-3 py-1.5 text-xs font-mono font-medium bg-zinc-900 hover:bg-zinc-800 text-cyan-200 border border-cyan-500/50 flex items-center gap-1.5 transition-colors shadow-sm"
            title="Configure Production Telemetry Connectors & Live Outbound Dispatch (Prometheus, Datadog, Slack, PagerDuty)"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Connectors</span>
            {configuredConnectorsCount > 0 ? (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold rounded-sm">
                {configuredConnectorsCount}/{extras ? 4 : 3}
              </span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            )}
          </button>

          {/* Horizon E: Executive Architecture Balance Sheet Button */}
          {extras && (
            <button
              type="button"
              onClick={() => setIsExecutiveBalanceSheetOpen(true)}
              className="px-3 py-1.5 text-xs font-mono font-medium bg-zinc-900 hover:bg-zinc-800 text-amber-200 border border-amber-500/50 flex items-center gap-1.5 transition-colors shadow-sm"
              title="Open Executive Architecture Balance Sheet & Inefficiency Drag Ledger (Horizon E)"
            >
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              <span>Balance Sheet</span>
              {finOpsLedger.invalidatedDecisionsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold rounded-sm">
                  {finOpsLedger.invalidatedDecisionsCount} Breached
                </span>
              )}
            </button>
          )}

          {/* Codebase Assumption Scanner Button */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="px-3 py-1.5 text-xs font-mono font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-sky-500/40 flex items-center gap-1.5 transition-colors"
            title="Scan local repository files for inline @premise annotations"
          >
            <FolderSearch className="w-3.5 h-3.5 text-sky-400" />
            <span>Scan Codebase</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCompilerOpen(true)}
            className="px-3 py-1.5 text-xs font-mono font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700 flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Compile Decision</span>
          </button>

          <button
            type="button"
            onClick={() => handleRunAllProbes()}
            disabled={isRunningProbes}
            className="px-3 py-1.5 text-xs font-mono font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-sky-400 ${
                isRunningProbes ? "animate-spin" : ""
              }`}
            />
            <span>Run All Probes Now</span>
          </button>

          {extras && (
            <button
              data-tour="top-telemetry-controls"
              type="button"
              onClick={() => setIsTimeMachineOpen(true)}
              className="px-3 py-1.5 text-xs font-mono font-semibold bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/50 flex items-center gap-1.5 transition-colors shadow-sm"
              title="Historical Drift Backtesting & Scenario Replay Engine (Horizon C)"
            >
              <History className="w-3.5 h-3.5 text-purple-400" />
              <span>Time-Machine Backtest</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsChaosOpen((prev) => !prev)}
            className={`px-3 py-1.5 text-xs font-mono font-semibold border flex items-center gap-1.5 transition-colors ${
              isChaosOpen
                ? "bg-amber-500 text-zinc-950 border-amber-400"
                : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Chaos / Drift Simulator</span>
          </button>

        </div>
      </header>

      {/* Collapsible Pipeline C: Chaos / Reality Drift Simulator Drawer */}
      <ChaosDrawer
        isOpen={isChaosOpen}
        onClose={() => setIsChaosOpen(false)}
        artifacts={artifacts}
        selectedArtifactId={selectedArtifact?.id || ""}
        onSelectArtifact={setSelectedArtifactId}
        onMutateMetric={handleMutateMetric}
        onResetSeed={handleResetSeed}
        isResetting={isResetting}
      />

      {/* 2. MAIN SPLIT-PANE WORKSPACE */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden min-h-0">
        {/* LEFT PANE: Decision Artifact Registry (3 cols) */}
        <section
          data-tour="decision-registry"
          className="col-span-12 md:col-span-3 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden min-h-0"
        >
          <div className="p-3 border-b border-zinc-800 space-y-2.5 bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-zinc-400" />
                <span>Decision Artifact Registry</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {filteredArtifacts.length} / {artifacts.length}
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter locus, ADR, metric..."
                className="w-full pl-8 pr-2.5 py-1 text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              {(
                [
                  "ALL",
                  "ADR",
                  "GITHUB_PR",
                  "STRATEGY_MEMO",
                  "VENDOR_CONTRACT",
                ] as const
              ).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono border transition-colors ${
                    typeFilter === t
                      ? "bg-zinc-200 text-zinc-950 border-zinc-200 font-semibold"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {t === "GITHUB_PR"
                    ? "PR"
                    : t === "STRATEGY_MEMO"
                    ? "MEMO"
                    : t === "VENDOR_CONTRACT"
                    ? "VENDOR"
                    : t}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-1 pt-0.5">
              {(["ALL", "HEALTHY", "AT_RISK", "INVALIDATED"] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`py-0.5 text-[9px] font-mono border text-center transition-colors ${
                      statusFilter === st
                        ? "bg-zinc-800 text-zinc-100 border-zinc-600 font-semibold"
                        : "bg-zinc-950 text-zinc-500 border-zinc-800/80 hover:text-zinc-300"
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Artifact List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80">
            {filteredArtifacts.map((art) => {
              const isSelected = selectedArtifact?.id === art.id;
              const statusBadge =
                art.status === "INVALIDATED"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                  : art.status === "AT_RISK"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";

              const downstreamCount = art.downstreamDependentIds?.length || 0;

              return (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => setSelectedArtifactId(art.id)}
                  className={`w-full text-left p-3.5 transition-colors relative block ${
                    isSelected
                      ? "bg-zinc-900/90 border-l-2 border-l-emerald-400"
                      : "hover:bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800/90 text-zinc-300 border border-zinc-700/80">
                        {art.type}
                      </span>
                      <span className="text-[9px] font-mono px-1 py-0.5 bg-zinc-900 text-zinc-500 border border-zinc-800">
                        {art.logicCombinator || "ANY"}
                      </span>
                      {art.cascadedFromId && (
                        <span className="text-[9px] font-mono px-1 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" />
                          <span>CASCADE</span>
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 border font-semibold flex items-center gap-1 ${statusBadge}`}
                    >
                      {art.status === "INVALIDATED" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                      )}
                      {art.status}
                    </span>
                  </div>

                  <h3 className="text-xs font-semibold text-zinc-100 leading-snug mb-1.5">
                    {art.title}
                  </h3>

                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 mb-2 truncate">
                    <FileCode2 className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="truncate">
                      {art.targetLocus || "No code location set"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span>
                        {art.premises.length} Premise
                        {art.premises.length === 1 ? "" : "s"}
                      </span>
                      {downstreamCount > 0 && (
                        <span className="text-sky-400">
                          • {downstreamCount} Downstream
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {art.premises.map((p) => (
                        <span
                          key={p.id}
                          title={`${p.variableName}: ${p.status}`}
                          className={`w-2.5 h-2.5 border ${
                            p.status === "BROKEN"
                              ? "bg-rose-500 border-rose-300"
                              : p.status === "DECAYING"
                              ? "bg-amber-400 border-amber-200"
                              : "bg-emerald-500 border-emerald-300"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-2.5 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500">
              DB: ./premise.db
            </span>
            <button
              type="button"
              onClick={handleResetSeed}
              disabled={isResetting}
              className="text-[10px] font-mono text-zinc-400 hover:text-zinc-200 underline"
            >
              {isResetting ? "Resetting..." : "Reset Seed Data"}
            </button>
          </div>
        </section>

        {/* CENTER PANE: The Dependency & Assertion Graph (5 cols) */}
        <main className="col-span-12 md:col-span-5 bg-zinc-950 flex flex-col overflow-hidden min-h-0">
          {/* Sub-header view switcher (topology is an extra) */}
          {extras && (
            <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-3.5 py-1.5 flex items-center justify-between text-xs font-mono z-10">
              <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setCenterViewMode("assertions")}
                  className={`px-2.5 py-1 text-[11px] flex items-center gap-1.5 transition-colors ${
                    centerViewMode === "assertions"
                      ? "bg-zinc-800 text-zinc-100 font-bold border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span>Assertion Inspector</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCenterViewMode("topology")}
                  className={`px-2.5 py-1 text-[11px] flex items-center gap-1.5 transition-colors ${
                    centerViewMode === "topology"
                      ? "bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/50"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Network className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Visual Topology Graph</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 hidden sm:inline">
                Press <kbd className="px-1 py-0.2 bg-zinc-900 border border-zinc-800 text-zinc-400">⌘G</kbd> to toggle
              </span>
            </div>
          )}

          {extras && centerViewMode === "topology" ? (
            <div className="flex-1 overflow-hidden">
              <VisualTopologyGraph
                artifacts={artifacts}
                selectedArtifactId={selectedArtifact?.id || ""}
                onSelectArtifact={setSelectedArtifactId}
                onOpenLocusInspector={() => {
                  setCenterViewMode("assertions");
                  setTimeout(() => {
                    document.getElementById("locus-inspector-section")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
                onChangeCombinator={handleChangeCombinator}
                onInspectArtifactDetails={(id) => {
                  setSelectedArtifactId(id);
                  setCenterViewMode("assertions");
                }}
              />
            </div>
          ) : !selectedArtifact ? (
            <div className="flex-1 flex items-center justify-center text-xs font-mono text-zinc-500">
              Select a Decision Artifact from the registry
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-5 select-text">
              {/* Artifact Header & Blast Radius Banner */}
              <div className="border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {selectedArtifact.type}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                      <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
                      <code>{selectedArtifact.targetLocus || "No code location set"}</code>
                    </span>
                  </div>

                  <span
                    className={`text-xs font-mono px-2.5 py-0.5 border font-bold ${
                      selectedArtifact.status === "INVALIDATED"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                        : selectedArtifact.status === "AT_RISK"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                    }`}
                  >
                    ARTIFACT STATUS // {selectedArtifact.status}
                  </span>
                </div>

                <h1 className="text-base font-bold text-zinc-100 tracking-tight">
                  {selectedArtifact.title}
                </h1>

                {/* Obsolete Infrastructure Blast Radius Box */}
                <div
                  data-tour="cascade-blast-radius"
                  className={`p-3 border ${
                    selectedArtifact.status === "INVALIDATED"
                      ? "bg-rose-950/30 border-rose-500/50"
                      : "bg-zinc-950 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase mb-1">
                    <span
                      className={
                        selectedArtifact.status === "INVALIDATED"
                          ? "text-rose-400 font-bold"
                          : "text-amber-400"
                      }
                    >
                      {selectedArtifact.status === "INVALIDATED"
                        ? "OBSOLETE BLAST RADIUS — READY FOR IMMEDIATE TEARDOWN"
                        : "LOAD-BEARING BLAST RADIUS (IF INVALIDATED)"}
                    </span>
                    <span className="text-zinc-500">
                      Evaluated:{" "}
                      {new Date(
                        selectedArtifact.lastEvaluatedAt
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed">
                    {selectedArtifact.blastRadius}
                  </p>
                </div>
              </div>

              {/* Track 2 & Multi-Hop Cascade Graph */}
              <DependencyGraph
                artifact={selectedArtifact}
                allArtifacts={artifacts}
                onSelectArtifact={setSelectedArtifactId}
                onChangeCombinator={handleChangeCombinator}
                onUpdateDependencies={handleUpdateDependencies}
              />

              {/* COMPILED PREMISE ASSERTION CARDS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
                      Compiled Load-Bearing Premises (
                      {selectedArtifact.premises.length})
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Inline Bound Editor + TTI Forecast + Drift Sliders
                  </span>
                </div>

                {selectedArtifact.premises.map((premise, idx) => {
                  const evalState = evaluatePremiseState(
                    premise.currentValue,
                    premise.operator,
                    premise.thresholdValue,
                    premise.decayWarningMargin
                  );
                  const simRange = getSimulationRange(premise);
                  const sliderVal =
                    sliderOverrides[premise.id] ?? premise.currentValue;
                  const probe = premise.probes[0];
                  const isProbeExpanded = Boolean(expandedProbeIds[premise.id]);
                  const isEditingConfig = Boolean(
                    editingPremiseIds[premise.id]
                  );
                  const draft = editDrafts[premise.id];

                  const cardBorder =
                    premise.status === "BROKEN"
                      ? "border-rose-500/70 bg-rose-950/15"
                      : premise.status === "DECAYING"
                      ? "border-amber-500/60 bg-amber-950/10"
                      : "border-zinc-800 bg-zinc-900/30";

                  const badgeStyle =
                    premise.status === "UNBOUND"
                      ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                      : premise.status === "BROKEN"
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                      : premise.status === "DECAYING"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";

                  const barColor =
                    premise.status === "UNBOUND"
                      ? "bg-zinc-600"
                      : premise.status === "BROKEN"
                      ? "bg-rose-500"
                      : premise.status === "DECAYING"
                      ? "bg-amber-400"
                      : "bg-emerald-500";

                  return (
                    <div
                      key={premise.id}
                      data-tour="telemetry-probe"
                      className={`border transition-all p-4 space-y-3.5 ${cardBorder}`}
                    >
                      {/* Premise Card Top Row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-400">
                              PREMISE #{idx + 1}
                            </span>
                            <code className="text-xs font-mono text-sky-400 font-semibold">
                              {premise.variableName}
                            </code>
                          </div>
                          <p className="text-xs font-medium text-zinc-100">
                            &ldquo;{premise.claim}&rdquo;
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleInlineEditor(premise)}
                            className={`px-2 py-0.5 text-[10px] font-mono border flex items-center gap-1 transition-colors ${
                              isEditingConfig
                                ? "bg-sky-500/20 text-sky-300 border-sky-500/50 font-semibold"
                                : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700"
                            }`}
                            title="Inline edit operator, thresholdValue, decayWarningMargin, and probe targetUrlOrQuery"
                          >
                            <Settings2 className="w-3 h-3" />
                            <span>
                              {isEditingConfig ? "Close Editor" : "Edit Bound"}
                            </span>
                          </button>

                          <span
                            className={`text-[11px] font-mono px-2 py-0.5 border font-bold ${badgeStyle}`}
                          >
                            {premise.status}
                          </span>
                        </div>
                      </div>

                      {/* INLINE PREMISE & PROBE CONFIGURATION EDITOR */}
                      {isEditingConfig && draft && (
                        <div className="p-3 bg-zinc-950 border border-sky-500/50 space-y-3 font-mono text-xs">
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                            <span className="text-[10px] uppercase tracking-wider text-sky-400 font-bold">
                              Inline Premise &amp; Probe Configuration Editor
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              Saves to SQLite &amp; Re-Evaluates Live
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                            {/* Operator */}
                            <div className="sm:col-span-4 space-y-1">
                              <label className="text-[9px] uppercase text-zinc-400 block">
                                Operator
                              </label>
                              <select
                                value={draft.operator}
                                onChange={(e) =>
                                  setEditDrafts((prev) => ({
                                    ...prev,
                                    [premise.id]: {
                                      ...draft,
                                      operator: e.target.value as Operator,
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-sky-400"
                              >
                                {(
                                  [
                                    "GT",
                                    "GTE",
                                    "LT",
                                    "LTE",
                                    "EQ",
                                    "NEQ",
                                  ] as const
                                ).map((op) => (
                                  <option key={op} value={op}>
                                    {OPERATOR_LABELS[op]}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Threshold Value */}
                            <div className="sm:col-span-4 space-y-1">
                              <label className="text-[9px] uppercase text-zinc-400 block">
                                Threshold ({premise.unit || "value"})
                              </label>
                              <input
                                type="text"
                                value={draft.thresholdValue}
                                onChange={(e) =>
                                  setEditDrafts((prev) => ({
                                    ...prev,
                                    [premise.id]: {
                                      ...draft,
                                      thresholdValue: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-sky-400"
                              />
                            </div>

                            {/* Decay Warning Margin */}
                            <div className="sm:col-span-4 space-y-1">
                              <label className="text-[9px] uppercase text-zinc-400 block">
                                Warning Margin (0.001–0.5)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0.001"
                                max="0.5"
                                value={draft.decayWarningMargin}
                                onChange={(e) =>
                                  setEditDrafts((prev) => ({
                                    ...prev,
                                    [premise.id]: {
                                      ...draft,
                                      decayWarningMargin: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-sky-400"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                            {/* Probe Type */}
                            <div className="sm:col-span-4 space-y-1">
                              <label className="text-[9px] uppercase text-zinc-400 block">
                                Probe Type
                              </label>
                              <select
                                value={draft.probeType}
                                onChange={(e) =>
                                  setEditDrafts((prev) => ({
                                    ...prev,
                                    [premise.id]: {
                                      ...draft,
                                      probeType: e.target.value as ProbeType,
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-sky-400"
                              >
                                {(
                                  [
                                    "HTTP_JSON_PATH",
                                    "PROMQL",
                                    "SQL_METRIC",
                                    "WEBHOOK_INGEST",
                                    "WEB_SCRAPE_EXTRACT",
                                  ] as const
                                ).map((pt) => (
                                  <option key={pt} value={pt}>
                                    {pt}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Target URL or Query */}
                            <div className="sm:col-span-8 space-y-1">
                              <label className="text-[9px] uppercase text-zinc-400 block">
                                Probe Target URL / PromQL / SQL Query
                              </label>
                              <input
                                type="text"
                                value={draft.targetUrlOrQuery}
                                onChange={(e) =>
                                  setEditDrafts((prev) => ({
                                    ...prev,
                                    [premise.id]: {
                                      ...draft,
                                      targetUrlOrQuery: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Empty = suggested, not connected"
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-sky-400"
                              />
                            </div>

                            {/* JSON path and multiplier for HTTP JSON sources */}
                            <div className="sm:col-span-8 space-y-1">
                              <label className="text-[9px] uppercase text-zinc-400 block">
                                JSONPath (supports [?(@.id=="x")] filters)
                              </label>
                              <input
                                type="text"
                                value={draft.jsonPath}
                                onChange={(e) =>
                                  setEditDrafts((prev) => ({
                                    ...prev,
                                    [premise.id]: { ...draft, jsonPath: e.target.value },
                                  }))
                                }
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-sky-400"
                              />
                            </div>
                            <div className="sm:col-span-4 space-y-1">
                              <label className="text-[9px] uppercase text-zinc-400 block">
                                Value multiplier
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={draft.valueMultiplier}
                                onChange={(e) =>
                                  setEditDrafts((prev) => ({
                                    ...prev,
                                    [premise.id]: { ...draft, valueMultiplier: e.target.value },
                                  }))
                                }
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-sky-400"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingPremiseIds((prev) => ({
                                  ...prev,
                                  [premise.id]: false,
                                }))
                              }
                              className="px-2.5 py-1 text-[10px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={savingPremiseId === premise.id}
                              onClick={() =>
                                handleSavePremiseConfig(premise.id)
                              }
                              className="px-3 py-1 text-[10px] font-bold bg-sky-500 hover:bg-sky-400 text-zinc-950 flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>
                                {savingPremiseId === premise.id
                                  ? "Saving..."
                                  : "Save Bound & Re-Evaluate"}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* LIVE FORMULA READOUT BOX */}
                      <div className="p-3 bg-zinc-950 border border-zinc-800 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center font-mono">
                        <div className="sm:col-span-5">
                          <div className="text-[9px] uppercase text-zinc-500">
                            CURRENT VALUE
                          </div>
                          <div
                            className={`text-sm font-bold tabular-nums ${
                              premise.status === "BROKEN"
                                ? "text-rose-400"
                                : premise.status === "DECAYING"
                                ? "text-amber-300"
                                : "text-emerald-400"
                            }`}
                          >
                            {premise.currentValue.trim() ? (
                              <>
                                {premise.currentValue}{" "}
                                <span className="text-xs font-normal text-zinc-400">
                                  {premise.unit}
                                </span>
                              </>
                            ) : (
                              <span className="text-zinc-500">No value yet</span>
                            )}
                          </div>
                        </div>

                        <div className="sm:col-span-2 text-center">
                          <span className="text-[10px] px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-400">
                            vs
                          </span>
                        </div>

                        <div className="sm:col-span-5 sm:text-right">
                          <div className="text-[9px] uppercase text-zinc-500">
                            REQUIRED ASSERTION
                          </div>
                          <div className="text-sm font-bold tabular-nums text-zinc-100">
                            {OPERATOR_SYMBOLS[premise.operator]}{" "}
                            {premise.thresholdValue}{" "}
                            <span className="text-xs font-normal text-zinc-400">
                              {premise.unit}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Where the value came from: Live, Reported, Demo data or No value yet */}
                      <PremiseSourceBadge premise={premise} />

                      {/* Track 1: Historical Telemetry Sparkline & Time-to-Invalidation Forecast */}
                      <SparklineChart premise={premise} />

                      {/* VISUAL DRIFT / THRESHOLD PROXIMITY BAR */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-zinc-400">
                            DRIFT PROXIMITY TO BREAKING THRESHOLD:{" "}
                            <strong className="text-zinc-200">
                              {evalState.driftPercent}%
                            </strong>
                          </span>
                          <span className="text-zinc-500">
                            Warning Margin:{" "}
                            {Math.round(premise.decayWarningMargin * 100)}% (at{" "}
                            {evalState.marginBoundary} {premise.unit})
                          </span>
                        </div>
                        <div className="h-2 w-full bg-zinc-900 border border-zinc-800 relative overflow-hidden">
                          <div
                            className="absolute top-0 bottom-0 w-px bg-amber-400/70 z-10"
                            style={{ left: "72%" }}
                            title="Decay Warning Margin"
                          />
                          <div
                            className={`h-full transition-all duration-200 ${barColor}`}
                            style={{ width: `${evalState.driftPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* INLINE REALITY DRIFT SIMULATOR SLIDER */}
                      <div
                        data-tour="reality-drift-slider"
                        className="p-2.5 bg-zinc-950/90 border border-zinc-800/90 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-amber-400 flex items-center gap-1 font-semibold">
                            <Sliders className="w-3 h-3" />
                            <span>SIMULATE REALITY DRIFT (LIVE SLIDER):</span>
                          </span>
                          <span className="text-zinc-400">
                            {simRange.breakingDirectionLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                            {simRange.min}
                          </span>
                          <input
                            type="range"
                            min={simRange.min}
                            max={simRange.max}
                            step={simRange.step}
                            value={
                              Number.isNaN(Number(sliderVal))
                                ? simRange.min
                                : Number(sliderVal)
                            }
                            onChange={async (e) => {
                              const nextVal = e.target.value;
                              setSliderOverrides((prev) => ({
                                ...prev,
                                [premise.id]: nextVal,
                              }));
                              await handleMutateMetric({
                                variableName: premise.variableName,
                                premiseId: premise.id,
                                value: Number(nextVal),
                                source: "inline-drift-slider",
                              });
                            }}
                            className="w-full accent-amber-400 h-1.5 bg-zinc-800 cursor-ew-resize"
                          />
                          <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                            {simRange.max}
                          </span>
                        </div>
                      </div>

                      {/* LIVE PROBE CONFIGURATION INSPECTOR */}
                      {probe && (
                        <div className="border-t border-zinc-800/80 pt-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 text-sky-400 text-[10px]">
                                {probe.probeType}
                              </span>
                              <span className="text-zinc-400 truncate max-w-[230px]">
                                {probe.status === "UNBOUND" || !probe.targetUrlOrQuery
                                  ? "suggested, not connected"
                                  : probe.targetUrlOrQuery}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-500">
                                {probe.lastLatencyMs !== null && probe.lastLatencyMs !== undefined
                                  ? `${probe.lastLatencyMs}ms`
                                  : "not run yet"}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRunAllProbes(premise.id)}
                                disabled={
                                  runningPremiseId === premise.id || probe.status === "UNBOUND"
                                }
                                className="px-2 py-0.5 text-[10px] bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-1"
                              >
                                <Play className="w-2.5 h-2.5 text-emerald-400" />
                                <span>
                                  {runningPremiseId === premise.id
                                    ? "Polling..."
                                    : "Poll Probe"}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedProbeIds((prev) => ({
                                    ...prev,
                                    [premise.id]: !prev[premise.id],
                                  }))
                                }
                                className="px-1.5 py-0.5 text-[10px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 flex items-center gap-0.5"
                              >
                                <span>JSON</span>
                                {isProbeExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          {isProbeExpanded && (
                            <div className="mt-2 p-2.5 bg-zinc-950 border border-zinc-800/90 font-mono text-[10px] space-y-1">
                              <div className="flex items-center justify-between text-zinc-500">
                                <span>SELECTOR: {probe.jsonPath}</span>
                                {(probe.valueMultiplier ?? 1) !== 1 && (
                                  <span>MULTIPLIER: x{probe.valueMultiplier}</span>
                                )}
                                <span>
                                  INTERVAL: {probe.pollingIntervalSeconds}s
                                </span>
                              </div>
                              <pre className="text-emerald-300/90 overflow-x-auto pt-1 leading-relaxed">
                                {probe.lastRawResponse || "No response recorded yet."}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* REAL LOCAL CODEBASE LOCUS INSPECTOR & GIT APPLY PATCH GENERATOR */}
              <div id="locus-inspector-section" data-tour="locus-diff-viewer">
                <LocusInspectorPanel artifact={selectedArtifact} />
              </div>

              {/* SOURCE ARTIFACT DOCUMENT WITH INLINE HIGHLIGHTED PREMISES */}
              <div className="border border-zinc-800 bg-zinc-900/20">
                <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
                      Source Decision Document (Inline Premise Highlighting)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Extracted claims bound to live telemetry
                  </span>
                </div>
                <div className="p-4 space-y-1">
                  {renderHighlightedDocument(selectedArtifact)}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANE: Invalidation & Teardown Feed (4 cols) */}
        <div className="col-span-12 md:col-span-4 overflow-hidden min-h-0">
          <TeardownPane
            extras={extras}
            selectedArtifact={selectedArtifact}
            allInvalidationEvents={invalidationEvents}
            onAcknowledgeEvent={handleAcknowledgeEvent}
            onDispatchAlert={handleDispatchAlert}
            onSimulateBreachForSelected={handleSimulateBreachForSelected}
            onSelectArtifact={setSelectedArtifactId}
            onRetireAndPromote={handleRetireAndPromote}
          />
        </div>
      </div>

      {/* Pipeline A: Premise Compiler Modal */}
      <CompilerModal
        isOpen={isCompilerOpen}
        onClose={() => setIsCompilerOpen(false)}
        templates={compilerTemplates}
        onArtifactCompiled={({
          artifact,
          artifacts: nextArts,
          invalidationEvents: nextEvents,
        }) => {
          setArtifacts(nextArts);
          setInvalidationEvents(nextEvents);
          setSelectedArtifactId(artifact.id);
          showToast(`Compiled & registered ${artifact.title}`);
        }}
      />

      {/* Codebase Assumption Scanner Modal */}
      <CodebaseScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSelectExistingArtifact={(id) => {
          setSelectedArtifactId(id);
        }}
        onScanImported={({
          artifacts: nextArts,
          invalidationEvents: nextEvents,
          selectedArtifactId: nextSelId,
        }) => {
          setArtifacts(nextArts);
          setInvalidationEvents(nextEvents);
          if (nextSelId) {
            setSelectedArtifactId(nextSelId);
          }
          showToast("Imported codebase @premise locus into Control Plane");
        }}
      />

      {/* Horizon C: Historical Drift Backtesting & Scenario Replay Modal */}
      <TimeMachineModal
        isOpen={isTimeMachineOpen}
        onClose={() => setIsTimeMachineOpen(false)}
        artifacts={artifacts}
        onUpdateArtifacts={setArtifacts}
        onUpdateEvents={setInvalidationEvents}
        onToast={showToast}
      />

      {/* GitHub Repository Scanner & Auto-Extractor Modal */}
      <RepoScannerModal
        isOpen={isRepoScannerOpen}
        initialTab={repoScannerTab}
        onClose={() => setIsRepoScannerOpen(false)}
        onSelectExistingArtifact={(id) => {
          setSelectedArtifactId(id);
        }}
        onScanImported={({
          artifacts: nextArts,
          invalidationEvents: nextEvents,
          selectedArtifactId: nextSelId,
        }) => {
          setArtifacts(nextArts);
          setInvalidationEvents(nextEvents);
          if (nextSelId) {
            setSelectedArtifactId(nextSelId);
          }
          showToast("Accepted premise & spun up live probe");
        }}
        onToast={showToast}
      />

      {/* Horizon D: Production Telemetry & Outbound Dispatch Manager */}
      <ConnectorSettingsModal
        extras={extras}
        isOpen={isConnectorSettingsOpen}
        onClose={() => setIsConnectorSettingsOpen(false)}
        onSaved={() => {
          refreshConnectorCount();
          showToast("Saved connector credentials to local SQLite store");
        }}
      />

      {/* Horizon E: Executive Architecture Balance Sheet Modal */}
      <ExecutiveBalanceSheetModal
        isOpen={isExecutiveBalanceSheetOpen}
        onClose={() => setIsExecutiveBalanceSheetOpen(false)}
        ledger={finOpsLedger}
        onSelectArtifact={(id) => {
          setSelectedArtifactId(id);
          setIsExecutiveBalanceSheetOpen(false);
        }}
      />

      {/* Package 1: Command Palette (Cmd+K) */}
      <CommandPalette
        extras={extras}
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        artifacts={artifacts}
        selectedArtifactId={selectedArtifact?.id || ""}
        onSelectArtifact={(id) => {
          setSelectedArtifactId(id);
        }}
        onRunAllProbes={() => handleRunAllProbes()}
        onToggleChaos={() => setIsChaosOpen((prev) => !prev)}
        onOpenTimeMachine={() => setIsTimeMachineOpen(true)}
        onOpenRepoScanner={() => {
          setRepoScannerTab("inbox");
          setIsRepoScannerOpen(true);
        }}
        onOpenConnectors={() => setIsConnectorSettingsOpen(true)}
        onOpenBalanceSheet={() => setIsExecutiveBalanceSheetOpen(true)}
        onOpenCodebaseScanner={() => setIsScannerOpen(true)}
        onOpenCompiler={() => setIsCompilerOpen(true)}
        onToggleTopologyView={() => setCenterViewMode("topology")}
        onToggleAssertionView={() => setCenterViewMode("assertions")}
        onToggleSseStream={() => setIsAutoStreamActive((prev) => !prev)}
        isSseActive={isAutoStreamActive}
        onResetSeed={handleResetSeed}
        onCopyCliCommand={() => {
          navigator.clipboard.writeText("bun ./bin/premise-cli.ts check");
          setCopiedCliCmd(true);
          showToast("Copied CI/CD CLI command: bun ./bin/premise-cli.ts check");
          setTimeout(() => setCopiedCliCmd(false), 2200);
        }}
        onChangeCombinator={handleChangeCombinator}
        onOpenLocusInspector={() => {
          setCenterViewMode("assertions");
          setTimeout(() => {
            document.getElementById("locus-inspector-section")?.scrollIntoView({ behavior: "smooth" });
          }, 100);
        }}
        onStartTour={() => setIsTourOpen(true)}
      />

      {/* Interactive Guided Walkthrough Tour */}
      <WalkthroughTour
        extras={extras}
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onSimulateBreach={handleSimulateBreachForSelected}
        onSelectArtifact={setSelectedArtifactId}
      />
    </div>
  );
}
