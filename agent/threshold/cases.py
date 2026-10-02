"""Synthetic encounter + answer-key schema. Cases live in evals/cases/*.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from . import codes
from .grouper import group

CASES_DIR = Path(__file__).resolve().parents[2] / "evals" / "cases"

AuthorRole = Literal["provider", "consultant", "nursing", "dietitian", "radiology", "lab", "pharmacy"]
Poa = Literal["Y", "N", "U", "W", "1"]
Trap = Literal[
    "negation",
    "history_of",
    "late_addendum",
    "conflicting_notes",
    "uncertain_at_discharge",
    "ruled_out",
    "lab_only",
    "consultant_specificity",
    "symptom_integral",
    "combination_code",
    "poa_hac",
    "clinical_validation",
    "excludes1",
    "copy_forward",
]


class Document(BaseModel):
    id: str
    type: str  # "ED note", "H&P", "Progress note", "Consult", "Radiology", "Discharge summary", ...
    author: str
    author_role: AuthorRole
    timestamp: str  # ISO local, e.g. 2026-09-14T08:12
    text: str


class GoldCode(BaseModel):
    code: str
    poa: Poa = "Y"

    @field_validator("code")
    @classmethod
    def billable(cls, v: str) -> str:
        if not codes.is_billable(v):
            raise ValueError(f"{v} is not a billable FY2027 ICD-10-CM code")
        return codes.dot(v)


class Query(BaseModel):
    topic: str  # e.g. "Clinical validity of sepsis"
    options: list[str] = Field(default_factory=list)


class Gold(BaseModel):
    pdx: str
    secondary: list[GoldCode]
    drg: str
    route: Literal["autonomous", "coder"]
    hold_reasons: list[str] = Field(default_factory=list)
    query: Query | None = None
    traps: list[Trap] = Field(default_factory=list)
    explanation: str

    @field_validator("pdx")
    @classmethod
    def pdx_billable(cls, v: str) -> str:
        if not codes.is_billable(v):
            raise ValueError(f"PDx {v} is not a billable FY2027 ICD-10-CM code")
        return codes.dot(v)


class Patient(BaseModel):
    age: int
    sex: Literal["F", "M"]


class Case(BaseModel):
    id: str
    title: str
    summary: str  # one line, plain English
    hero: bool = False
    family: str
    patient: Patient
    admit_date: str
    discharge_date: str
    documents: list[Document]
    gold: Gold

    def check(self) -> list[str]:
        """Consistency problems between the answer key and the grouper."""
        problems: list[str] = []
        g = group(self.gold.pdx, [(s.code, s.poa) for s in self.gold.secondary])
        if g.family != self.family:
            problems.append(f"family {self.family!r} but grouper says {g.family!r}")
        if g.drg and g.drg.number != self.gold.drg:
            problems.append(f"gold DRG {self.gold.drg} but grouper says {g.drg.number} ({g.tier})")
        if self.gold.route == "coder" and not self.gold.hold_reasons:
            problems.append("route=coder needs hold_reasons")
        ids = [d.id for d in self.documents]
        if len(ids) != len(set(ids)):
            problems.append("duplicate document ids")
        return problems


def load(path: Path) -> Case:
    return Case.model_validate(json.loads(path.read_text()))


def load_all() -> list[Case]:
    return [load(p) for p in sorted(CASES_DIR.glob("*.json"))]


if __name__ == "__main__":
    import sys

    bad = 0
    for p in sorted(CASES_DIR.glob("*.json")):
        try:
            c = load(p)
        except Exception as e:  # noqa: BLE001
            print(f"✗ {p.name}: {e}")
            bad += 1
            continue
        probs = c.check()
        words = sum(len(d.text.split()) for d in c.documents)
        mark = "✗" if probs else "✓"
        print(f"{mark} {p.name}  {c.family:9s} DRG {c.gold.drg} {c.gold.route:10s} {len(c.documents)} docs {words}w")
        for pr in probs:
            print(f"    - {pr}")
        bad += bool(probs)
    sys.exit(1 if bad else 0)
