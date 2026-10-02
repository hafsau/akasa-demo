"""A deliberately small, deterministic MS-DRG grouper.

It covers seven medical DRG families and nothing else. The DRG numbers and
titles follow MS-DRG conventions, but the relative weights and the CC/MCC list
are illustrative. Real grouping uses CMS's grouper with v44 Tables 5 and 6.
The point here is that DRG assignment is code, not a model output: the LLM
picks codes and cites evidence, and arithmetic does the rest.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .codes import undot

Severity = Literal["MCC", "CC", "none"]


@dataclass(frozen=True)
class Drg:
    number: str
    title: str
    weight: float  # illustrative


# family -> (pdx prefixes, DRG by tier). Tiers: "MCC", "CC", "none".
FAMILIES: dict[str, tuple[tuple[str, ...], dict[str, Drg]]] = {
    "sepsis": (
        ("A40", "A41"),
        {
            "MCC": Drg("871", "Septicemia or severe sepsis w/o MV >96 hours w MCC", 1.86),
            "CC": Drg("872", "Septicemia or severe sepsis w/o MV >96 hours w/o MCC", 1.03),
            "none": Drg("872", "Septicemia or severe sepsis w/o MV >96 hours w/o MCC", 1.03),
        },
    ),
    "uti": (
        ("N39", "N10", "N30"),
        {
            "MCC": Drg("689", "Kidney and urinary tract infections w MCC", 1.12),
            "CC": Drg("690", "Kidney and urinary tract infections w/o MCC", 0.79),
            "none": Drg("690", "Kidney and urinary tract infections w/o MCC", 0.79),
        },
    ),
    "hf": (
        ("I50", "I110", "I130", "I132"),
        {
            "MCC": Drg("291", "Heart failure and shock w MCC", 1.34),
            "CC": Drg("292", "Heart failure and shock w CC", 0.89),
            "none": Drg("293", "Heart failure and shock w/o CC/MCC", 0.64),
        },
    ),
    "pneumonia": (
        ("J09", "J10", "J11", "J12", "J13", "J14", "J15", "J16", "J18"),
        {
            "MCC": Drg("193", "Simple pneumonia and pleurisy w MCC", 1.31),
            "CC": Drg("194", "Simple pneumonia and pleurisy w CC", 0.89),
            "none": Drg("195", "Simple pneumonia and pleurisy w/o CC/MCC", 0.68),
        },
    ),
    "pe": (
        ("I26",),
        {
            "MCC": Drg("175", "Pulmonary embolism w MCC or acute cor pulmonale", 1.43),
            "CC": Drg("176", "Pulmonary embolism w/o MCC", 0.93),
            "none": Drg("176", "Pulmonary embolism w/o MCC", 0.93),
        },
    ),
    "copd": (
        ("J440", "J441"),
        {
            "MCC": Drg("190", "Chronic obstructive pulmonary disease w MCC", 1.16),
            "CC": Drg("191", "Chronic obstructive pulmonary disease w CC", 0.86),
            "none": Drg("192", "Chronic obstructive pulmonary disease w/o CC/MCC", 0.69),
        },
    ),
    "aki": (
        ("N17",),
        {
            "MCC": Drg("682", "Renal failure w MCC", 1.47),
            "CC": Drg("683", "Renal failure w CC", 0.93),
            "none": Drg("684", "Renal failure w/o CC/MCC", 0.62),
        },
    ),
}

# Illustrative secondary-diagnosis severity (prefix match on undotted code;
# longest prefix wins). Not the v44 CC/MCC list.
SEVERITY: dict[str, Severity] = {
    # MCC
    "A40": "MCC", "A41": "MCC", "R6520": "MCC", "R6521": "MCC",
    "J9601": "MCC", "J9602": "MCC", "J9621": "MCC", "J9622": "MCC",
    "I5021": "MCC", "I5023": "MCC", "I5031": "MCC", "I5033": "MCC",
    "I5041": "MCC", "I5043": "MCC", "I26": "MCC",
    "N170": "MCC", "N186": "MCC", "G9341": "MCC", "E43": "MCC",
    "J690": "MCC", "J189": "MCC", "J15": "MCC", "J13": "MCC",
    "L89153": "MCC", "L89154": "MCC", "I214": "MCC", "K7200": "MCC",
    # CC
    "N171": "CC", "N172": "CC", "N178": "CC", "N179": "CC",
    "N184": "CC", "N185": "CC", "I5020": "CC", "I5022": "CC",
    "I5030": "CC", "I5032": "CC", "I5040": "CC", "I5042": "CC",
    "E440": "CC", "E441": "CC", "E871": "CC", "E870": "CC",
    "E872": "CC", "D62": "CC", "J440": "CC", "J441": "CC",
    "R6510": "CC", "F05": "CC", "G9340": "CC", "N390": "CC",
    "E1110": "CC", "I480": "CC", "I4811": "CC", "I4819": "CC",
    "I4820": "CC", "I4821": "CC", "L89152": "CC", "E8770": "CC",
}

# A secondary diagnosis can't act as a CC/MCC for a principal in the same
# clinical cluster (simplified stand-in for the CC exclusion list).
EXCLUSION_CLUSTERS: list[tuple[str, ...]] = [
    ("I50",),
    ("A40", "A41", "R652"),
    ("J96",),
    ("N17",),
    ("I26",),
    ("J44",),
    ("N39", "N10", "N30"),
]


def family_of(pdx: str) -> str | None:
    c = undot(pdx)
    for name, (prefixes, _) in FAMILIES.items():
        if any(c.startswith(p) for p in prefixes):
            return name
    return None


def severity(code: str) -> Severity:
    c = undot(code)
    best: tuple[int, Severity] = (0, "none")
    for prefix, sev in SEVERITY.items():
        if c.startswith(prefix) and len(prefix) > best[0]:
            best = (len(prefix), sev)
    return best[1]


def excluded(pdx: str, secondary: str) -> bool:
    p, s = undot(pdx), undot(secondary)
    if p[:3] == s[:3]:
        return True
    return any(
        any(p.startswith(x) for x in cluster) and any(s.startswith(x) for x in cluster)
        for cluster in EXCLUSION_CLUSTERS
    )


# Hospital-acquired conditions: when one of these is coded POA = N (or U) it
# can't raise the DRG (Medicare HAC payment provision; tiny illustrative subset:
# stage 3/4 pressure ulcers, and foreign body left after a procedure).
def is_hac(code: str, poa: str | None) -> bool:
    if poa not in ("N", "U"):
        return False
    c = undot(code)
    stage_3_4_ulcer = c.startswith("L89") and len(c) == 6 and c[-1] in "34"
    return stage_3_4_ulcer or c.startswith("T814")


@dataclass(frozen=True)
class GroupResult:
    family: str | None
    drg: Drg | None
    tier: Severity
    drivers: list[str]  # secondary codes that set the tier


def group(pdx: str, secondary: list[str] | list[tuple[str, str]]) -> GroupResult:
    """secondary: codes, or (code, poa) pairs so HAC logic can apply."""
    fam = family_of(pdx)
    tiers = {"MCC": 2, "CC": 1, "none": 0}
    best: Severity = "none"
    drivers: list[str] = []
    for item in secondary:
        s, poa = (item, None) if isinstance(item, str) else item
        if excluded(pdx, s) or is_hac(s, poa):
            continue
        sev = severity(s)
        if sev == "none":
            continue
        if tiers[sev] > tiers[best]:
            best, drivers = sev, [s]
        elif sev == best:
            drivers.append(s)
    if fam is None:
        return GroupResult(None, None, best, drivers)
    return GroupResult(fam, FAMILIES[fam][1][best], best, drivers)
