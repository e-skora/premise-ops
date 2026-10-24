"use client";

import React from "react";
import { TrendingDown, TrendingUp, Minus, AlertOctagon } from "lucide-react";
import { PremiseRecord } from "@/lib/types";
import { computeDriftForecast } from "@/lib/evaluator";

interface SparklineChartProps {
  premise: PremiseRecord;
}

export function SparklineChart({ premise }: SparklineChartProps) {
  const samples = premise.metricSamples || [];
  const threshold = Number(premise.thresholdValue);
  const current = Number(premise.currentValue);

  const forecast = computeDriftForecast(
    samples,
    premise.operator,
    premise.thresholdValue,
    premise.currentValue,
    premise.status
  );

  const values =
    samples.length >= 2
      ? samples.map((s) => s.value)
      : [current, current];

  const allNums = [...values, ...(Number.isNaN(threshold) ? [] : [threshold])];
  const minVal = Math.min(...allNums);
  const maxVal = Math.max(...allNums);
  const pad = Math.max((maxVal - minVal) * 0.18, 0.5);
  const lo = minVal - pad;
  const hi = maxVal + pad;
  const span = Math.max(hi - lo, 1e-6);

  const width = 260;
  const height = 46;

  const points = values
    .map((v, idx) => {
      const x =
        values.length === 1
          ? width / 2
          : (idx / (values.length - 1)) * (width - 8) + 4;
      const y = height - 5 - ((v - lo) / span) * (height - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const thresholdY = Number.isNaN(threshold)
    ? null
    : Math.max(
        3,
        Math.min(
          height - 3,
          height - 5 - ((threshold - lo) / span) * (height - 10)
        )
      );

  const strokeColor =
    premise.status === "BROKEN"
      ? "#f43f5e"
      : premise.status === "DECAYING"
      ? "#fbbf24"
      : "#10b981";

  const ttiBadgeStyle =
    forecast.trendDirection === "BREACHED"
      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
      : forecast.trendDirection === "DRIFTING_TOWARD_BREACH"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
      : "bg-zinc-900 text-zinc-400 border-zinc-800";

  return (
    <div className="p-2.5 bg-zinc-950 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Left: SVG Sparkline */}
      <div className="flex items-center gap-3">
        <div className="relative bg-zinc-900/60 border border-zinc-800 px-1.5 py-1">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="overflow-visible block"
          >
            {/* Dashed Threshold Reference Line */}
            {thresholdY !== null && (
              <line
                x1={0}
                y1={thresholdY}
                x2={width}
                y2={thresholdY}
                stroke="#f43f5e"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity={0.75}
              />
            )}

            {/* Telemetry Polyline */}
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.75"
              points={points}
            />

            {/* Latest Data Point Dot */}
            {values.length > 0 &&
              (() => {
                const lastVal = values[values.length - 1];
                const cx = width - 4;
                const cy =
                  height - 5 - ((lastVal - lo) / span) * (height - 10);
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill={strokeColor}
                    stroke="#09090b"
                    strokeWidth="1"
                  />
                );
              })()}
          </svg>
        </div>

        <div className="font-mono text-[10px] space-y-0.5">
          <div className="text-zinc-500 uppercase">
            TELEMETRY TRAJECTORY ({values.length} PTS)
          </div>
          <div className="text-zinc-300 flex items-center gap-1">
            {forecast.velocityPerSample < 0 ? (
              <TrendingDown className="w-3 h-3 text-sky-400" />
            ) : forecast.velocityPerSample > 0 ? (
              <TrendingUp className="w-3 h-3 text-amber-400" />
            ) : (
              <Minus className="w-3 h-3 text-zinc-500" />
            )}
            <span>
              Δ {forecast.velocityPerSample > 0 ? "+" : ""}
              {forecast.velocityPerSample} {premise.unit}/sample
            </span>
          </div>
          <div className="text-[9px] text-rose-400/80">
            --- Red dashed line = threshold ({premise.thresholdValue}{" "}
            {premise.unit})
          </div>
        </div>
      </div>

      {/* Right: Time-to-Invalidation (TTI) Forecast Badge */}
      <div className="flex flex-col sm:items-end justify-center shrink-0">
        <span className="text-[9px] font-mono uppercase text-zinc-500 mb-0.5">
          DRIFT FORECAST (TTI)
        </span>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 border font-semibold flex items-center gap-1 ${ttiBadgeStyle}`}
        >
          {forecast.trendDirection === "BREACHED" && (
            <AlertOctagon className="w-3 h-3 text-rose-400" />
          )}
          <span>{forecast.etaLabel}</span>
        </span>
      </div>
    </div>
  );
}
