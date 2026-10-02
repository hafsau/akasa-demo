"""Routing policy: who finalizes this stay, the machine or a coder.

The models label issues (what kind, and whether resolving it could change the
principal diagnosis or a CC/MCC). This module decides, deterministically:

- Encounter confidence = the lowest confidence among codes that make up the
  claim: the principal and the secondary codes that set the DRG tier. A shaky
  code that can't move the claim doesn't hold the stay.
- A stay is blocked by any issue that (a) needs a provider's answer and
  (b) could change the claim; by a critic "needs_query" verdict on a claim
  code; by a questioned principal whose alternative regroups to another DRG;
  or by a hospital-acquired condition coded POA = N/U (it can't move the DRG,
  but it is a reportable quality event, so a human confirms POA first).
- Blocked stays have their confidence halved, so they sort below any
  reasonable threshold but keep their relative order for the review queue.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import codes as codeset
from .grouper import group, is_hac

PROVIDER_KINDS = {"conflicting_documentation", "clinical_validation", "poa_uncertain", "query_opportunity"}
BLOCKING_PENALTY = 0.5
_CODE = re.compile(r"\b([A-TV-Z][0-9][0-9AB](?:\.?[0-9A-TV-Z]{1,4})?)\b")


@dataclass
class Routing:
    confidence: float
    base: float
    blocking: list[str] = field(default_factory=list)  # human-readable reasons
    issues: list[dict[str, Any]] = field(default_factory=list)  # input issues + blocks_autonomy


def _alt_code(text: str | None) -> str | None:
    if not text:
        return None
    for m in _CODE.finditer(text):
        if codeset.is_billable(m.group(1)):
            return codeset.dot(m.group(1))
    return None


def route(
    codes: list[dict[str, Any]],
    issues: list[dict[str, Any]],
    drivers: list[str],
    pdx_alternative: str | None = None,
) -> Routing:
    pdx = next(c for c in codes if c["role"] == "pdx")
    claim = [pdx, *[c for c in codes if c["role"] == "secondary" and c["code"] in drivers]]
    base = round(min(c["confidence"] for c in claim), 3)

    blocking: list[str] = []
    marked = []
    for i in issues:
        blocks = i.get("kind") in PROVIDER_KINDS and i.get("impact", "none") != "none"
        marked.append({**i, "blocks_autonomy": blocks})
        if blocks:
            blocking.append(f"{i['kind']}: {i.get('summary', '')}")

    for c in claim:
        if c.get("verdict") == "needs_query":
            blocking.append(f"critic wants a query on claim code {c['code']}")

    for c in codes:
        if c["role"] == "secondary" and is_hac(c["code"], c.get("poa")):
            blocking.append(f"hospital-acquired condition {c['code']} coded POA={c.get('poa')}: confirm before billing")

    alt = _alt_code(pdx_alternative)
    if alt and alt != pdx["code"]:
        secondary = [(c["code"], c.get("poa", "Y")) for c in codes if c["role"] == "secondary"]
        now, then = group(pdx["code"], secondary), group(alt, secondary)
        now_drg = now.drg.number if now.drg else None
        then_drg = then.drg.number if then.drg else None
        if now_drg != then_drg:
            blocking.append(f"principal questioned: {alt} would group to DRG {then_drg} instead of {now_drg}")

    confidence = round(base * (BLOCKING_PENALTY if blocking else 1.0), 3)
    return Routing(confidence=confidence, base=base, blocking=blocking, issues=marked)


def reroute(run: dict[str, Any]) -> dict[str, Any]:
    """Apply the current policy to a recorded run, without calling a model.

    Routing is pure code over the models' recorded labels, so a policy change
    replays across every recorded run for free; only prompt changes need new runs.
    """
    critic = next((e["critique"] for e in run.get("events", []) if e["stage"] == "critic" and e["type"] == "output"),
                  {"pdx_ok": True, "pdx_alternative": None})
    drivers = run["drg"].get("drivers", [])
    claim = {c["code"] for c in run["codes"] if c["role"] == "pdx" or c["code"] in drivers}
    # Issues the pipeline synthesized from critic verdicts are re-derived by route(); keep them for display.
    def synthesized(i: dict[str, Any]) -> bool:
        return i.get("source") == "critic_verdict" or (
            i.get("kind") == "clinical_validation" and i.get("guideline") is None and bool(i.get("codes"))
            and set(i["codes"]) <= claim and any(i["summary"].startswith(f"{c}:") for c in i["codes"]))

    issues = run.get("issues", [])
    model_issues = [{k: v for k, v in i.items() if k != "blocks_autonomy"} for i in issues if not synthesized(i)]
    kept = [{**i, "source": "critic_verdict", "blocks_autonomy": True} for i in issues if synthesized(i)]
    r = route(run["codes"], model_issues, drivers, None if critic.get("pdx_ok", True) else critic.get("pdx_alternative"))
    issues = r.issues + kept
    return {**run, "confidence": r.confidence, "confidence_base": r.base, "blocking_issues": len(r.blocking),
            "blocking_reasons": r.blocking, "issues": issues}
