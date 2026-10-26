"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Compass,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Zap,
  CheckCircle2,
  Radio,
  Layers,
  Activity,
  Sliders,
  FileCode2,
  GitBranch,
  DollarSign,
  Play,
  RotateCcw,
} from "lucide-react";

export interface TourStep {
  id: string;
  targetSelector: string;
  tag: string;
  title: string;
  description: string;
  insight: string;
  preferredPlacement?: "bottom" | "top" | "left" | "right";
  interactiveAction?: {
    label: string;
    action: () => void;
    icon?: React.ComponentType<{ className?: string }>;
  };
}

export interface WalkthroughTourProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulateBreach?: () => void;
  onSelectArtifact?: (artifactId: string) => void;
}

export function WalkthroughTour({
  isOpen,
  onClose,
  onSimulateBreach,
  onSelectArtifact,
}: WalkthroughTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const [actionTriggered, setActionTriggered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const steps: TourStep[] = [
    {
      id: "registry",
      targetSelector: '[data-tour="decision-registry"]',
      tag: "STEP 1 // ARCHITECTURAL CONTRACTS",
      title: "Living Architectural Contracts",
      description:
        "Premise transforms static ADRs, GitHub PRs, and Strategy Memos into living, executable contracts. Instead of rotting in stale markdown files, every decision is continuously asserted against real-time operational telemetry.",
      insight:
        "Static architecture docs lie. Premise ensures every constraint has an active, monitored pulse.",
      preferredPlacement: "right",
    },
    {
      id: "probes",
      targetSelector: '[data-tour="telemetry-probe"]',
      tag: "STEP 2 // LIVE TELEMETRY PROBES",
      title: "Real-Time PromQL & Metric Probes",
      description:
        "Every premise binds natural-language claims to live Prometheus/Thanos PromQL, Datadog v2 metrics, or SQLite telemetry. Here, ADR-014 requires LLM input token costs to stay below $0.0020/1k tokens to justify an expensive cache.",
      insight:
        "Drift velocity and Time-To-Invalidation (TTI) predict breaches days or weeks before they break production.",
      preferredPlacement: "bottom",
    },
    {
      id: "drift-slider",
      targetSelector: '[data-tour="reality-drift-slider"]',
      tag: "STEP 3 // CHAOS & REALITY DRIFT",
      title: "Simulate Reality Drift & Price Collapses",
      description:
        "What happens when frontier AI models cut prices by 70%, making our custom Semantic Cache economically wasteful? Drag the slider on screen or click the button below to inject a live telemetry shock and watch Premise detect the decay.",
      insight:
        "Interactive: Click 'Trigger 70% Price Shock' below to watch the live assertion trip from VALID to DECAYING to BROKEN!",
      preferredPlacement: "bottom",
      interactiveAction: onSimulateBreach
        ? {
            label: "⚡ Trigger 70% Price Shock Now",
            action: () => {
              onSimulateBreach();
              setActionTriggered(true);
            },
            icon: Zap,
          }
        : undefined,
    },
    {
      id: "cascades",
      targetSelector: '[data-tour="cascade-blast-radius"]',
      tag: "STEP 4 // MULTI-HOP CASCADES",
      title: "The Domino Effect & Blast Radius",
      description:
        "Architectural decisions don't live in isolation. When ADR-014 breaks, Premise instantly calculates the downstream blast radius—propagating failure to VENDOR-004 (Redis Enterprise $14.2k/mo commit) and dependent microservices.",
      insight:
        "Multi-hop cascade graphs prevent zombie vendor contracts and obsolete consumer callers before they cause outages.",
      preferredPlacement: "bottom",
    },
    {
      id: "locus",
      targetSelector: '[data-tour="locus-diff-viewer"]',
      tag: "STEP 5 // CODEBASE GARBAGE COLLECTION",
      title: "Workspace Locus & Unified Teardown Diffs",
      description:
        "Premise connects directly to real codebase files on disk (e.g. examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts) and synthesizes git-apply ready unified teardown diffs to cleanly rip out the obsolete abstraction with 1-click apply or rollback.",
      insight:
        "Automated garbage collection for dead code: Premise doesn't just alert—it authors the deletion diff.",
      preferredPlacement: "top",
    },
    {
      id: "dispatch",
      targetSelector: '[data-tour="teardown-dispatch"]',
      tag: "STEP 6 // AUTONOMOUS PR BOT & ALERTS",
      title: "Autonomous GitHub PRs & Kill-Switches",
      description:
        "With zero human friction, Premise cuts a dedicated git branch (premise/teardown-adr-014), drafts an architecture-grade GitHub Pull Request with Architecture Council signoff checklists, and dispatches Slack Block Kit cards and PagerDuty Events v2.",
      insight:
        "Eliminate meeting fatigue: the PR is already opened and staged when the team joins standup.",
      preferredPlacement: "left",
    },
    {
      id: "finops",
      targetSelector: '[data-tour="top-telemetry-controls"]',
      tag: "STEP 7 // EXECUTIVE FINOPS & TIME-MACHINE",
      title: "Architecture Balance Sheet & Backtesting",
      description:
        "Quantify the monthly dollar drag of zombie architecture ($1,703/mo in wasted cloud spend), formulate replacement ADRs automatically, and replay 90-day black swan market shocks using the Time-Machine Backtester.",
      insight:
        "Bridge the gap between engineering and finance by putting an exact dollar value on architectural debt.",
      preferredPlacement: "bottom",
    },
  ];

  const currentStep = steps[currentStepIndex] || steps[0];

  // Update target element rectangle & auto-scroll into view
  const updateTargetPosition = useCallback(() => {
    if (!isOpen) return;
    const targetElements = Array.from(
      document.querySelectorAll(currentStep.targetSelector)
    );
    const targetEl =
      targetElements.find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }) ||
      targetElements[0] ||
      null;

    if (targetEl) {
      // Smoothly scroll target into view if needed
      targetEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });

      const rect = targetEl.getBoundingClientRect();
      setTargetRect(rect);

      // Compute card position
      const cardWidth = 420;
      const cardHeight = 320;
      const margin = 16;
      const pad = 12;

      let top = 0;
      let left = 0;

      const placement = currentStep.preferredPlacement || "bottom";

      if (placement === "bottom") {
        top = rect.bottom + pad;
        left = rect.left + rect.width / 2 - cardWidth / 2;
      } else if (placement === "top") {
        top = rect.top - cardHeight - pad;
        left = rect.left + rect.width / 2 - cardWidth / 2;
      } else if (placement === "right") {
        top = rect.top + rect.height / 2 - cardHeight / 2;
        left = rect.right + pad;
      } else if (placement === "left") {
        top = rect.top + rect.height / 2 - cardHeight / 2;
        left = rect.left - cardWidth - pad;
      }

      // Viewport bounds clamping
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left + cardWidth > viewportWidth - margin) {
        left = viewportWidth - cardWidth - margin;
      }
      if (left < margin) {
        left = margin;
      }

      if (top + cardHeight > viewportHeight - margin) {
        top = viewportHeight - cardHeight - margin;
      }
      if (top < margin) {
        top = margin;
      }

      setCardPos({ top, left });
    } else {
      // Fallback: center card on screen
      setTargetRect(null);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const cardWidth = 420;
      const cardHeight = 320;
      setCardPos({
        top: Math.max(20, (viewportHeight - cardHeight) / 2),
        left: Math.max(20, (viewportWidth - cardWidth) / 2),
      });
    }
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (!isOpen) return;

    // Small delay to allow potential drawer animations or layout shifts
    const timer = setTimeout(() => {
      updateTargetPosition();
    }, 150);

    const handleResize = () => updateTargetPosition();
    const handleScroll = () => updateTargetPosition();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, currentStepIndex, updateTargetPosition]);

  // Keyboard Navigation: ArrowRight (Next), ArrowLeft (Prev), Escape (Close)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleFinishTour();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStepIndex]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      setActionTriggered(false);
    } else {
      handleFinishTour();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      setActionTriggered(false);
    }
  };

  const handleFinishTour = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("premise_walkthrough_completed", "true");
      } catch {
        // localStorage may be unavailable
      }
    }
    onClose();
  };

  const handleRestartTour = () => {
    setCurrentStepIndex(0);
    setActionTriggered(false);
  };

  if (!isOpen) return null;

  const spotlightPadding = 8;
  const isLastStep = currentStepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden select-none">
      {/* 1. SPOTLIGHT SVG OVERLAY */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 101 }}
      >
        <defs>
          <mask id="premise-spotlight-mask">
            {/* White covers the entire screen (opaque backdrop) */}
            <rect width="100%" height="100%" fill="white" />
            {/* Black cutout creates transparent hole over target element */}
            {targetRect && (
              <rect
                x={targetRect.x - spotlightPadding}
                y={targetRect.y - spotlightPadding}
                width={targetRect.width + spotlightPadding * 2}
                height={targetRect.height + spotlightPadding * 2}
                rx="8"
                ry="8"
                fill="black"
              />
            )}
          </mask>
        </defs>

        {/* Backdrop overlay utilizing the mask */}
        <rect
          width="100%"
          height="100%"
          fill="rgba(4, 7, 12, 0.78)"
          mask="url(#premise-spotlight-mask)"
          className="pointer-events-auto cursor-pointer"
          onClick={handleFinishTour}
        />

        {/* Animated glowing border around the cutout */}
        {targetRect && (
          <rect
            x={targetRect.x - spotlightPadding}
            y={targetRect.y - spotlightPadding}
            width={targetRect.width + spotlightPadding * 2}
            height={targetRect.height + spotlightPadding * 2}
            rx="8"
            ry="8"
            fill="none"
            stroke="rgb(6, 182, 212)"
            strokeWidth="2"
            strokeDasharray="6 4"
            className="animate-pulse"
          />
        )}
      </svg>

      {/* 2. THE FLOATING POPOVER CARD */}
      <div
        ref={cardRef}
        style={{
          zIndex: 102,
          top: cardPos ? `${cardPos.top}px` : "50%",
          left: cardPos ? `${cardPos.left}px` : "50%",
          transform: cardPos ? "none" : "translate(-50%, -50%)",
        }}
        className="fixed w-[420px] max-w-[calc(100vw-32px)] bg-zinc-950/95 border border-cyan-500/60 rounded-lg shadow-[0_0_40px_rgba(6,182,212,0.22)] backdrop-blur-md overflow-hidden text-zinc-100 transition-all duration-200"
      >
        {/* Top Header Bar */}
        <div className="px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
              <Compass className="w-3 h-3 text-cyan-400 animate-spin-slow" />
            </div>
            <span className="text-[10px] font-mono font-bold tracking-wider text-cyan-300 uppercase">
              {currentStep.tag}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-400">
              {currentStepIndex + 1} of {steps.length}
            </span>
            <button
              type="button"
              onClick={handleFinishTour}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
              title="Close Walkthrough (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3.5">
          <div>
            <h3 className="text-sm font-bold font-mono text-zinc-100 flex items-center gap-1.5">
              <span>{currentStep.title}</span>
            </h3>
            <p className="mt-1 text-xs font-mono text-zinc-300 leading-relaxed">
              {currentStep.description}
            </p>
          </div>

          {/* Key Insight Callout */}
          <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono text-zinc-300 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{currentStep.insight}</span>
          </div>

          {/* Interactive Step Trigger (Step 3: Price Shock) */}
          {currentStep.interactiveAction && (
            <div className="pt-1">
              <button
                type="button"
                onClick={currentStep.interactiveAction.action}
                className={`w-full py-2 px-3 rounded text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm ${
                  actionTriggered
                    ? "bg-rose-500/20 border border-rose-500/60 text-rose-300"
                    : "bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-95"
                }`}
              >
                {actionTriggered ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-rose-300" />
                    <span>Breach Injected! Telemetry Shifted</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>{currentStep.interactiveAction.label}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="px-4 py-2.5 bg-zinc-900/70 border-t border-zinc-800 flex items-center justify-between gap-2">
          {/* Step Dots */}
          <div className="flex items-center gap-1.5">
            {steps.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setCurrentStepIndex(idx);
                  setActionTriggered(false);
                }}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentStepIndex
                    ? "w-4 bg-cyan-400"
                    : idx < currentStepIndex
                    ? "bg-emerald-500/70"
                    : "bg-zinc-700 hover:bg-zinc-500"
                }`}
                title={`Jump to step ${idx + 1}: ${s.title}`}
              />
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFinishTour}
              className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 px-2 py-1 transition-colors"
            >
              Skip
            </button>

            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-2.5 py-1 text-xs font-mono rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1 transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="px-3 py-1 text-xs font-mono font-bold rounded bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-zinc-950 flex items-center gap-1 shadow-sm transition-all active:scale-95"
            >
              <span>{isLastStep ? "Finish Tour" : "Next"}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Bottom Progress Bar */}
        <div className="h-0.5 w-full bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
            style={{
              width: `${((currentStepIndex + 1) / steps.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
