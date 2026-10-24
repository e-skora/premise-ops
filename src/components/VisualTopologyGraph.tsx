"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Cpu,
  FileCode2,
  ArrowRight,
  Search,
  Zap,
  DollarSign,
  Filter,
  Layers,
  Crosshair,
  X,
  SlidersHorizontal,
} from "lucide-react";
import {
  ArtifactStatus,
  ArtifactType,
  DecisionArtifactRecord,
  LogicCombinator,
  OPERATOR_SYMBOLS,
} from "@/lib/types";
import {
  computeTopologyGraph,
  findTransitiveBlastRadius,
  findTransitivePrerequisites,
  TopologyNode,
} from "@/lib/topology-engine";
import { formatUsd } from "@/lib/finops-engine";

interface VisualTopologyGraphProps {
  artifacts: DecisionArtifactRecord[];
  selectedArtifactId: string;
  onSelectArtifact: (artifactId: string) => void;
  onOpenLocusInspector?: (targetLocus: string) => void;
  onChangeCombinator?: (
    artifactId: string,
    combinator: LogicCombinator
  ) => Promise<void>;
  onInspectArtifactDetails?: (artifactId: string) => void;
}

export function VisualTopologyGraph({
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
  onOpenLocusInspector,
  onChangeCombinator,
  onInspectArtifactDetails,
}: VisualTopologyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas Viewport transform states
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Filtering states
  const [statusFilter, setStatusFilter] = useState<ArtifactStatus | "ALL" | "CASCADED">("ALL");
  const [typeFilter, setTypeFilter] = useState<ArtifactType | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Compute Layout
  const graph = useMemo(() => {
    return computeTopologyGraph(artifacts, {
      nodeWidth: 310,
      nodeHeight: 145,
      colGap: 110,
      rowGap: 40,
      padding: 50,
    });
  }, [artifacts]);

  // Selected Node
  const selectedNode = useMemo(() => {
    return graph.nodes.find((n) => n.id === selectedArtifactId) || graph.nodes[0] || null;
  }, [graph.nodes, selectedArtifactId]);

  // Highlighted dependencies based on hovered or selected node
  const activeFocusId = hoveredNodeId || selectedArtifactId;
  const blastRadiusIds = useMemo(() => {
    if (!activeFocusId) return new Set<string>();
    return findTransitiveBlastRadius(activeFocusId, artifacts);
  }, [activeFocusId, artifacts]);

  const prerequisiteIds = useMemo(() => {
    if (!activeFocusId) return new Set<string>();
    return findTransitivePrerequisites(activeFocusId, artifacts);
  }, [activeFocusId, artifacts]);

  // Auto-fit to viewport on initial load or reset
  const handleFitToScreen = () => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth === 0 || clientHeight === 0) return;

    const scaleX = (clientWidth - 80) / graph.bounds.width;
    const scaleY = (clientHeight - 80) / graph.bounds.height;
    const nextZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.45), 1.2);

    const centerX = (clientWidth - graph.bounds.width * nextZoom) / 2;
    const centerY = (clientHeight - graph.bounds.height * nextZoom) / 2;

    setZoom(nextZoom);
    setPan({ x: Math.max(centerX, 20), y: Math.max(centerY, 20) });
  };

  useEffect(() => {
    handleFitToScreen();
  }, [graph.bounds.width, graph.bounds.height]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking canvas background (not interactive buttons or nodes)
    if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.35));

  // Node matching search/filters
  const isNodeDimmed = (node: TopologyNode) => {
    if (statusFilter === "CASCADED") {
      if (!node.cascadedFromId) return true;
    } else if (statusFilter !== "ALL" && node.status !== statusFilter) {
      return true;
    }

    if (typeFilter !== "ALL" && node.type !== typeFilter) {
      return true;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = node.title.toLowerCase().includes(q);
      const matchLocus = node.targetLocus.toLowerCase().includes(q);
      const matchId = node.id.toLowerCase().includes(q);
      const matchVar = node.premises.some(
        (p) =>
          p.variableName.toLowerCase().includes(q) ||
          p.claim.toLowerCase().includes(q)
      );
      if (!matchTitle && !matchLocus && !matchId && !matchVar) return true;
    }

    return false;
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-zinc-950 border border-zinc-800 overflow-hidden font-mono select-none ${
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen"
          : "w-full h-full min-h-[580px]"
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 1. TOP TOOLBAR & CONTROLS */}
      <div
        data-no-pan
        className="shrink-0 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 z-20"
      >
        {/* Left: Section Header & Stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-sky-950/60 border border-sky-500/50 flex items-center justify-center">
              <Network className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                  Visual Architecture Topology Graph
                </span>
                <span className="text-[10px] px-1.5 py-0.2 bg-zinc-900 border border-zinc-800 text-sky-400">
                  DAG MAP // {graph.stats.totalNodes} NODES
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                <span>{graph.stats.totalEdges} Directed Dependencies</span>
                <span>•</span>
                <span>Max Blast Depth: {graph.stats.maxDepth} Hops</span>
                {graph.stats.cascadedNodes > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-rose-400 font-bold">
                      {graph.stats.cascadedNodes} Cascaded Kill-Switches
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Search & Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter topology..."
              className="pl-7 pr-2 py-1 text-[11px] bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-500 w-36 focus:w-48 focus:border-sky-500/60 transition-all outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 p-0.5 text-[10px]">
            {(["ALL", "HEALTHY", "AT_RISK", "INVALIDATED", "CASCADED"] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-0.5 transition-colors ${
                    statusFilter === st
                      ? "bg-zinc-800 text-zinc-100 font-bold border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>
        </div>

        {/* Right: Zoom & Canvas Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleFitToScreen}
            className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[10px] flex items-center gap-1 transition-colors"
            title="Fit graph to view"
          >
            <Crosshair className="w-3 h-3 text-sky-400" />
            <span>Fit</span>
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 2. INTERACTIVE CANVAS VIEWPORT */}
      <div className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing">
        {/* SVG Defs & Directed Edges */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <defs>
            {/* Arrow Marker Definitions */}
            <marker
              id="arrow-emerald"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker
              id="arrow-amber"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
            </marker>
            <marker
              id="arrow-rose"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>
            <marker
              id="arrow-sky"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#71717a" />
            </marker>
          </defs>

          {/* Render All Directed Edges */}
          {graph.edges.map((edge) => {
            const isSourceActive =
              edge.sourceId === activeFocusId || prerequisiteIds.has(edge.sourceId);
            const isTargetActive =
              edge.targetId === activeFocusId || blastRadiusIds.has(edge.targetId);
            const isPathActive = isSourceActive && isTargetActive;

            let strokeColor = "#3f3f46"; // zinc-700
            let markerId = "arrow-default";
            let strokeWidth = 1.5;

            if (edge.isCascaded) {
              strokeColor = "#f43f5e"; // rose-500
              markerId = "arrow-rose";
              strokeWidth = 2.5;
            } else if (isPathActive) {
              strokeColor = "#38bdf8"; // sky-400
              markerId = "arrow-sky";
              strokeWidth = 2.5;
            } else if (edge.isBreached) {
              strokeColor = "#fb7185"; // rose-400
              markerId = "arrow-rose";
              strokeWidth = 2;
            }

            return (
              <g key={edge.id}>
                {/* Background glow path if cascaded or active */}
                {(edge.isCascaded || isPathActive) && (
                  <path
                    d={edge.pathD}
                    fill="none"
                    stroke={edge.isCascaded ? "rgba(244, 63, 94, 0.3)" : "rgba(56, 189, 248, 0.3)"}
                    strokeWidth={strokeWidth + 5}
                    strokeLinecap="round"
                  />
                )}
                {/* Main Bezier Edge */}
                <path
                  d={edge.pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={edge.isCascaded ? "6 4" : undefined}
                  markerEnd={`url(#${markerId})`}
                  className={edge.isCascaded ? "animate-pulse" : ""}
                />
              </g>
            );
          })}
        </svg>

        {/* HTML Interactive Nodes Layer */}
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {graph.nodes.map((node) => {
            const isSelected = node.id === selectedArtifactId;
            const isHovered = node.id === hoveredNodeId;
            const isBlast = blastRadiusIds.has(node.id);
            const isPrereq = prerequisiteIds.has(node.id);
            const dimmed = isNodeDimmed(node);

            // Styling based on status & focus
            let borderStyle = "border-zinc-800 bg-zinc-950/95";
            let glowStyle = "";

            if (node.cascadedFromId) {
              borderStyle = "border-rose-500 bg-rose-950/40 text-rose-100";
              glowStyle = "ring-2 ring-rose-500/50 shadow-lg shadow-rose-950/60";
            } else if (node.status === "INVALIDATED") {
              borderStyle = "border-rose-500/80 bg-rose-950/30 text-rose-100";
              glowStyle = "ring-1 ring-rose-500/50 shadow-md shadow-rose-950/50";
            } else if (node.status === "AT_RISK") {
              borderStyle = "border-amber-500/70 bg-amber-950/25 text-amber-100";
              glowStyle = "ring-1 ring-amber-500/40";
            } else {
              borderStyle = "border-emerald-500/50 bg-emerald-950/15 text-emerald-100";
            }

            if (isSelected) {
              glowStyle = "ring-2 ring-sky-400 shadow-xl shadow-sky-950/80";
              borderStyle = "border-sky-400 bg-zinc-900";
            } else if (isBlast) {
              glowStyle = "ring-1 ring-rose-400 shadow-md shadow-rose-950/40";
              borderStyle = "border-rose-400/80 bg-rose-950/20";
            } else if (isPrereq) {
              glowStyle = "ring-1 ring-cyan-400 shadow-md shadow-cyan-950/40";
              borderStyle = "border-cyan-400/80 bg-cyan-950/20";
            }

            return (
              <div
                key={node.id}
                data-no-pan
                onClick={() => onSelectArtifact(node.id)}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                style={{
                  position: "absolute",
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.width}px`,
                  height: `${node.height}px`,
                  opacity: dimmed ? 0.25 : 1,
                  transition: "opacity 0.2s ease, border-color 0.2s ease",
                }}
                className={`p-3 border flex flex-col justify-between cursor-pointer transition-transform hover:-translate-y-0.5 ${borderStyle} ${glowStyle}`}
              >
                {/* Node Header */}
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] px-1.5 py-0.2 bg-zinc-900 text-zinc-300 border border-zinc-700 shrink-0 font-bold">
                        {node.type}
                      </span>
                      <span className="text-[10px] text-zinc-400 truncate font-bold">
                        {node.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {node.cascadedFromId ? (
                        <span className="text-[9px] px-1.5 py-0.2 bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-rose-400 animate-bounce" />
                          CASCADED
                        </span>
                      ) : (
                        <span
                          className={`text-[9px] px-1.5 py-0.2 border font-bold ${
                            node.status === "INVALIDATED"
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                              : node.status === "AT_RISK"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                              : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                          }`}
                        >
                          {node.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <div className="text-xs font-bold text-zinc-100 truncate mb-1" title={node.title}>
                    {node.title}
                  </div>

                  {/* Locus Target */}
                  <div className="text-[10px] text-zinc-400 truncate flex items-center gap-1">
                    <FileCode2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">{node.targetLocus}</span>
                  </div>
                </div>

                {/* Node Footer: Health Stack & Kill-Switch Gate */}
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1 text-[10px]">
                  {/* Gate Mode */}
                  <div className="flex items-center gap-1 text-zinc-400">
                    <Cpu className="w-3 h-3 text-sky-400" />
                    <span>GATE: {node.combinator}</span>
                  </div>

                  {/* Premise Indicator Stack */}
                  <div className="flex items-center gap-1.5">
                    {node.brokenCount > 0 && (
                      <span className="px-1 py-0.2 bg-rose-950 border border-rose-500/50 text-rose-300 text-[9px] font-bold">
                        {node.brokenCount} Broken
                      </span>
                    )}
                    {node.decayingCount > 0 && (
                      <span className="px-1 py-0.2 bg-amber-950 border border-amber-500/50 text-amber-300 text-[9px] font-bold">
                        {node.decayingCount} Decaying
                      </span>
                    )}
                    {node.validCount > 0 && (
                      <span className="px-1 py-0.2 bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-[9px]">
                        {node.validCount} Valid
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. FLOATING DETAILS & BLAST RADIUS INSPECTOR */}
        {selectedNode && (
          <div
            data-no-pan
            className="absolute right-4 bottom-4 w-96 max-w-[calc(100%-2rem)] max-h-[80%] overflow-y-auto bg-zinc-950/95 border border-zinc-800 p-4 shadow-2xl backdrop-blur-md space-y-3 z-30"
          >
            <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2.5">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] px-1.5 py-0.2 bg-zinc-900 border border-zinc-700 text-zinc-300">
                    {selectedNode.type}
                  </span>
                  <span className="text-[10px] text-zinc-500">{selectedNode.id}</span>
                </div>
                <h4 className="text-xs font-bold text-zinc-100 leading-tight">
                  {selectedNode.title}
                </h4>
              </div>

              <span
                className={`text-[10px] px-2 py-0.5 border font-bold shrink-0 ${
                  selectedNode.status === "INVALIDATED"
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                    : selectedNode.status === "AT_RISK"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                }`}
              >
                {selectedNode.status}
              </span>
            </div>

            {/* Target Locus */}
            <div className="text-[11px] flex items-center justify-between gap-2 bg-zinc-900/60 p-2 border border-zinc-800">
              <div className="truncate flex items-center gap-1.5 text-zinc-300">
                <FileCode2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{selectedNode.targetLocus}</span>
              </div>
              {onOpenLocusInspector && (
                <button
                  type="button"
                  onClick={() => onOpenLocusInspector(selectedNode.targetLocus)}
                  className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 shrink-0"
                >
                  Inspect File
                </button>
              )}
            </div>

            {/* Blast Radius Box */}
            <div
              className={`p-2.5 border text-xs space-y-1 ${
                selectedNode.status === "INVALIDATED"
                  ? "bg-rose-950/25 border-rose-500/40 text-rose-200"
                  : "bg-zinc-900/40 border-zinc-800 text-zinc-300"
              }`}
            >
              <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-400">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>Blast Radius & Sunset Scope</span>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                {selectedNode.blastRadius}
              </p>
            </div>

            {/* Transitive Blast Radius Cascade Chain */}
            <div className="space-y-1.5 text-[11px]">
              <div className="text-[10px] uppercase text-zinc-500 flex items-center justify-between">
                <span>Downstream Cascade Impact ({blastRadiusIds.size})</span>
                {blastRadiusIds.size > 0 && (
                  <span className="text-rose-400 font-bold">MULTI-HOP TARGETS</span>
                )}
              </div>
              {blastRadiusIds.size === 0 ? (
                <div className="text-[10px] text-zinc-600 italic">
                  Leaf node — no downstream dependencies.
                </div>
              ) : (
                <div className="space-y-1">
                  {Array.from(blastRadiusIds).map((id) => {
                    const depArt = artifacts.find((a) => a.id === id);
                    return (
                      <div
                        key={id}
                        onClick={() => onSelectArtifact(id)}
                        className="p-1.5 bg-rose-950/20 border border-rose-500/30 text-rose-200 flex items-center justify-between gap-2 cursor-pointer hover:bg-rose-900/30"
                      >
                        <div className="truncate">
                          <span className="font-bold mr-1.5">{id}</span>
                          <span className="text-[10px] text-zinc-400">
                            {depArt?.title}
                          </span>
                        </div>
                        <ArrowRight className="w-3 h-3 text-rose-400 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bound Premises List Preview */}
            <div className="space-y-1.5 text-[11px]">
              <div className="text-[10px] uppercase text-zinc-500">
                Monitored Premises ({selectedNode.premises.length})
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {selectedNode.premises.map((p) => (
                  <div
                    key={p.id}
                    className={`p-1.5 border text-[10px] flex items-center justify-between gap-1.5 ${
                      p.status === "BROKEN"
                        ? "border-rose-500/50 bg-rose-950/30 text-rose-200"
                        : p.status === "DECAYING"
                        ? "border-amber-500/50 bg-amber-950/25 text-amber-200"
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-300"
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-bold truncate">{p.variableName}</div>
                      <div className="opacity-75 text-[9px] truncate">
                        {p.currentValue} {OPERATOR_SYMBOLS[p.operator]}{" "}
                        {p.thresholdValue} {p.unit}
                      </div>
                    </div>
                    <span className="text-[9px] px-1 py-0.2 bg-zinc-950/80 border border-current font-bold shrink-0">
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom 1-Click Action */}
            {onInspectArtifactDetails && (
              <button
                type="button"
                onClick={() => onInspectArtifactDetails(selectedNode.id)}
                className="w-full py-1.5 text-xs font-bold bg-sky-950 hover:bg-sky-900 text-sky-200 border border-sky-500/60 flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Open in Assertion Inspector</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* 4. CANVAS WATERMARK / LEGEND */}
        <div
          data-no-pan
          className="absolute left-4 bottom-4 bg-zinc-950/90 border border-zinc-800 p-2.5 text-[10px] text-zinc-400 space-y-1.5 backdrop-blur-sm z-20 pointer-events-auto"
        >
          <div className="text-[9px] uppercase font-bold text-zinc-300 flex items-center gap-1">
            <Layers className="w-3 h-3 text-sky-400" />
            <span>Topology Legend</span>
          </div>
          <div className="flex flex-col gap-1 text-[9px]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-none border border-emerald-300" />
              <span>Healthy Constraints (Holding)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-none border border-amber-300" />
              <span>Decaying Warning (Drift Danger)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-none border border-rose-300" />
              <span>Broken / Invalidated (Teardown Ready)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-0.5 bg-rose-400 border-dashed border-t-2 border-rose-400" />
              <span className="text-rose-300 font-bold">Animated Stream: Cascaded Kill-Switch</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
