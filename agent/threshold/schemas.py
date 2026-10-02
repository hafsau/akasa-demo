"""Typed outputs for each pipeline stage. The models never return free text:
every stage returns one of these, and validators check them against the chart
and the FY2027 code table before the run is allowed to continue."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Assertion = Literal["affirmed", "negated", "possible", "probable", "history", "ruled_out", "resolved"]


class Finding(BaseModel):
    """One clinically relevant statement, quoted verbatim from one document."""

    id: str = Field(description="Short id like F1, F2...")
    condition: str = Field(description="The condition or finding in plain clinical words")
    assertion: Assertion
    doc_id: str
    quote: str = Field(description="Exact verbatim span copied from the document (10-200 chars)")
    note: str | None = Field(default=None, description="Optional context, e.g. 'late addendum supersedes prior read'")


class Evidence(BaseModel):
    findings: list[Finding]


class CodeAssignment(BaseModel):
    code: str = Field(description="Billable FY2027 ICD-10-CM code, with dot, e.g. I50.23")
    poa: Literal["Y", "N", "U", "W", "1"] = Field(description="Present-on-admission indicator")
    finding_ids: list[str] = Field(min_length=1, description="Findings that support this code")
    confidence: float = Field(ge=0, le=1, description="Calibrated probability this code is correct and supported")
    rationale: str = Field(description="One sentence: why this code, citing the guideline if relevant")


IssueKind = Literal[
    "conflicting_documentation",
    "query_opportunity",
    "clinical_validation",
    "poa_uncertain",
    "copy_forward",
    "other",
]


class Issue(BaseModel):
    kind: IssueKind
    summary: str = Field(description="One sentence a coder can act on")
    finding_ids: list[str] = Field(default_factory=list)
    guideline: str | None = Field(default=None, description="e.g. 'OCG Section II.H' or 'AHIMA/ACDIS query practice'")
    impact: Literal["principal", "severity", "none"] = Field(
        description="Could resolving this change the principal diagnosis ('principal'), or add, remove or change a "
        "CC/MCC-level secondary diagnosis ('severity')? Otherwise 'none' (specificity of a minor code, advisory notes)."
    )
    codes: list[str] = Field(default_factory=list, description="Codes this issue is about, if any")


class CodingDraft(BaseModel):
    pdx: CodeAssignment = Field(description="Principal diagnosis per UHDDS")
    secondary: list[CodeAssignment]
    issues: list[Issue] = Field(default_factory=list)


Verdict = Literal["supported", "unsupported", "needs_query"]


class CodeReview(BaseModel):
    code: str
    verdict: Verdict
    confidence: float = Field(ge=0, le=1)
    reason: str


class Critique(BaseModel):
    reviews: list[CodeReview]
    pdx_ok: bool = Field(description="False if a different principal diagnosis is better supported")
    pdx_alternative: str | None = None
    missed: list[Issue] = Field(default_factory=list, description="Issues the coder stage missed")


class QueryIndicator(BaseModel):
    text: str
    finding_id: str | None = None


class ProviderQuery(BaseModel):
    to: str = Field(description="Who should answer, e.g. 'Attending physician'")
    clinical_indicators: list[QueryIndicator] = Field(min_length=2)
    question: str
    options: list[str] = Field(min_length=3)


class BaselineCode(BaseModel):
    code: str
    poa: str = "Y"


class BaselineOutput(BaseModel):
    """Single-prompt baseline: no tools, no evidence, no review."""

    pdx: str
    secondary: list[BaselineCode]
    confidence: float = Field(ge=0, le=1)
    needs_human: bool
    reason: str | None = None
