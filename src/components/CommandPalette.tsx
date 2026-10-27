"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Command,
  Play,
  Flame,
  History,
  GitBranch,
  Sliders,
  DollarSign,
  FolderSearch,
  Plus,
  Network,
  Activity,
  Wifi,
  Terminal,
  RotateCcw,
  Cpu,
  FileCode2,
  Radio,
  ArrowRight,
  CornerDownLeft,
  X,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Compass,
} from "lucide-react";
import {
  DecisionArtifactRecord,
  LogicCombinator,
  OPERATOR_SYMBOLS,
  PremiseRecord,
} from "@/lib/types";
import { premiseValueText } from "./PremiseSourceBadge";

// Commands for features hidden unless PREMISE_EXTRAS=1
const EXTRAS_COMMAND_IDS = ["cmd-topology-view", "cmd-time-machine", "cmd-finops"];

export interface CommandPaletteProps {
  /** PREMISE_EXTRAS: shows Topology, Time Machine and Balance Sheet commands */
  extras?: boolean;
  isOpen: boolean;
  onClose: () => void;
  artifacts: DecisionArtifactRecord[];
  selectedArtifactId: string;
  onSelectArtifact: (artifactId: string) => void;
  onRunAllProbes: () => Promise<void>;
  onToggleChaos: () => void;
  onOpenTimeMachine: () => void;
  onOpenRepoScanner: () => void;
  onOpenConnectors: () => void;
  onOpenBalanceSheet: () => void;
  onOpenCodebaseScanner: () => void;
  onOpenCompiler: () => void;
  onToggleTopologyView: () => void;
  onToggleAssertionView: () => void;
  onToggleSseStream: () => void;
  isSseActive: boolean;
  onResetSeed: () => Promise<void>;
  onCopyCliCommand: () => void;
  onChangeCombinator?: (
    artifactId: string,
    combinator: LogicCombinator
  ) => Promise<void>;
  onOpenLocusInspector?: (locus: string) => void;
  onStartTour?: () => void;
}

type PaletteCategory = "all" | "commands" | "decisions" | "premises";

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "commands" | "decisions" | "premises";
  badge?: string;
  badgeStyle?: string;
  icon: React.ReactNode;
  keywords: string[];
  action: () => void | Promise<void>;
}

export function CommandPalette({
  isOpen,
  onClose,
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
  onRunAllProbes,
  onToggleChaos,
  onOpenTimeMachine,
  onOpenRepoScanner,
  onOpenConnectors,
  onOpenBalanceSheet,
  onOpenCodebaseScanner,
  onOpenCompiler,
  onToggleTopologyView,
  onToggleAssertionView,
  onToggleSseStream,
  isSseActive,
  onResetSeed,
  onCopyCliCommand,
  onChangeCombinator,
  onOpenLocusInspector,
  onStartTour,
  extras = false,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<PaletteCategory>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const selectedArtifact = useMemo(() => {
    return artifacts.find((a) => a.id === selectedArtifactId) || artifacts[0] || null;
  }, [artifacts, selectedArtifactId]);

  // Build command palette catalog
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];

    // --- 1. SYSTEM COMMANDS & TOOLS ---
    if (onStartTour) {
      items.push({
        id: "cmd-start-tour",
        title: "Start Guided Tour / Walkthrough",
        subtitle: "Interactive 60s spotlight tour of architectural contracts & drift",
        category: "commands",
        badge: "60S TOUR",
        badgeStyle: "bg-cyan-950 text-cyan-300 border-cyan-500/50 font-bold",
        icon: <Compass className="w-4 h-4 text-cyan-400" />,
        keywords: [
          "tour",
          "walkthrough",
          "guide",
          "explainer",
          "bubbles",
          "demo",
          "start",
          "onboarding",
          "spotlight",
        ],
        action: () => {
          onClose();
          onStartTour();
        },
      });
    }

    items.push({
      id: "cmd-probes-run",
      title: "Run All Probes Now",
      subtitle: "Execute live HTTP_JSON_PATH, PromQL & SQL telemetry probes",
      category: "commands",
      badge: "LIVE EXECUTION",
      badgeStyle: "bg-sky-950 text-sky-300 border-sky-500/40",
      icon: <Play className="w-4 h-4 text-sky-400" />,
      keywords: ["run", "probe", "evaluate", "telemetry", "test", "check"],
      action: async () => {
        onClose();
        await onRunAllProbes();
      },
    });

    items.push({
      id: "cmd-topology-view",
      title: "Switch to Visual Topology Graph",
      subtitle: "Full-portfolio interactive DAG map with live cascade links",
      category: "commands",
      badge: "TOPOLOGY",
      badgeStyle: "bg-emerald-950 text-emerald-300 border-emerald-500/40",
      icon: <Network className="w-4 h-4 text-emerald-400" />,
      keywords: ["topology", "graph", "dag", "dependencies", "map", "visual"],
      action: () => {
        onClose();
        onToggleTopologyView();
      },
    });

    items.push({
      id: "cmd-assertion-view",
      title: "Switch to Assertion Inspector",
      subtitle: "In-depth premise cards, live drift sliders & locus code viewer",
      category: "commands",
      badge: "INSPECTOR",
      badgeStyle: "bg-zinc-800 text-zinc-300 border-zinc-700",
      icon: <Activity className="w-4 h-4 text-zinc-300" />,
      keywords: ["assertion", "inspector", "cards", "document", "locus", "view"],
      action: () => {
        onClose();
        onToggleAssertionView();
      },
    });

    items.push({
      id: "cmd-chaos-drawer",
      title: "Toggle Chaos / Reality Drift Simulator",
      subtitle: "Inject synthetic price deflation, latency spikes or conversion drops",
      category: "commands",
      badge: "CHAOS",
      badgeStyle: "bg-amber-950 text-amber-300 border-amber-500/40",
      icon: <Flame className="w-4 h-4 text-amber-400" />,
      keywords: ["chaos", "drift", "simulator", "mutate", "inject", "shock"],
      action: () => {
        onClose();
        onToggleChaos();
      },
    });

    items.push({
      id: "cmd-time-machine",
      title: "Open Time-Machine Backtest (Horizon C)",
      subtitle: "Replay historical scenarios & optimize threshold safety buffers",
      category: "commands",
      badge: "BACKTEST",
      badgeStyle: "bg-purple-950 text-purple-300 border-purple-500/40",
      icon: <History className="w-4 h-4 text-purple-400" />,
      keywords: ["time", "machine", "backtest", "scenario", "replay", "resilience"],
      action: () => {
        onClose();
        onOpenTimeMachine();
      },
    });

    items.push({
      id: "cmd-repo-scanner",
      title: "Open Discovered Premises Inbox (Connect Repo)",
      subtitle: "Auto-extract ADR constraints & heavy dependencies (v2 Scanner)",
      category: "commands",
      badge: "INBOX",
      badgeStyle: "bg-sky-950 text-sky-300 border-sky-500/40",
      icon: <GitBranch className="w-4 h-4 text-sky-400" />,
      keywords: ["connect", "repo", "github", "scanner", "adr", "manifest", "inbox"],
      action: () => {
        onClose();
        onOpenRepoScanner();
      },
    });

    items.push({
      id: "cmd-connectors",
      title: "Production Telemetry Connectors (Horizon D)",
      subtitle: "Configure Prometheus, Datadog v2, Slack Block Kit & PagerDuty",
      category: "commands",
      badge: "CONNECTORS",
      badgeStyle: "bg-cyan-950 text-cyan-300 border-cyan-500/40",
      icon: <Sliders className="w-4 h-4 text-cyan-400" />,
      keywords: ["connectors", "prometheus", "datadog", "slack", "pagerduty", "auth"],
      action: () => {
        onClose();
        onOpenConnectors();
      },
    });

    items.push({
      id: "cmd-finops",
      title: "Executive Architecture Balance Sheet (Horizon E)",
      subtitle: "Inspect portfolio monthly drag burn rate & eliminated cloud waste",
      category: "commands",
      badge: "FINOPS",
      badgeStyle: "bg-amber-950 text-amber-300 border-amber-500/40",
      icon: <DollarSign className="w-4 h-4 text-amber-400" />,
      keywords: ["balance", "sheet", "finops", "drag", "spend", "waste", "cost", "roi"],
      action: () => {
        onClose();
        onOpenBalanceSheet();
      },
    });

    items.push({
      id: "cmd-codebase-scanner",
      title: "Scan Local Codebase for @premise Loci",
      subtitle: "Walk examples/demo-repo for inline architectural annotations",
      category: "commands",
      badge: "CODEBASE",
      badgeStyle: "bg-zinc-800 text-zinc-300 border-zinc-700",
      icon: <FolderSearch className="w-4 h-4 text-sky-400" />,
      keywords: ["scan", "codebase", "annotations", "locus", "import"],
      action: () => {
        onClose();
        onOpenCodebaseScanner();
      },
    });

    items.push({
      id: "cmd-compiler",
      title: "Compile New Decision Artifact (Pipeline A)",
      subtitle: "Paste ADR, PR, or Memo markdown to extract structured premises",
      category: "commands",
      badge: "COMPILER",
      badgeStyle: "bg-emerald-950 text-emerald-300 border-emerald-500/40",
      icon: <Plus className="w-4 h-4 text-emerald-400" />,
      keywords: ["compile", "new", "artifact", "adr", "memo", "pr", "create", "extract"],
      action: () => {
        onClose();
        onOpenCompiler();
      },
    });

    items.push({
      id: "cmd-sse-stream",
      title: isSseActive ? "Stop Autonomous SSE Live Stream" : "Start Autonomous SSE Live Stream",
      subtitle: isSseActive ? "Disconnect background SSE probe daemon" : "Stream automated probe ticks via /api/stream",
      category: "commands",
      badge: isSseActive ? "SSE ACTIVE" : "SSE IDLE",
      badgeStyle: isSseActive
        ? "bg-emerald-950 text-emerald-300 border-emerald-500/50 font-bold"
        : "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: <Wifi className={`w-4 h-4 ${isSseActive ? "text-emerald-400 animate-pulse" : "text-zinc-400"}`} />,
      keywords: ["sse", "stream", "poll", "auto", "live", "daemon"],
      action: () => {
        onClose();
        onToggleSseStream();
      },
    });

    items.push({
      id: "cmd-cli-copy",
      title: "Copy Standalone CI/CD CLI Command",
      subtitle: "Copies `bun ./bin/premise-cli.ts check` to clipboard",
      category: "commands",
      badge: "CLI",
      badgeStyle: "bg-zinc-800 text-zinc-300 border-zinc-700",
      icon: <Terminal className="w-4 h-4 text-emerald-400" />,
      keywords: ["cli", "terminal", "command", "check", "copy", "ci/cd"],
      action: () => {
        onClose();
        onCopyCliCommand();
      },
    });

    items.push({
      id: "cmd-reset-db",
      title: "Reset SQLite Database to Seed Telemetry",
      subtitle: "Restores clean baseline state in ./premise.db",
      category: "commands",
      badge: "DANGER",
      badgeStyle: "bg-rose-950 text-rose-300 border-rose-500/50",
      icon: <RotateCcw className="w-4 h-4 text-rose-400" />,
      keywords: ["reset", "seed", "database", "sqlite", "restore"],
      action: async () => {
        onClose();
        await onResetSeed();
      },
    });

    // --- 2. CONTEXTUAL ACTIONS FOR CURRENT ARTIFACT ---
    if (selectedArtifact && onChangeCombinator) {
      const nextGate = selectedArtifact.logicCombinator === "ANY" ? "ALL" : "ANY";
      items.push({
        id: "cmd-toggle-gate",
        title: `Switch Kill-Switch Gate to ${nextGate} for ${selectedArtifact.id}`,
        subtitle:
          nextGate === "ALL"
            ? "Switch to AND gate (invalidates only when ALL premises break)"
            : "Switch to OR gate (invalidates when ANY single premise breaks)",
        category: "commands",
        badge: `GATE: ${selectedArtifact.logicCombinator || "ANY"}`,
        badgeStyle: "bg-sky-950 text-sky-300 border-sky-500/40",
        icon: <Cpu className="w-4 h-4 text-sky-400" />,
        keywords: ["gate", "combinator", "any", "all", "logic", "kill-switch"],
        action: async () => {
          onClose();
          await onChangeCombinator(selectedArtifact.id, nextGate);
        },
      });
    }

    if (selectedArtifact && onOpenLocusInspector) {
      items.push({
        id: "cmd-inspect-locus",
        title: `Inspect Source File: ${selectedArtifact.targetLocus}`,
        subtitle: `View source code at ${selectedArtifact.targetLocus} and unified teardown diffs`,
        category: "commands",
        badge: "LOCUS",
        badgeStyle: "bg-emerald-950 text-emerald-300 border-emerald-500/40",
        icon: <FileCode2 className="w-4 h-4 text-emerald-400" />,
        keywords: ["locus", "file", "inspect", "diff", "code", "view"],
        action: () => {
          onClose();
          onOpenLocusInspector(selectedArtifact.targetLocus);
        },
      });
    }

    // --- 3. DECISION ARTIFACTS ---
    for (const art of artifacts) {
      let badgeStyle = "bg-emerald-950 text-emerald-300 border-emerald-500/40";
      if (art.status === "INVALIDATED") {
        badgeStyle = "bg-rose-950 text-rose-300 border-rose-500/50";
      } else if (art.status === "AT_RISK") {
        badgeStyle = "bg-amber-950 text-amber-300 border-amber-500/40";
      }

      items.push({
        id: `art-${art.id}`,
        title: art.title,
        subtitle: `${art.targetLocus} • ${art.premises.length} premise(s) • ${art.blastRadius.slice(0, 90)}...`,
        category: "decisions",
        badge: art.cascadedFromId ? "CASCADED" : art.status,
        badgeStyle,
        icon: <FileCode2 className="w-4 h-4 text-zinc-300" />,
        keywords: [
          art.id,
          art.title,
          art.type,
          art.targetLocus,
          art.status,
          art.blastRadius,
          ...(art.premises.map((p) => p.variableName)),
        ],
        action: () => {
          onClose();
          onSelectArtifact(art.id);
        },
      });
    }

    // --- 4. LOAD-BEARING PREMISES ---
    for (const art of artifacts) {
      for (const p of art.premises) {
        let badgeStyle = "bg-emerald-950 text-emerald-300 border-emerald-500/40";
        if (p.status === "BROKEN") {
          badgeStyle = "bg-rose-950 text-rose-300 border-rose-500/50";
        } else if (p.status === "DECAYING") {
          badgeStyle = "bg-amber-950 text-amber-300 border-amber-500/40";
        }

        items.push({
          id: `prem-${p.id}`,
          title: `${p.variableName} (${premiseValueText(p)} ${OPERATOR_SYMBOLS[p.operator]} ${p.thresholdValue} ${p.unit})`,
          subtitle: `In ${art.title}: "${p.claim}"`,
          category: "premises",
          badge: p.status,
          badgeStyle,
          icon: <Radio className="w-4 h-4 text-sky-400" />,
          keywords: [
            p.id,
            p.variableName,
            p.claim,
            p.status,
            p.thresholdValue,
            art.id,
            art.title,
          ],
          action: () => {
            onClose();
            onSelectArtifact(art.id);
          },
        });
      }
    }

    return extras
      ? items
      : items.filter((item) => !EXTRAS_COMMAND_IDS.includes(item.id));
  }, [
    extras,
    artifacts,
    selectedArtifact,
    selectedArtifactId,
    isSseActive,
    onClose,
    onSelectArtifact,
    onRunAllProbes,
    onToggleTopologyView,
    onToggleAssertionView,
    onToggleChaos,
    onOpenTimeMachine,
    onOpenRepoScanner,
    onOpenConnectors,
    onOpenBalanceSheet,
    onOpenCodebaseScanner,
    onOpenCompiler,
    onToggleSseStream,
    onCopyCliCommand,
    onResetSeed,
    onChangeCombinator,
    onOpenLocusInspector,
  ]);

  // Filter items by search query & category tab
  const filteredItems = useMemo(() => {
    let result = allItems;

    if (activeCategory !== "all") {
      result = result.filter((item) => item.category === activeCategory);
    }

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter((item) => {
        const inTitle = item.title.toLowerCase().includes(q);
        const inSub = item.subtitle?.toLowerCase().includes(q) ?? false;
        const inKeywords = item.keywords.some((k) => k.toLowerCase().includes(q));
        return inTitle || inSub || inKeywords;
      });
    }

    return result;
  }, [allItems, activeCategory, query]);

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  // Keep selected index in bounds and scroll into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(
        `[data-item-index="${selectedIndex}"]`
      );
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  // Keyboard navigation within palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % Math.max(filteredItems.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((idx) =>
        idx <= 0 ? Math.max(filteredItems.length - 1, 0) : idx - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredItems[selectedIndex];
      if (current) {
        current.action();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const cats: PaletteCategory[] = ["all", "commands", "decisions", "premises"];
      const nextIdx = (cats.indexOf(activeCategory) + 1) % cats.length;
      setActiveCategory(cats[nextIdx]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 px-4 font-mono select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Top Search Input Bar */}
        <div className="relative border-b border-zinc-800 flex items-center px-4 py-3 bg-zinc-900/60">
          <Search className="w-4 h-4 text-zinc-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, search decisions or premises (e.g. 'run', 'redis', 'cac', 'topology')..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-zinc-500 hover:text-zinc-300 p-1 mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 border border-zinc-800 px-1.5 py-0.5 bg-zinc-900">
            <span>ESC</span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-zinc-900/40 border-b border-zinc-800/80 text-[11px]">
          <span className="text-[10px] uppercase text-zinc-500 mr-2">Filter:</span>
          {(
            [
              { id: "all", label: "All" },
              { id: "commands", label: "Commands" },
              { id: "decisions", label: "Decisions" },
              { id: "premises", label: "Premises" },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2 py-0.5 transition-colors ${
                activeCategory === cat.id
                  ? "bg-zinc-800 text-zinc-100 font-bold border border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-zinc-500">
            {filteredItems.length} result(s)
          </span>
        </div>

        {/* Items List */}
        <div
          ref={listRef}
          className="max-h-[420px] overflow-y-auto divide-y divide-zinc-900/80 p-1.5"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 px-4 text-center text-xs text-zinc-500 space-y-2">
              <Command className="w-6 h-6 mx-auto text-zinc-600" />
              <div>No matching commands, decisions, or premises found.</div>
              <div className="text-[11px] text-zinc-600">
                Try searching for &quot;run&quot;, &quot;adr&quot;, &quot;cost&quot;, or &quot;topology&quot;.
              </div>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-item-index={index}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-zinc-900 text-zinc-100 border border-sky-500/40"
                      : "hover:bg-zinc-900/40 text-zinc-300 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? "bg-zinc-800 border-zinc-700"
                          : "bg-zinc-950 border-zinc-800"
                      }`}
                    >
                      {item.icon}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate flex items-center gap-2">
                        <span>{item.title}</span>
                        {item.badge && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 border font-bold ${
                              item.badgeStyle ||
                              "bg-zinc-800 text-zinc-300 border-zinc-700"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {isSelected && (
                      <span className="text-[10px] text-sky-400 font-bold flex items-center gap-1">
                        <span>Select</span>
                        <CornerDownLeft className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Ribbon */}
        <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300">
                ↑↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300">
                ↵
              </kbd>
              <span>Execute</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300">
                Tab
              </kbd>
              <span>Filter Group</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300">
                Esc
              </kbd>
              <span>Close</span>
            </span>
          </div>

          <div className="flex items-center gap-1 text-zinc-400">
            <Command className="w-3 h-3 text-sky-400" />
            <span>Command Palette (⌘K)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
