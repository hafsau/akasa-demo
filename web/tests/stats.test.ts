import { describe, expect, it } from "vitest";
import { atThreshold, bootRatio, bootRate, pct } from "@/lib/stats";
import type { Row } from "@/lib/types";

function row(over: Partial<Row>): Row {
  return {
    id: "x", title: "", summary: "", family: "pneumonia", hero: false, traps: [], gold_route: "autonomous",
    gold_drg: "195", pred_drg: "195", gold_weight: 0.68, pred_weight: 0.68, confidence: 0.9, tp: 5, fp: 0, fn: 0,
    fp_codes: [], fn_codes: [], cc_tp: 0, cc_fp: 0, cc_fn: 0, pdx_ok: true, drg_ok: true, overcoded: false,
    undercoded: false, invalid_codes: [], citations: 10, citations_located: 10, queries: 0, queries_lint_clean: 0,
    cost_usd: 0.1, ms: 1000, ...over,
  };
}

describe("bootRatio", () => {
  const rows = [row({ tp: 9, fp: 1 }), row({ tp: 4, fp: 1 }), row({ tp: 5, fp: 0 })];

  it("is the micro-average sum(num)/sum(den)", () => {
    expect(bootRatio(rows, (r) => r.tp, (r) => r.tp + r.fp)[0]).toBeCloseTo(18 / 20);
  });

  it("returns an interval that contains the point and is stable across calls", () => {
    const a = bootRatio(rows, (r) => r.tp, (r) => r.tp + r.fp);
    const b = bootRatio(rows, (r) => r.tp, (r) => r.tp + r.fp);
    expect(a[1]).toBeLessThanOrEqual(a[0]);
    expect(a[2]).toBeGreaterThanOrEqual(a[0]);
    expect(a).toEqual(b);
  });

  it("is NaN on no rows instead of throwing", () => {
    expect(bootRatio([], () => 1, () => 1).every(Number.isNaN)).toBe(true);
  });
});

describe("atThreshold", () => {
  const rows = [
    row({ id: "a", confidence: 0.95 }),
    row({ id: "b", confidence: 0.85, gold_route: "coder" }),
    row({ id: "c", confidence: 0.3, gold_route: "coder" }),
    row({ id: "d", confidence: 0.6, overcoded: true }),
  ];

  it("splits at the threshold, inclusive", () => {
    const v = atThreshold(rows, 0.85);
    expect(v.auto.map((r) => r.id)).toEqual(["a", "b"]);
    expect(v.held.map((r) => r.id)).toEqual(["c", "d"]);
    expect(v.autonomy).toBe(0.5);
  });

  it("counts escapes: auto-coded stays the key says needed a human", () => {
    expect(atThreshold(rows, 0.8).escaped.map((r) => r.id)).toEqual(["b"]);
    expect(atThreshold(rows, 0.8).escapeRate).toBe(0.5);
    expect(atThreshold(rows, 0.9).escaped).toEqual([]);
  });

  it("over-coding only counts stays that were auto-coded", () => {
    expect(atThreshold(rows, 0.9).overcoding[0]).toBe(0);
    expect(atThreshold(rows, 0.5).overcoding[0]).toBeCloseTo(1 / 3);
  });
});

describe("pct", () => {
  it("formats and survives NaN", () => {
    expect(pct(0.905, 1)).toBe("90.5%");
    expect(pct(NaN)).toBe("–");
    expect(bootRate([], () => true)[0]).toBeNaN();
  });
});
