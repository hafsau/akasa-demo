"""CI eval gate. Re-scores the recorded runs and fails if quality at the
operating threshold drops below the committed floor in ../evals/gate.json.

    uv run python gate.py                    # exit 1 on regression
    uv run python gate.py --runs agent-v1    # score an archived version

A prompt or pipeline change means re-recording runs (needs an API key,
done locally). CI never calls a model: it re-scores what was committed, so a
PR that ships worse recordings, a changed answer key, or a grouper change
that moves DRGs is caught without spending a cent.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent


def _ok(val: float, op: str, lim: float) -> bool:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return False
    return val >= lim if op == ">=" else val <= lim


def check(s: dict[str, Any], floor: dict[str, Any]) -> list[tuple[str, float, str, float, bool]]:
    rows = [
        ("code precision (auto)", s["code_precision"][0], ">=", floor["code_precision_min"]),
        ("DRG match (auto)", s["drg_match"][0], ">=", floor["drg_match_min"]),
        ("over-coding rate (auto)", s["overcoding_rate"][0], "<=", floor["overcoding_max"]),
        ("escape rate", s["escape_rate"], "<=", floor["escape_rate_max"]),
        ("invalid code rate", s["invalid_code_rate"], "<=", 0.0),
    ]
    return [(name, val, op, lim, _ok(val, op, lim)) for name, val, op, lim in rows]


def main() -> int:
    from threshold.cases import load_all
    from threshold.metrics import load_runs, score_case, summarize

    runs_dir = sys.argv[sys.argv.index("--runs") + 1] if "--runs" in sys.argv else "agent"
    floor = json.loads((ROOT / "evals" / "gate.json").read_text())
    cases = {c.id: c for c in load_all()}
    runs = load_runs(ROOT / "evals" / "runs" / runs_dir)
    rows = [score_case(cases[i], runs[i]) for i in cases if i in runs]
    if len(rows) < floor["min_cases"]:
        print(f"✗ only {len(rows)} recorded cases (need {floor['min_cases']})")
        return 1
    results = check(summarize(rows, floor["threshold"]), floor)
    for name, val, op, lim, ok in results:
        print(f"{'✓' if ok else '✗'} {name:26s} {val:.3f} {op} {lim}")
    return 0 if all(ok for *_, ok in results) else 1


if __name__ == "__main__":
    sys.exit(main())
