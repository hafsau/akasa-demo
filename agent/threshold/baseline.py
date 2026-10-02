"""Single-prompt baseline: the whole chart in, a code list out. No tools, no
evidence, no critic, no validators. It exists so the agent has to earn its
extra cost on the eval."""

from __future__ import annotations

import time
from typing import Any

from pydantic_ai import Agent

from . import codes
from .cases import Case
from .grouper import group
from .pipeline import MODEL_REASON, PRICES, render_chart, settings
from .schemas import BaselineOutput

INSTRUCTIONS = """\
You are an inpatient medical coder. Read the chart and return the ICD-10-CM codes (FY2027) for this stay:
the principal diagnosis and all secondary diagnoses with POA indicators. Also give your confidence (0-1)
that the full code set is correct, and whether a human coder should review it."""


def baseline_agent() -> Agent[None, BaselineOutput]:
    return Agent(MODEL_REASON, defer_model_check=True, output_type=BaselineOutput, instructions=INSTRUCTIONS, name="baseline",
                 model_settings=settings(anthropic_effort="medium", max_tokens=8000))


async def run_baseline(case: Case) -> dict[str, Any]:
    t0 = time.perf_counter()
    res = await baseline_agent().run(f"<chart>\n{render_chart(case)}\n</chart>")
    out = res.output
    u = res.usage
    pin, pout, pcache = PRICES["claude-sonnet-5-5"]
    cache = u.cache_read_tokens or 0
    cost = ((u.input_tokens - cache) * pin + cache * pcache + u.output_tokens * pout) / 1e6

    def row(code: str, poa: str, role: str) -> dict[str, Any]:
        c = codes.get(code)
        return {"code": codes.dot(code), "poa": poa, "role": role, "valid": bool(c and c.billable),
                "description": c.long if c else "(not an FY2027 code)", "confidence": out.confidence}

    rows = [row(out.pdx, "Y", "pdx"), *[row(s.code, s.poa, "secondary") for s in out.secondary]]
    valid_secondary = [(r["code"], r["poa"]) for r in rows[1:] if r["valid"]]
    g = group(rows[0]["code"], valid_secondary)
    # The baseline's own "needs human" flag acts like a blocking issue.
    confidence = round(out.confidence * (0.5 if out.needs_human else 1.0), 3)
    return {
        "case_id": case.id,
        "codes": rows,
        "drg": {"family": g.family, "number": g.drg.number if g.drg else None,
                "weight": g.drg.weight if g.drg else None, "tier": g.tier, "drivers": g.drivers},
        "confidence": confidence,
        "needs_human": out.needs_human,
        "reason": out.reason,
        "ms": int((time.perf_counter() - t0) * 1000),
        "cost_usd": round(cost, 5),
        "input_tokens": u.input_tokens,
        "output_tokens": u.output_tokens,
    }
