"""Run the agent and/or baseline over the synthetic cases and record every run.

    uv run python run.py --system agent --cases enc-01,enc-02
    uv run python run.py --system both            # all cases, both systems

Writes one JSON per case to ../evals/runs/<system>/<case>.json. Runs are
recorded once and replayed by the site; nothing on the public URL calls a model.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from threshold.baseline import run_baseline
from threshold.cases import load_all
from threshold.pipeline import run_case

RUNS = Path(__file__).resolve().parent.parent / "evals" / "runs"


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--system", choices=["agent", "baseline", "both"], default="agent")
    ap.add_argument("--cases", default="all", help="comma-separated ids, 'hero', or 'all'")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--skip-existing", action="store_true")
    args = ap.parse_args()

    cases = load_all()
    if args.cases == "hero":
        cases = [c for c in cases if c.hero]
    elif args.cases != "all":
        wanted = set(args.cases.split(","))
        cases = [c for c in cases if c.id in wanted]

    systems = ["agent", "baseline"] if args.system == "both" else [args.system]
    sem = asyncio.Semaphore(args.concurrency)
    failures = 0

    async def one(system: str, case) -> None:
        nonlocal failures
        out = RUNS / system / f"{case.id}.json"
        if args.skip_existing and out.exists():
            return
        async with sem:
            t0 = time.perf_counter()
            try:
                result = await (run_case(case) if system == "agent" else run_baseline(case))
            except Exception as e:  # noqa: BLE001
                failures += 1
                print(f"✗ {system:8s} {case.id}: {type(e).__name__}: {e}", file=sys.stderr)
                return
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(result, indent=1, default=str))
            print(f"✓ {system:8s} {case.id}  conf={result['confidence']:.2f}  DRG {result['drg']['number']}  "
                  f"${result['cost_usd']:.3f}  {time.perf_counter() - t0:.0f}s")

    await asyncio.gather(*(one(s, c) for s in systems for c in cases))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
