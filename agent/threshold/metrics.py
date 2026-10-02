"""Scoring: compare recorded runs to the answer keys, with bootstrap CIs.

Per-case facts are computed once (`score_case`); every aggregate is a
function of those facts, so the website can recompute any threshold live
from the same per-case rows the CI gate uses.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from .cases import Case
from .grouper import FAMILIES, severity

SEED = 7
N_BOOT = 2000


def _gold_weight(case: Case) -> float | None:
    for _, drgs in FAMILIES.values():
        for d in drgs.values():
            if d.number == case.gold.drg:
                return d.weight
    return None


def score_case(case: Case, run: dict[str, Any]) -> dict[str, Any]:
    gold_codes = {case.gold.pdx, *(s.code for s in case.gold.secondary)}
    gold_ccmcc = {s.code for s in case.gold.secondary if severity(s.code) != "none"}
    pred_rows = run["codes"]
    pred_codes = {r["code"] for r in pred_rows}
    pred_pdx = next((r["code"] for r in pred_rows if r["role"] == "pdx"), None)
    pred_ccmcc = {r["code"] for r in pred_rows if r["role"] == "secondary" and severity(r["code"]) != "none"}
    invalid = [r["code"] for r in pred_rows if r.get("valid") is False]
    gw = _gold_weight(case)
    pw = run["drg"].get("weight")
    citations = run.get("findings", [])
    return {
        "id": case.id,
        "title": case.title,
        "summary": case.summary,
        "family": case.family,
        "hero": case.hero,
        "traps": case.gold.traps,
        "gold_route": case.gold.route,
        "gold_drg": case.gold.drg,
        "pred_drg": run["drg"].get("number"),
        "gold_weight": gw,
        "pred_weight": pw,
        "confidence": run["confidence"],
        "tp": len(pred_codes & gold_codes),
        "fp": len(pred_codes - gold_codes),
        "fn": len(gold_codes - pred_codes),
        "fp_codes": sorted(pred_codes - gold_codes),
        "fn_codes": sorted(gold_codes - pred_codes),
        "cc_tp": len(pred_ccmcc & gold_ccmcc),
        "cc_fp": len(pred_ccmcc - gold_ccmcc),
        "cc_fn": len(gold_ccmcc - pred_ccmcc),
        "pdx_ok": pred_pdx == case.gold.pdx,
        "drg_ok": run["drg"].get("number") == case.gold.drg,
        "overcoded": bool(gw and pw and pw > gw + 1e-9),
        "undercoded": bool(gw and pw and pw < gw - 1e-9),
        "invalid_codes": invalid,
        "citations": len(citations),
        "citations_located": sum(1 for f in citations if f.get("start") is not None),
        "queries": len(run.get("queries", [])),
        "queries_lint_clean": sum(1 for q in run.get("queries", []) if not q.get("lint")),
        "cost_usd": run["cost_usd"],
        "ms": run["ms"],
    }


def _ratio(num: np.ndarray, den: np.ndarray) -> float:
    d = den.sum()
    return float(num.sum() / d) if d else float("nan")


def _boot(rows: list[dict], num_key: str, den_fn, rng: np.random.Generator) -> tuple[float, float, float]:
    """Micro-averaged ratio with a case-level bootstrap 95% CI."""
    if not rows:
        return (float("nan"),) * 3
    num = np.array([r[num_key] for r in rows], dtype=float)
    den = np.array([den_fn(r) for r in rows], dtype=float)
    point = _ratio(num, den)
    idx = rng.integers(0, len(rows), size=(N_BOOT, len(rows)))
    samples = [_ratio(num[i], den[i]) for i in idx]
    samples = [s for s in samples if not math.isnan(s)]
    lo, hi = (np.percentile(samples, [2.5, 97.5]) if samples else (float("nan"), float("nan")))
    return point, float(lo), float(hi)


def _rate(rows: list[dict], key: str, rng: np.random.Generator) -> tuple[float, float, float]:
    if not rows:
        return (float("nan"),) * 3
    vals = np.array([float(bool(r[key])) for r in rows])
    idx = rng.integers(0, len(rows), size=(N_BOOT, len(rows)))
    s = vals[idx].mean(axis=1)
    return float(vals.mean()), float(np.percentile(s, 2.5)), float(np.percentile(s, 97.5))


def summarize(rows: list[dict], threshold: float | None = None) -> dict[str, Any]:
    rng = np.random.default_rng(SEED)
    auto = rows if threshold is None else [r for r in rows if r["confidence"] >= threshold]
    held = [] if threshold is None else [r for r in rows if r["confidence"] < threshold]
    out: dict[str, Any] = {
        "n": len(rows),
        "n_auto": len(auto),
        "autonomy": len(auto) / len(rows) if rows else 0,
        "code_precision": _boot(auto, "tp", lambda r: r["tp"] + r["fp"], rng),
        "code_recall": _boot(auto, "tp", lambda r: r["tp"] + r["fn"], rng),
        "ccmcc_precision": _boot(auto, "cc_tp", lambda r: r["cc_tp"] + r["cc_fp"], rng),
        "ccmcc_recall": _boot(auto, "cc_tp", lambda r: r["cc_tp"] + r["cc_fn"], rng),
        "drg_match": _rate(auto, "drg_ok", rng),
        "pdx_accuracy": _rate(auto, "pdx_ok", rng),
        "overcoding_rate": _rate(auto, "overcoded", rng),
        "undercoding_rate": _rate(auto, "undercoded", rng),
        "invalid_code_rate": sum(len(r["invalid_codes"]) for r in auto) / max(1, sum(r["tp"] + r["fp"] for r in auto)),
    }
    if threshold is not None:
        needs_human = [r for r in rows if r["gold_route"] == "coder"]
        escaped = [r for r in auto if r["gold_route"] == "coder"]
        out["escaped"] = len(escaped)
        out["escape_rate"] = len(escaped) / len(needs_human) if needs_human else 0.0
        out["held_needlessly"] = len([r for r in held if r["gold_route"] == "autonomous"])
    costs = np.array([r["cost_usd"] for r in rows])
    ms = np.array([r["ms"] for r in rows])
    out["cost_mean"] = float(costs.mean()) if len(costs) else 0
    out["latency_p50_ms"] = float(np.percentile(ms, 50)) if len(ms) else 0
    out["latency_p95_ms"] = float(np.percentile(ms, 95)) if len(ms) else 0
    return out


def sweep(rows: list[dict]) -> list[dict[str, Any]]:
    out = []
    for t in np.round(np.arange(0, 1.0001, 0.05), 2):
        s = summarize(rows, float(t))
        out.append({"threshold": float(t), "autonomy": s["autonomy"], "code_precision": s["code_precision"][0],
                    "drg_match": s["drg_match"][0], "escape_rate": s["escape_rate"],
                    "overcoding_rate": s["overcoding_rate"][0]})
    return out


def error_taxonomy(cases: dict[str, Case], rows: list[dict]) -> list[dict[str, Any]]:
    """Group misses by the case's trap so error analysis points at a cause."""
    buckets: dict[str, dict[str, Any]] = {}
    for r in rows:
        if r["fp"] == 0 and r["fn"] == 0 and r["drg_ok"]:
            continue
        keys = r["traps"] or ["no_trap"]
        for k in keys:
            b = buckets.setdefault(k, {"trap": k, "cases": [], "fp": 0, "fn": 0, "drg_miss": 0})
            b["cases"].append(r["id"])
            b["fp"] += r["fp"]
            b["fn"] += r["fn"]
            b["drg_miss"] += int(not r["drg_ok"])
    return sorted(buckets.values(), key=lambda b: -(b["fp"] + b["fn"] + 3 * b["drg_miss"]))


def load_runs(dir_: Path) -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text()) for p in sorted(dir_.glob("*.json"))}
