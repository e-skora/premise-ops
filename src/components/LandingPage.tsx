"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Radio,
  Activity,
  GitBranch,
  Terminal,
  Shield,
  ArrowRight,
  Play,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Zap,
  TrendingDown,
  Layers,
  FileCode,
  Sliders,
  DollarSign,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Boxes,
  Cpu,
  Server,
  FileCheck,
  Check,
  Copy,
  Compass,
} from "lucide-react";

export function LandingPage() {
  // Interactive Hero Breach Simulator State
  const [llmCost, setLlmCost] = useState<number>(0.0018); // Default $0.0018 / 1k tokens
  const threshold = 0.002; // Threshold constraint: cost >= $0.0020
  const isBreached = llmCost < threshold;
  const isDecaying = llmCost >= threshold && llmCost <= threshold * 1.15;
  const [activePillar, setActivePillar] = useState<number>(0);
  const [copiedCli, setCopiedCli] = useState(false);

  const handleCopyCli = () => {
    navigator.clipboard.writeText("npx premise-cli check --strict");
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const pillars = [
    {
      id: "probes",
      title: "Live Telemetry Probes",
      tag: "Prometheus • Thanos • Datadog v2 • SQL",
      icon: Activity,
      color: "emerald",
      headline: "Static ADRs lie. Telemetry tells the truth.",
      description:
        "Bind natural language architecture claims directly to live PromQL queries, Datadog metrics, or SQL telemetry. When unit economics shift or latency boundaries drift, Premise detects it immediately.",
      metric: "Sub-second evaluation",
      metricLabel: "Autonomous evaluation frequency",
      codeSnippet: `// PromQL Probe bound to ADR-014
probe:
  type: PROMQL
  query: avg_over_time(llm_gateway_input_token_cost[5m])
  threshold: "< 0.0020"
  status: BREACHED (-28% drift)`,
    },
    {
      id: "cascades",
      title: "Multi-Hop Cascades",
      tag: "Cross-Artifact Blast Radius",
      icon: Layers,
      color: "amber",
      headline: "Decisions don't live in isolation. Track the dominoes.",
      description:
        "When an upstream architectural assumption collapses, Premise propagates the breach downstream through dependency graphs. Catch impacted vendor contracts, consumer microservices, and client SDKs before they cause outages.",
      metric: "100% blast radius visibility",
      metricLabel: "Transitive dependency mapping",
      codeSnippet: `// Upstream failure cascade
ADR-014 (Semantic Cache) -> [BREACHED]
  └─> VENDOR-004 (Redis Enterprise Commit: $14.2k/mo) [AT RISK]
  └─> Svc: gateway-consumer.ts [OBSOLETE CACHE CALLER]`,
    },
    {
      id: "pr-bot",
      title: "Autonomous Teardown PRs",
      tag: "Zero-Touch GitHub Bot",
      icon: GitBranch,
      color: "cyan",
      headline: "Automated garbage collection for dead code.",
      description:
        "Premise doesn't just send Slack noise. It cuts a git branch, generates git-apply ready unified diffs, inspects exact workspace loci, and submits a GitHub PR complete with Architecture Council signoff checklists.",
      metric: "Zero-touch PR workflow",
      metricLabel: "Automated diff generation",
      codeSnippet: `Branch: premise/teardown-adr-014
Commit: chore(teardown): decommission ADR-014
Diff:
- const cache = new SemanticCacheClient(redisConfig);
+ // Direct frontier model streaming with prompt caching
+ const response = await llmClient.stream(messages);`,
    },
    {
      id: "finops",
      title: "Architecture Balance Sheet",
      tag: "FinOps Drag Ledger",
      icon: DollarSign,
      color: "purple",
      headline: "Quantify the dollar cost of architectural inertia.",
      description:
        "Every outdated architecture choice costs real money. Premise aggregates cloud infrastructure spend and blended engineering maintenance hours into an executive balance sheet so technical debt gets prioritized with finance.",
      metric: "$31,200 / year",
      metricLabel: "Avg zombie infrastructure savings",
      codeSnippet: `FinOps Drag Ledger:
• ADR-014 (Redis Commit):   $1,183/mo cloud spend
• PR #892 (Manual Ingest):    $520/mo engineering drag
Total Realized Annual Savings: $31,200/yr`,
    },
    {
      id: "synthesizer",
      title: "Autonomous Sunset Synthesizer",
      tag: "Replacement ADR Generation",
      icon: Zap,
      color: "rose",
      headline: "Don't just delete old systems. Formulate the replacement.",
      description:
        "When an ADR breaches, Premise automatically drafts its replacement decision (e.g., transitioning from Redis Semantic Caching to Native Frontier Prompt Caching), complete with new telemetry probes and sunset milestones.",
      metric: "Instant ADR-015 Synthesis",
      metricLabel: "Replacement formulation",
      codeSnippet: `Synthesized Replacement ADR:
ID: ADR-015
Title: Direct Frontier Streaming + Prompt Caching
Status: PROMOTED (Replaces ADR-014)
Annual Savings: $31,200/yr`,
    },
    {
      id: "time-machine",
      title: "Time-Machine Backtester",
      tag: "Scenario Stress-Testing",
      icon: RefreshCw,
      color: "blue",
      headline: "Stress-test architecture against historical black swans.",
      description:
        "Replay 90-day market price wars, cloud vendor outages, and latency spikes across your portfolio. Premise computes quantitative resilience scores (0-100) and recommends safe threshold buffers before you ship to production.",
      metric: "94.2 Resilience Score",
      metricLabel: "Portfolio shock tolerance",
      codeSnippet: `Scenario Replay: "LLM Price War (-60% step cut)"
Trajectory: 90 steps evaluated
Breach Point: Day 42 (Upstream cost collapsed)
Optimal Threshold Adjustment: +14% safety buffer`,
    },
  ];

  return (
    <main className="h-screen overflow-y-auto overflow-x-hidden bg-zinc-950 text-zinc-100 selection:bg-cyan-500/20 selection:text-cyan-200 font-sans">
      {/* Background Ambient Glows & Grid */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-cyan-500/10 via-emerald-500/5 to-transparent blur-3xl opacity-80" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-gradient-to-t from-purple-500/10 to-transparent blur-3xl opacity-50" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* 1. TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Tag */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 flex items-center justify-center group-hover:border-cyan-400 transition-colors">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold font-mono tracking-wider text-zinc-100 group-hover:text-cyan-300 transition-colors">
                  PREMISE
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 text-zinc-400">
                  v3.0
                </span>
              </div>
              <p className="text-[10px] font-mono text-zinc-500 hidden sm:block">
                CI/CD for Architectural & Strategic Decisions
              </p>
            </div>
          </Link>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-mono text-zinc-400">
            <a href="#capabilities" className="hover:text-zinc-100 transition-colors">
              Capabilities
            </a>
            <a href="#simulator" className="hover:text-zinc-100 transition-colors">
              Live Simulator
            </a>
            <a href="#paradigm" className="hover:text-zinc-100 transition-colors">
              The Old Way vs Premise
            </a>
            <a href="#cli" className="hover:text-zinc-100 transition-colors">
              CLI & CI/CD
            </a>
            <a
              href="https://github.com/e-skora/premise"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-100 transition-colors flex items-center gap-1"
            >
              GitHub <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          </nav>

          {/* Right Action: Launch Live Demo & Guided Tour */}
          <div className="flex items-center gap-3">
            <Link
              href="/demo?tour=true"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-cyan-300 hover:text-cyan-200 border border-cyan-500/40 hover:border-cyan-400 font-mono text-xs transition-colors shadow-sm"
              title="Start 60-second interactive guided walkthrough tour of Premise"
            >
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Take Guided Tour (60s)</span>
            </Link>
            <Link
              href="/demo"
              className="relative group inline-flex items-center gap-2 px-4 py-2 rounded bg-gradient-to-r from-emerald-500 to-cyan-500 text-zinc-950 font-mono font-bold text-xs uppercase tracking-wider hover:brightness-110 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch Live Demo</span>
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-cyan-400 rounded-full animate-ping opacity-75" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative z-10 pt-16 sm:pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Eyebrow Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-700/80 text-xs font-mono text-zinc-300 mb-8 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-zinc-400">Automated Garbage Collection:</span>
          <span className="text-cyan-400 font-semibold">
            Horizon E Autonomous Sunset Synthesizer Active
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
        </div>

        {/* Main Headline */}
        <h1
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-zinc-100 max-w-5xl mx-auto leading-[1.1]"
          style={{ fontSize: "clamp(2.5rem, 1.8rem + 3.5vw, 4.75rem)" }}
        >
          Architectural Decisions Have an{" "}
          <span className="bg-gradient-to-r from-rose-400 via-amber-400 to-cyan-400 bg-clip-text text-transparent">
            Expiration Date.
          </span>
          <br className="hidden sm:inline" /> We Continuously Assert Them.
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-lg text-zinc-400 max-w-3xl mx-auto leading-relaxed">
          Stop paying for dead architecture. Premise turns ADRs, strategy memos, and vendor
          contracts into executable telemetry assertions—and autonomously opens teardown PRs the
          moment load-bearing assumptions break.
        </p>

        {/* Action Buttons */}
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/demo"
            className="w-full sm:w-auto px-7 py-3.5 rounded bg-emerald-400 text-zinc-950 font-mono font-bold text-sm uppercase tracking-wider hover:bg-emerald-300 transition-all shadow-[0_0_25px_rgba(52,211,153,0.35)] flex items-center justify-center gap-2 group"
          >
            <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
            <span>Launch Live Demo Control Plane</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/demo?tour=true"
            className="w-full sm:w-auto px-6 py-3.5 rounded bg-zinc-900 border border-cyan-500/50 text-cyan-300 font-mono text-sm hover:bg-zinc-850 hover:text-cyan-200 hover:border-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.15)] flex items-center justify-center gap-2"
          >
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>Take Guided Tour (60s)</span>
          </Link>

          <a
            href="#cli"
            className="w-full sm:w-auto px-6 py-3.5 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-300 font-mono text-sm hover:bg-zinc-800 hover:text-zinc-100 transition-colors flex items-center justify-center gap-2"
          >
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>bun ./bin/premise-cli.ts scan</span>
          </a>
        </div>

        {/* Social Proof / Stats Strip */}
        <div className="mt-14 pt-8 border-t border-zinc-800/80 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-left">
          <div className="p-3 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="text-2xl font-bold font-mono text-emerald-400">64 / 64</div>
            <div className="text-xs font-mono text-zinc-400">Automated Tests Passing</div>
          </div>
          <div className="p-3 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="text-2xl font-bold font-mono text-cyan-400">4 Connectors</div>
            <div className="text-xs font-mono text-zinc-400">Prometheus, Datadog, Slack, PagerDuty</div>
          </div>
          <div className="p-3 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="text-2xl font-bold font-mono text-amber-400">$31,200/yr</div>
            <div className="text-xs font-mono text-zinc-400">Average FinOps Drag Saved</div>
          </div>
          <div className="p-3 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="text-2xl font-bold font-mono text-purple-400">0-Touch</div>
            <div className="text-xs font-mono text-zinc-400">Autonomous Teardown PR Bot</div>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE HERO BREACH SIMULATOR (Try It In-Browser) */}
      <section id="simulator" className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
            Interactive Live Sandbox
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 mt-2">
            Simulate an Upstream Price Breach in Real Time
          </h2>
          <p className="text-sm text-zinc-400 max-w-2xl mx-auto mt-2">
            Drag the slider to alter upstream token pricing and see how Premise automatically detects
            decay, invalidates ADR-014, calculates the multi-hop cascade, and drafts the teardown diff.
          </p>
        </div>

        {/* The Live Interactive Sandbox Card */}
        <div className="bg-zinc-900/90 border border-zinc-700/80 rounded-xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          {/* Top Bar of Sandbox */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono font-bold text-cyan-400">
                ADR-14
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <span>Custom Semantic Caching Microservice</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                      isBreached
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse"
                        : isDecaying
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                    }`}
                  >
                    {isBreached ? "CRITICAL BREACH" : isDecaying ? "DECAY WARNING" : "VALID & OPTIMAL"}
                  </span>
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  Target Locus: packages/llm-gateway/src/semantic-cache.ts:L1-L30
                </p>
              </div>
            </div>

            <Link
              href="/demo"
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 group"
            >
              <span>Open in Full Control Plane</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Interactive Slider Area */}
          <div className="py-6 border-b border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Upstream Frontier LLM Input Cost (Telemetry Probe)</span>
                </label>
                <span className="font-mono text-sm font-bold text-zinc-100">
                  ${llmCost.toFixed(4)} / 1k tokens
                </span>
              </div>
              <input
                type="range"
                min="0.0005"
                max="0.0040"
                step="0.0001"
                value={llmCost}
                onChange={(e) => setLlmCost(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-2">
                <span>$0.0005 (Severe Price War)</span>
                <span className="text-amber-400 font-bold">Threshold Boundary: $0.0020</span>
                <span>$0.0040 (Legacy Baseline)</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                1-Click Simulation Shocks:
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLlmCost(0.0012)}
                  className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-rose-300 border border-zinc-700 hover:border-rose-500/50 transition-colors flex-1"
                >
                  Trigger Breach ($0.0012)
                </button>
                <button
                  type="button"
                  onClick={() => setLlmCost(0.0028)}
                  className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-emerald-300 border border-zinc-700 hover:border-emerald-500/50 transition-colors flex-1"
                >
                  Healthy ($0.0028)
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Reactive Diagnostic Pane */}
          <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Blast Radius & FinOps Drag */}
            <div className="space-y-4">
              <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Dynamic Blast Radius & Multi-Hop Cascade
              </h4>
              <div className="p-4 bg-zinc-950/80 rounded border border-zinc-800 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Breach Condition:</span>
                  <span className="font-bold text-zinc-200">
                    upstream_cost &gt;= $0.0020 (Current: ${llmCost.toFixed(4)})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Multi-Hop Domino:</span>
                  <span className={isBreached ? "text-rose-400 font-bold" : "text-emerald-400"}>
                    {isBreached ? "VENDOR-004 (Redis Enterprise) Flagged" : "All Dependents Green"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Realized FinOps Drag:</span>
                  <span className={isBreached ? "text-amber-400 font-bold" : "text-zinc-400"}>
                    {isBreached ? "$1,183/month ($14,200/year)" : "$0 / month"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Sunset Action:</span>
                  <span className="text-cyan-400 font-bold">
                    {isBreached ? "Synthesize ADR-015 + PR Bot Ready" : "Continuous Monitoring"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Unified Teardown Diff Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  {isBreached ? "Generated Teardown Diff (git apply ready)" : "Healthy Telemetry Active"}
                </h4>
                {isBreached && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    Auto-PR Ready
                  </span>
                )}
              </div>

              <div className="p-4 bg-zinc-950 rounded border border-zinc-800 font-mono text-[11px] leading-relaxed overflow-x-auto text-zinc-300">
                {isBreached ? (
                  <div>
                    <div className="text-zinc-500 mb-1">
                      --- a/packages/llm-gateway/src/semantic-cache.ts
                    </div>
                    <div className="text-zinc-500 mb-2">
                      +++ b/packages/llm-gateway/src/semantic-cache.ts
                    </div>
                    <div className="text-rose-400 bg-rose-950/20 px-1 py-0.5">
                      - import &#123; RedisCluster &#125; from &apos;@redis/client&apos;;
                    </div>
                    <div className="text-rose-400 bg-rose-950/20 px-1 py-0.5">
                      - const cache = new SemanticCacheClient(redisConfig);
                    </div>
                    <div className="text-rose-400 bg-rose-950/20 px-1 py-0.5">
                      - await cache.set(embedding, response, &#123; ttl: 86400 &#125;);
                    </div>
                    <div className="text-emerald-400 bg-emerald-950/20 px-1 py-0.5 mt-1">
                      + // ADR-015: Direct Frontier Streaming with Native Prompt Caching
                    </div>
                    <div className="text-emerald-400 bg-emerald-950/20 px-1 py-0.5">
                      + return await frontierClient.stream(&#123; messages, promptCache: true &#125;);
                    </div>
                  </div>
                ) : (
                  <div className="text-zinc-400 py-6 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <div>All load-bearing premises satisfied.</div>
                    <div className="text-[10px] text-zinc-500">
                      Drag the slider to the left to breach $0.0020 and watch the teardown diff generate.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SIX PILLARS OF PREMISE (Feature Highlights) */}
      <section id="capabilities" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-emerald-400">
            Core Engine Capabilities
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100 mt-2">
            The Complete Lifecycle of Architectural Decisions
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400">
            From natural language ingestion to automated code removal, Premise replaces forgotten
            markdown logs with live telemetry assertions.
          </p>
        </div>

        {/* Pillar Switcher Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pillars.map((pillar, idx) => {
            const IconComponent = pillar.icon;
            const isSelected = activePillar === idx;

            return (
              <div
                key={pillar.id}
                onClick={() => setActivePillar(idx)}
                className={`cursor-pointer rounded-xl p-6 border transition-all text-left ${
                  isSelected
                    ? "bg-zinc-900 border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/40"
                    : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/70"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded bg-zinc-800/80 border border-zinc-700 flex items-center justify-center">
                    <IconComponent className="w-5 h-5 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {pillar.tag}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-zinc-100">{pillar.title}</h3>
                <p className="text-xs font-semibold text-cyan-300 mt-1">{pillar.headline}</p>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{pillar.description}</p>

                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-500">{pillar.metricLabel}</span>
                  <span className="text-xs font-mono font-bold text-emerald-400">{pillar.metric}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Deep Dive Code Snippet */}
        <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono text-zinc-200">
                Active Pillar Output: {pillars[activePillar].title}
              </span>
            </div>
            <Link
              href="/demo"
              className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
            >
              Test in Demo Sandbox <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <pre className="font-mono text-xs text-zinc-300 leading-relaxed overflow-x-auto bg-zinc-950 p-4 rounded border border-zinc-800">
            {pillars[activePillar].codeSnippet}
          </pre>
        </div>
      </section>

      {/* 5. THE OLD WAY VS PREMISE (Paradigm Shift Table) */}
      <section id="paradigm" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-rose-400">
            Paradigm Shift
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100 mt-2">
            Static Markdown in Git vs. The Executable Premise Engine
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Why high-growth engineering teams ditch static architecture records for continuous
            assertion.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left: The Old Way */}
          <div className="bg-zinc-900/30 border border-rose-950/60 rounded-xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2 text-rose-400 font-mono font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>THE OLD WAY (Dead Markdown in /docs/adr)</span>
            </div>
            <ul className="space-y-4 text-xs font-mono text-zinc-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-rose-500 font-bold shrink-0">✕</span>
                <span>
                  <strong>Write and forget:</strong> ADR written in 2023, committed to git, and never
                  referenced again.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-500 font-bold shrink-0">✕</span>
                <span>
                  <strong>Silent economic decay:</strong> API prices fall 80%, but expensive cache
                  clusters continue running unnoticed.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-500 font-bold shrink-0">✕</span>
                <span>
                  <strong>Zero blast radius visibility:</strong> Nobody knows which microservices or
                  vendor contracts depend on old decisions.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-500 font-bold shrink-0">✕</span>
                <span>
                  <strong>Manual teardowns:</strong> Deprecation projects take months of architecture
                  council meetings and manual diff crafting.
                </span>
              </li>
            </ul>
          </div>

          {/* Right: The Premise Way */}
          <div className="bg-gradient-to-br from-emerald-950/30 via-zinc-900/60 to-cyan-950/30 border border-emerald-500/40 rounded-xl p-6 sm:p-8 space-y-5 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
            <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>THE PREMISE WAY (CI/CD for Decisions)</span>
            </div>
            <ul className="space-y-4 text-xs font-mono text-zinc-200 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span>
                  <strong>Continuous telemetry assertions:</strong> Natural language compiled into live
                  PromQL, Datadog v2, and SQL probes.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span>
                  <strong>Predictive drift detection:</strong> Linear regression forecaster warns teams
                  before constraints break.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span>
                  <strong>Multi-hop dependency graph:</strong> Upstream breaches instantly trace down
                  to vendor commitments and caller code.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span>
                  <strong>Autonomous GitHub PR Bot:</strong> Opens clean teardown branches with
                  git-apply unified diffs and replacement ADRs.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6. CLI & CI/CD PIPELINE SECTION */}
      <section id="cli" className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-base font-bold font-mono text-zinc-100">
                  Premise Executable CLI & GitHub Actions CI
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  Embed premise assertions in pull requests and fail the build on broken load-bearing
                  architecture.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyCli}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 flex items-center gap-1.5 transition-colors"
            >
              {copiedCli ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCli ? "Copied" : "Copy Command"}</span>
            </button>
          </div>

          {/* Terminal Window */}
          <div className="bg-zinc-950 rounded-lg p-5 border border-zinc-800 font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed">
            <div className="text-zinc-500 mb-2"># Run CLI assertion check in any repository</div>
            <div className="text-cyan-400 font-bold mb-4">
              $ bun ./bin/premise-cli.ts check --strict
            </div>
            <div className="text-zinc-400">
              ┌────────────────────────────────────────────────────────────────────────┐
            </div>
            <div className="text-zinc-300">
              │ PREMISE CI/CD ENGINE v3.0 // EVALUATING PORTFOLIO ASSERTIONS          │
            </div>
            <div className="text-zinc-400">
              ├────────────────────────────────────────────────────────────────────────┤
            </div>
            <div className="text-emerald-400">
              │ ✓ [VALID]    ADR-005 Pinecone Vector Index (qps &lt; 500)                 │
            </div>
            <div className="text-rose-400">
              │ ✗ [BROKEN]   ADR-014 Semantic Cache (cost &gt;= $0.0020, actual: $0.0018) │
            </div>
            <div className="text-amber-400">
              │ ⚠ [DECAY]    PR #892 Ephemeral Ingest (memory_usage: 84% &gt; 80% warn)   │
            </div>
            <div className="text-zinc-400">
              ├────────────────────────────────────────────────────────────────────────┤
            </div>
            <div className="text-rose-400 font-bold">
              │ Result: 1 Load-bearing premise broken. Exit code 1 triggered.          │
            </div>
            <div className="text-zinc-400">
              └────────────────────────────────────────────────────────────────────────┘
            </div>
          </div>
        </div>
      </section>

      {/* 7. BOTTOM CALL TO ACTION BANNER */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="bg-gradient-to-br from-cyan-950/40 via-zinc-900 to-emerald-950/40 border border-cyan-500/30 rounded-2xl p-8 sm:p-14 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-zinc-100">
            Stop Paying for Zombie Architecture.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-zinc-300 max-w-2xl mx-auto">
            Experience the interactive control plane, run real PromQL/Datadog probes, and watch
            autonomous teardown PR generation in action.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/demo"
              className="w-full sm:w-auto px-8 py-4 rounded bg-gradient-to-r from-emerald-400 to-cyan-400 text-zinc-950 font-mono font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all shadow-[0_0_30px_rgba(52,211,153,0.4)] flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Launch Live Interactive Demo</span>
            </Link>
            <a
              href="https://github.com/e-skora/premise"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-7 py-4 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono text-sm hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
            >
              <span>View GitHub Repository</span>
              <ExternalLink className="w-4 h-4 opacity-70" />
            </a>
          </div>

          <p className="mt-4 text-xs font-mono text-zinc-500">
            Zero sign-up required • Hosted on Cloudflare &amp; premise-ops.com
          </p>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="relative z-10 border-t border-zinc-800/80 bg-zinc-950 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Radio className="w-3 h-3 text-cyan-400" />
            </div>
            <span className="text-zinc-300 font-bold">PREMISE</span>
            <span>// premise-ops.com</span>
          </div>

          <div>CI/CD for Architectural &amp; Strategic Decisions • v3.0 Production</div>

          <div className="flex items-center gap-4 text-zinc-400">
            <Link href="/demo" className="hover:text-cyan-400 transition-colors">
              Live Demo
            </Link>
            <a
              href="https://github.com/e-skora/premise"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-cyan-400 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
