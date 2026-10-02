"""Re-apply the current routing policy to recorded runs. No model calls.

    uv run python reroute.py            # rewrites ../evals/runs/agent/*.json in place
"""

import json
from pathlib import Path

from threshold.router import reroute

RUNS = Path(__file__).resolve().parent.parent / "evals" / "runs" / "agent"

if __name__ == "__main__":
    for p in sorted(RUNS.glob("*.json")):
        run = json.loads(p.read_text())
        new = reroute(run)
        if new["confidence"] != run["confidence"]:
            print(f"{p.stem}: {run['confidence']:.2f} -> {new['confidence']:.2f}  {new['blocking_reasons'][:1]}")
        p.write_text(json.dumps(new, indent=1, default=str))
