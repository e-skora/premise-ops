import {
  DecisionArtifactRecord,
  FinOpsArtifactBreakdown,
  FinOpsLedgerSummary,
  FinOpsOptions,
  InvalidationEventRecord,
} from "./types";

export const DEFAULT_BLENDED_HOURLY_ENG_RATE_USD = 150;
export const DEFAULT_DAYS_PER_MONTH = 30;

/**
 * Calculates financial drag metrics for an individual DecisionArtifact.
 */
export function calculateArtifactDrag(
  artifact: DecisionArtifactRecord,
  isPatched?: boolean,
  options?: FinOpsOptions
): FinOpsArtifactBreakdown {
  const hourlyRate =
    options?.blendedHourlyEngRateUsd ?? DEFAULT_BLENDED_HOURLY_ENG_RATE_USD;
  const daysPerMonth = options?.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH;

  const monthlyCloudSpendUsd = Number(artifact.monthlyCloudSpendUsd || 0);
  const maintenanceHoursPerMonth = Number(
    artifact.maintenanceHoursPerMonth || 0
  );
  const blendedEngCostMonthlyUsd = maintenanceHoursPerMonth * hourlyRate;
  const totalMonthlyDragUsd = monthlyCloudSpendUsd + blendedEngCostMonthlyUsd;
  const dailyDragUsd =
    daysPerMonth > 0 ? Number((totalMonthlyDragUsd / daysPerMonth).toFixed(2)) : 0;
  const annualizedDragUsd = Number((totalMonthlyDragUsd * 12).toFixed(2));

  const isDecaying =
    artifact.status === "AT_RISK" ||
    (artifact.premises || []).some((p) => p.status === "DECAYING");
  const isBroken =
    artifact.status === "INVALIDATED" ||
    (artifact.premises || []).some((p) => p.status === "BROKEN");

  const storedSavings = Number(artifact.realizedAnnualSavingsUsd || 0);
  const isTeardownApplied = Boolean(isPatched || storedSavings > 0);
  const realizedAnnualSavingsUsd = isTeardownApplied
    ? storedSavings > 0
      ? storedSavings
      : annualizedDragUsd
    : 0;

  return {
    artifactId: artifact.id,
    title: artifact.title,
    type: artifact.type,
    status: artifact.status,
    targetLocus: artifact.targetLocus,
    monthlyCloudSpendUsd,
    maintenanceHoursPerMonth,
    blendedEngCostMonthlyUsd,
    totalMonthlyDragUsd,
    dailyDragUsd,
    annualizedDragUsd,
    isDecaying,
    isBroken,
    isTeardownApplied,
    realizedAnnualSavingsUsd,
    cascadedFromId: artifact.cascadedFromId || null,
  };
}

/**
 * Calculates decision-wide FinOps Ledger Drag & Balance Sheet Summary.
 * Computes ongoing monthly burn of broken/decaying premises, daily drag,
 * and cumulative annual savings of applied teardowns.
 */
export function calculateFinOpsLedger(
  artifacts: DecisionArtifactRecord[],
  events?: InvalidationEventRecord[],
  options?: FinOpsOptions,
  patchedLociSet?: Set<string>
): FinOpsLedgerSummary {
  const hourlyRate =
    options?.blendedHourlyEngRateUsd ?? DEFAULT_BLENDED_HOURLY_ENG_RATE_USD;
  const daysPerMonth = options?.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH;

  const breakdowns: FinOpsArtifactBreakdown[] = artifacts.map((art) => {
    const isPatched =
      patchedLociSet && art.targetLocus
        ? patchedLociSet.has(art.targetLocus) ||
          Array.from(patchedLociSet).some((locus) =>
            art.targetLocus.startsWith(locus) || locus.startsWith(art.targetLocus)
          )
        : false;
    return calculateArtifactDrag(art, isPatched, options);
  });

  let activeInvalidationMonthlyDragUsd = 0;
  let activeDecayingMonthlyDragUsd = 0;
  let cumulativeAnnualSavingsUsd = 0;
  let wastedEngHoursPerMonth = 0;
  let freedEngHoursPerYear = 0;
  let appliedTeardownsCount = 0;
  let invalidatedDecisionsCount = 0;
  let decayingDecisionsCount = 0;
  let healthyDecisionsCount = 0;

  for (const b of breakdowns) {
    if (b.isTeardownApplied) {
      appliedTeardownsCount++;
      cumulativeAnnualSavingsUsd += b.realizedAnnualSavingsUsd;
      freedEngHoursPerYear += b.maintenanceHoursPerMonth * 12;
    } else if (b.isBroken) {
      invalidatedDecisionsCount++;
      activeInvalidationMonthlyDragUsd += b.totalMonthlyDragUsd;
      wastedEngHoursPerMonth += b.maintenanceHoursPerMonth;
    } else if (b.isDecaying) {
      decayingDecisionsCount++;
      activeDecayingMonthlyDragUsd += b.totalMonthlyDragUsd;
      wastedEngHoursPerMonth += b.maintenanceHoursPerMonth;
    } else {
      healthyDecisionsCount++;
    }
  }

  // Account for any InvalidationEvents with explicit realized savings
  if (events) {
    for (const ev of events) {
      if (ev.realizedAnnualSavingsUsd && ev.realizedAnnualSavingsUsd > 0) {
        // If not already counted in artifact breakdown
        const matched = breakdowns.find((b) => b.artifactId === ev.artifactId);
        if (!matched || !matched.isTeardownApplied) {
          cumulativeAnnualSavingsUsd += Number(ev.realizedAnnualSavingsUsd);
        }
      }
    }
  }

  const totalActiveDragMonthlyUsd = Number(
    (activeInvalidationMonthlyDragUsd + activeDecayingMonthlyDragUsd).toFixed(2)
  );
  const totalActiveDragDailyUsd =
    daysPerMonth > 0
      ? Number((totalActiveDragMonthlyUsd / daysPerMonth).toFixed(2))
      : 0;
  const cumulativeMonthlySavingsUsd = Number(
    (cumulativeAnnualSavingsUsd / 12).toFixed(2)
  );

  return {
    totalTrackedDecisions: artifacts.length,
    invalidatedDecisionsCount,
    decayingDecisionsCount,
    healthyDecisionsCount,
    appliedTeardownsCount,
    activeInvalidationMonthlyDragUsd: Number(
      activeInvalidationMonthlyDragUsd.toFixed(2)
    ),
    activeDecayingMonthlyDragUsd: Number(
      activeDecayingMonthlyDragUsd.toFixed(2)
    ),
    totalActiveDragMonthlyUsd,
    totalActiveDragDailyUsd,
    cumulativeAnnualSavingsUsd: Number(cumulativeAnnualSavingsUsd.toFixed(2)),
    cumulativeMonthlySavingsUsd,
    wastedEngHoursPerMonth: Number(wastedEngHoursPerMonth.toFixed(1)),
    freedEngHoursPerYear: Number(freedEngHoursPerYear.toFixed(1)),
    blendedHourlyEngRateUsd: hourlyRate,
    artifacts: breakdowns,
  };
}

/**
 * Formats a currency amount into a clean, human-readable string.
 */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
