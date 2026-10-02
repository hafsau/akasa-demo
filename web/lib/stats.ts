import type { Interval, Row } from "./types";

/** Small seeded PRNG (mulberry32) so the CI on screen is stable between renders. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Micro-averaged ratio sum(num)/sum(den) over cases, with a case-level
 * percentile bootstrap 95% CI. Mirrors agent/threshold/metrics.py.
 */
export function bootRatio(
  rows: readonly Row[],
  num: (r: Row) => number,
  den: (r: Row) => number,
  iters = 1000,
  seed = 7,
): Interval {
  if (!rows.length) return [NaN, NaN, NaN];
  const n = rows.map(num);
  const d = rows.map(den);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const point = sum(d) ? sum(n) / sum(d) : NaN;
  const rand = rng(seed);
  const samples: number[] = [];
  for (let i = 0; i < iters; i++) {
    let sn = 0;
    let sd = 0;
    for (let j = 0; j < rows.length; j++) {
      const k = Math.floor(rand() * rows.length);
      sn += n[k];
      sd += d[k];
    }
    if (sd) samples.push(sn / sd);
  }
  samples.sort((a, b) => a - b);
  return [point, quantile(samples, 0.025), quantile(samples, 0.975)];
}

export function bootRate(rows: readonly Row[], pred: (r: Row) => boolean, iters = 1000, seed = 7): Interval {
  return bootRatio(rows, (r) => (pred(r) ? 1 : 0), () => 1, iters, seed);
}

export interface ThresholdView {
  auto: Row[];
  held: Row[];
  autonomy: number;
  precision: Interval;
  drgMatch: Interval;
  overcoding: Interval;
  escaped: Row[];
  escapeRate: number;
}

export function atThreshold(rows: readonly Row[], t: number): ThresholdView {
  const auto = rows.filter((r) => r.confidence >= t);
  const held = rows.filter((r) => r.confidence < t);
  const needsHuman = rows.filter((r) => r.gold_route === "coder");
  const escaped = auto.filter((r) => r.gold_route === "coder");
  return {
    auto,
    held,
    autonomy: rows.length ? auto.length / rows.length : 0,
    precision: bootRatio(auto, (r) => r.tp, (r) => r.tp + r.fp),
    drgMatch: bootRate(auto, (r) => r.drg_ok),
    overcoding: bootRate(auto, (r) => r.overcoded),
    escaped,
    escapeRate: needsHuman.length ? escaped.length / needsHuman.length : 0,
  };
}

export const pct = (x: number, digits = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : "–");
