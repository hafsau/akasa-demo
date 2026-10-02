"""Score recorded runs and export everything the website needs.

    uv run python export.py

Reads  ../evals/cases/*.json and ../evals/runs/{agent,baseline,agent-v*}/*.json
Writes ../web/data/eval.json            (summaries, sweep, ablation, history, taxonomy)
       ../web/data/encounters.json      (per-case rows for the threshold view)
       ../web/data/encounters/<id>.json (chart + answer key + full agent trace)
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from threshold.cases import Case, load_all
from threshold.metrics import error_taxonomy, load_runs, score_case, summarize, sweep
from threshold.pipeline import PROMPT_VERSION

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "evals" / "runs"
WEB = ROOT / "web" / "data"
DEFAULT_THRESHOLD = 0.8


def build(
    cases: dict[str, Case],
    agent_runs: dict[str, dict],
    base_runs: dict[str, dict],
    history: dict[str, dict[str, dict]],
    threshold: float = DEFAULT_THRESHOLD,
) -> tuple[dict[str, Any], dict[str, list[dict]]]:
    """Pure: runs in, (eval document, per-case rows) out."""
    ids = [i for i in cases if i in agent_runs]
    agent_rows = [score_case(cases[i], agent_runs[i]) for i in ids]
    base_rows = [score_case(cases[i], base_runs[i]) for i in ids if i in base_runs]

    versions = []
    for name, runs in sorted(history.items()):
        rows = [score_case(cases[i], runs[i]) for i in ids if i in runs]
        if rows:
            versions.append({"version": name, "all": summarize(rows), "at_default": summarize(rows, threshold),
                             "sweep": sweep(rows)})
    versions.append({"version": "current", "all": summarize(agent_rows),
                     "at_default": summarize(agent_rows, threshold), "sweep": sweep(agent_rows)})

    doc = {
        "generated": datetime.now(UTC).date().isoformat(),
        "prompt_version": PROMPT_VERSION,
        "default_threshold": threshold,
        "agent": {"all": summarize(agent_rows), "at_default": summarize(agent_rows, threshold)},
        "baseline": {"all": summarize(base_rows), "at_default": summarize(base_rows, threshold)} if base_rows else None,
        "sweep": {"agent": sweep(agent_rows), "baseline": sweep(base_rows) if base_rows else []},
        "history": versions,
        "taxonomy": error_taxonomy(cases, agent_rows),
        "stage_costs": _stage_costs({i: agent_runs[i] for i in ids}),
        "retries": _retries({i: agent_runs[i] for i in ids}),
    }
    return doc, {"agent": agent_rows, "baseline": base_rows}


def _clean(x: Any) -> Any:
    if isinstance(x, float) and math.isnan(x):
        return None
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    return x


def dumps(x: Any) -> str:
    """Strict JSON for the browser: NaN (no stays above a threshold) becomes null."""
    return json.dumps(_clean(x), indent=1, allow_nan=False, default=str)


def main() -> None:
    cases = {c.id: c for c in load_all()}
    agent_runs = load_runs(RUNS / "agent")
    base_runs = load_runs(RUNS / "baseline")
    history = {p.name.removeprefix("agent-"): load_runs(p) for p in sorted(RUNS.glob("agent-v*"))}
    doc, rows = build(cases, agent_runs, base_runs, history)

    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "encounters").mkdir(exist_ok=True)
    (WEB / "eval.json").write_text(dumps(doc))
    (WEB / "encounters.json").write_text(dumps(rows))
    for r in rows["agent"]:
        i = r["id"]
        (WEB / "encounters" / f"{i}.json").write_text(dumps(
            {"case": cases[i].model_dump(), "run": agent_runs[i], "baseline": base_runs.get(i), "score": r}))

    for name, s in [("agent", doc["agent"]), ("baseline", doc["baseline"])]:
        if not s:
            continue
        a = s["at_default"]
        print(f"{name:8s} n={a['n']} autonomy={a['autonomy']:.0%} precision={a['code_precision'][0]:.3f} "
              f"drg={a['drg_match'][0]:.2f} overcode={a['overcoding_rate'][0]:.2f} escaped={a['escaped']}")
    for h in doc["history"]:
        a = h["at_default"]
        print(f"  history {h['version']:8s} autonomy={a['autonomy']:.0%} escaped={a['escaped']} "
              f"held_needlessly={a['held_needlessly']}")


def _stage_costs(runs: dict[str, dict]) -> list[dict]:
    agg: dict[str, dict] = {}
    for r in runs.values():
        for s in r.get("stages", []):
            a = agg.setdefault(s["stage"], {"stage": s["stage"], "model": s["model"], "cost_usd": 0.0, "ms": 0,
                                            "input_tokens": 0, "output_tokens": 0, "n": 0})
            a["cost_usd"] += s["cost_usd"]
            a["ms"] += s["ms"]
            a["input_tokens"] += s["input_tokens"]
            a["output_tokens"] += s["output_tokens"]
            a["n"] += 1
    n = max(1, len(runs))
    return [{**a, "cost_usd": a["cost_usd"] / n, "ms": a["ms"] / max(1, a["n"]),
             "input_tokens": a["input_tokens"] / n, "output_tokens": a["output_tokens"] / n} for a in agg.values()]


def _retries(runs: dict[str, dict]) -> dict[str, int]:
    out: dict[str, int] = {}
    for r in runs.values():
        for e in r.get("events", []):
            if e["type"] == "validation_retry":
                out[e["stage"]] = out.get(e["stage"], 0) + 1
    return out


if __name__ == "__main__":
    main()
