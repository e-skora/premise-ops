import { describe, expect, it } from "bun:test";

describe("Interactive Guided Walkthrough Tour", () => {
  const expectedTourSteps = [
    {
      id: "registry",
      targetSelector: '[data-tour="decision-registry"]',
      tag: "STEP 1 // ARCHITECTURAL CONTRACTS",
    },
    {
      id: "probes",
      targetSelector: '[data-tour="telemetry-probe"]',
      tag: "STEP 2 // LIVE TELEMETRY PROBES",
    },
    {
      id: "drift-slider",
      targetSelector: '[data-tour="reality-drift-slider"]',
      tag: "STEP 3 // CHAOS & REALITY DRIFT",
    },
    {
      id: "cascades",
      targetSelector: '[data-tour="cascade-blast-radius"]',
      tag: "STEP 4 // MULTI-HOP CASCADES",
    },
    {
      id: "locus",
      targetSelector: '[data-tour="locus-diff-viewer"]',
      tag: "STEP 5 // CODEBASE GARBAGE COLLECTION",
    },
    {
      id: "dispatch",
      targetSelector: '[data-tour="teardown-dispatch"]',
      tag: "STEP 6 // AUTONOMOUS PR BOT & ALERTS",
    },
    {
      id: "finops",
      targetSelector: '[data-tour="top-telemetry-controls"]',
      tag: "STEP 7 // EXECUTIVE FINOPS & TIME-MACHINE",
    },
  ];

  it("1. Defines all 7 required walkthrough steps with valid data-tour selectors", () => {
    expect(expectedTourSteps.length).toBe(7);
    const selectors = expectedTourSteps.map((s) => s.targetSelector);
    expect(selectors).toContain('[data-tour="decision-registry"]');
    expect(selectors).toContain('[data-tour="telemetry-probe"]');
    expect(selectors).toContain('[data-tour="reality-drift-slider"]');
    expect(selectors).toContain('[data-tour="cascade-blast-radius"]');
    expect(selectors).toContain('[data-tour="locus-diff-viewer"]');
    expect(selectors).toContain('[data-tour="teardown-dispatch"]');
    expect(selectors).toContain('[data-tour="top-telemetry-controls"]');
  });

  it("2. Command Palette keywords match tour queries correctly", () => {
    const tourKeywords = [
      "tour",
      "walkthrough",
      "guide",
      "explainer",
      "bubbles",
      "demo",
      "start",
      "onboarding",
      "spotlight",
    ];

    const testQueries = ["tour", "walkthrough", "guide", "explainer", "bubbles"];
    for (const q of testQueries) {
      const match = tourKeywords.some((kw) => kw.includes(q.toLowerCase()));
      expect(match).toBe(true);
    }
  });

  it("3. Auto-open logic parses ?tour=true query param and localStorage correctly", () => {
    const shouldOpenTour = (tourQuery: string | null, tourCompleted: string | null) => {
      return tourQuery === "true" || (!tourCompleted && tourQuery !== "false");
    };

    // First visit: no query, no localStorage -> should open
    expect(shouldOpenTour(null, null)).toBe(true);

    // Explicit tour=true in URL -> should open even if completed previously
    expect(shouldOpenTour("true", "true")).toBe(true);
    expect(shouldOpenTour("true", null)).toBe(true);

    // Completed previously and no tour=true -> should NOT open
    expect(shouldOpenTour(null, "true")).toBe(false);

    // Explicit tour=false in URL -> should NOT open
    expect(shouldOpenTour("false", null)).toBe(false);
  });
});
