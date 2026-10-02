"""The agentic coding pipeline.

    triage (code) -> evidence (Haiku) -> coder (Sonnet + tools) -> critic (Sonnet)
                  -> grouper (code) -> router (code) -> query drafter (Sonnet + linter)

LLMs only do what needs judgment: reading, choosing codes, arguing against
them, writing queries. Ordering documents, DRG math, routing and linting are
plain code. Every model output is a typed Pydantic object; validators reject
quotes that aren't in the chart and codes that aren't billable FY2027 codes,
and send the model back with the reason (those retries are recorded).
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ThinkingPart,
    ToolCallPart,
    ToolReturnPart,
)

from . import codes
from .cases import Case
from .grouper import group, severity
from .lint import lint
from .router import route
from .schemas import CodingDraft, Critique, Evidence, Issue, ProviderQuery

PROMPT_VERSION = "2026-10-02.4-router-v2"
MODEL_FAST = "anthropic:claude-haiku-4-5"
MODEL_REASON = "anthropic:claude-sonnet-5-5"

# $ per million tokens (input, output, cache read)
PRICES = {
    "claude-haiku-4-5": (1.00, 5.00, 0.10),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
}

def settings(think: bool = False, **kw: Any) -> dict[str, Any]:
    """Model settings, plus the workspace header for org-level API keys.
    think=True asks for summarized reasoning so the trace can show it."""
    if think:
        kw["anthropic_thinking"] = {"type": "adaptive", "display": "summarized"}
    ws = os.environ.get("ANTHROPIC_WORKSPACE_ID")
    return {**kw, "extra_headers": {"anthropic-workspace-id": ws}} if ws else kw


# ---------------------------------------------------------------- tracing


@dataclass
class Tracer:
    t0: float = field(default_factory=time.perf_counter)
    wall0: datetime = field(default_factory=lambda: datetime.now(UTC))
    sink: Any = None  # optional callable(event) for live streaming
    events: list[dict[str, Any]] = field(default_factory=list)
    stages: list[dict[str, Any]] = field(default_factory=list)

    def now(self) -> int:
        return int((time.perf_counter() - self.t0) * 1000)

    def emit(self, stage: str, type_: str, at: datetime | None = None, **data: Any) -> None:
        t = self.now() if at is None else max(0, int((at - self.wall0).total_seconds() * 1000))
        event = {"t": t, "stage": stage, "type": type_, **data}
        self.events.append(event)
        if self.sink is not None:
            self.sink(event)

    def record_messages(self, stage: str, messages: list, model: str, started: int) -> dict[str, Any]:
        """Turn a Pydantic AI message history into trace events + usage."""
        tin = tout = tcache = 0
        for msg in messages:
            if isinstance(msg, ModelResponse):
                u = msg.usage
                tin += u.input_tokens or 0
                tout += u.output_tokens or 0
                tcache += u.cache_read_tokens or 0
                for part in msg.parts:
                    if isinstance(part, ToolCallPart):
                        args = part.args if isinstance(part.args, dict) else _loads(part.args)
                        if part.tool_name.startswith("final_result"):
                            continue
                        self.emit(stage, "tool_call", at=msg.timestamp, tool=part.tool_name, args=args,
                                  id=part.tool_call_id)
                    elif isinstance(part, ThinkingPart) and part.content:
                        self.emit(stage, "thinking", at=msg.timestamp, text=part.content[:600])
                    elif isinstance(part, TextPart) and part.content.strip():
                        self.emit(stage, "text", at=msg.timestamp, text=part.content[:600])
            elif isinstance(msg, ModelRequest):
                for part in msg.parts:
                    if isinstance(part, ToolReturnPart) and not part.tool_name.startswith("final_result"):
                        self.emit(stage, "tool_result", at=part.timestamp, tool=part.tool_name,
                                  id=part.tool_call_id, result=_short(part.content))
                    elif isinstance(part, RetryPromptPart):
                        content = part.content if isinstance(part.content, str) else json.dumps(part.content)[:600]
                        self.emit(stage, "validation_retry", at=part.timestamp, reason=content[:600])
        name = model.split(":")[-1]
        pin, pout, pcache = PRICES.get(name, (0, 0, 0))
        cost = ((tin - tcache) * pin + tcache * pcache + tout * pout) / 1e6
        stage_rec = {
            "stage": stage, "model": name, "started": started, "ms": self.now() - started,
            "input_tokens": tin, "output_tokens": tout, "cache_read_tokens": tcache, "cost_usd": round(cost, 5),
        }
        self.stages.append(stage_rec)
        return stage_rec


def _loads(s: Any) -> Any:
    try:
        return json.loads(s)
    except Exception:  # noqa: BLE001
        return s


def _short(x: Any, n: int = 900) -> Any:
    s = x if isinstance(x, str) else json.dumps(x, default=str)
    return s if len(s) <= n else s[:n] + "…"


# ---------------------------------------------------------------- helpers


def render_chart(case: Case) -> str:
    parts = []
    for d in case.documents:
        parts.append(f"<document id=\"{d.id}\" type=\"{d.type}\" author=\"{d.author}\" "
                     f"role=\"{d.author_role}\" time=\"{d.timestamp}\">\n{d.text}\n</document>")
    header = (f"Patient: {case.patient.age}{case.patient.sex}. Admitted {case.admit_date}, "
              f"discharged {case.discharge_date}.")
    return header + "\n\n" + "\n\n".join(parts)


def locate(text: str, quote: str) -> tuple[int, int] | None:
    """Character offsets of a quote in a document, tolerant of whitespace only."""
    i = text.find(quote)
    if i >= 0:
        return i, i + len(quote)
    pattern = r"\s+".join(re.escape(w) for w in quote.split())
    m = re.search(pattern, text)
    return (m.start(), m.end()) if m else None


# ---------------------------------------------------------------- stage: evidence


EVIDENCE_INSTRUCTIONS = """\
You are a clinical evidence extractor for inpatient coding review. Read every document in the chart and
list each clinically relevant statement that could affect diagnosis coding: diagnoses, their status,
specificity words (acuity, type, organism, stage, laterality), complications, chronic conditions,
treatments that imply a condition, and abnormal results.

Rules:
- `quote` must be copied character-for-character from the document named in `doc_id` (10-200 chars).
  Never paraphrase inside `quote`.
- Set `assertion` precisely: negated ("no PE"), possible/probable (uncertain), history ("h/o"),
  ruled_out, resolved, or affirmed.
- Include the same condition from several documents when they differ (e.g. an ED note vs. a later
  addendum vs. the discharge summary). Disagreements between documents matter most.
- Abnormal labs/imaging/nursing/dietitian findings: include them, but they are evidence, not diagnoses.
- 15-45 findings is typical. Ids F1, F2, ... in chart order.
"""


def evidence_agent() -> Agent[Case, Evidence]:
    agent = Agent(MODEL_FAST, defer_model_check=True, output_type=Evidence, deps_type=Case, instructions=EVIDENCE_INSTRUCTIONS,
                  retries=3, name="evidence", model_settings=settings(max_tokens=16000))

    @agent.output_validator
    def quotes_exist(ctx: RunContext[Case], out: Evidence) -> Evidence:
        docs = {d.id: d.text for d in ctx.deps.documents}
        bad = []
        for f in out.findings:
            if f.doc_id not in docs:
                bad.append(f"{f.id}: unknown doc_id {f.doc_id!r}")
            elif locate(docs[f.doc_id], f.quote) is None:
                bad.append(f"{f.id}: quote not found verbatim in {f.doc_id}: {f.quote[:80]!r}")
        if bad:
            raise ModelRetry("These quotes are not verbatim. Copy exact text from the document:\n" + "\n".join(bad))
        return out

    return agent


# ---------------------------------------------------------------- stage: coder


CODER_INSTRUCTIONS = """\
You are a senior inpatient coder (CCS) assigning ICD-10-CM codes (FY2027) for one inpatient stay.
You have the chart and a list of extracted findings with ids. Use the tools:
- `index_lookup(term)`: search the FY2027 code set by clinical terms (returns billable codes only).
- `tabular_lookup(code)`: confirm a code exists and is billable; headers return their billable children.
Look up every code you assign; never assign from memory alone.

Apply the ICD-10-CM Official Guidelines for inpatient care:
- Principal diagnosis (UHDDS): the condition established after study to be chiefly responsible for the
  admission. Sepsis sequencing (I.C.1.d), combination codes (e.g. hypertensive heart/CKD I13.x, diabetes
  with CKD E11.22, influenza with pneumonia), use additional code for organism where required.
- Code only conditions documented by a provider (attending or consultant). Labs, imaging, nursing or
  dietitian findings alone are NOT codable; raise a `query_opportunity` issue instead.
- Uncertain diagnoses ("probable", "suspected", "likely") documented AT DISCHARGE are coded as if
  established (inpatient rule, Section II.H). Ruled-out, negated, or history-only conditions are not coded
  as current (use Z-codes for relevant history).
- Don't code signs/symptoms integral to a confirmed diagnosis.
- A later addendum supersedes an earlier read. Stale copy-forwarded text does not override newer documentation.
- If documents conflict about a diagnosis (e.g. one physician documents it and the discharge summary says
  ruled out), do NOT pick the more specific or higher-severity option. Code what is consistently supported
  and raise a `conflicting_documentation` issue.
- If a documented diagnosis lacks clinical support, code it per the provider statement but raise
  `clinical_validation`. If a condition first appears after admission and POA is unclear, raise `poa_uncertain`.
- For every issue, set `impact` honestly: 'principal' or 'severity' only if the provider's answer could change
  the principal diagnosis or a CC/MCC-level diagnosis. A stale copy-forwarded line that newer documentation
  clearly supersedes is advisory ('copy_forward', impact 'none'), not a conflict. Don't raise issues about
  minor-code specificity or things that are already resolved.
- POA: Y for chronic conditions and conditions present at admission; N if clearly acquired after admission.
- `confidence` is your calibrated probability the code is correct AND supported. Lower it when evidence
  is thin, conflicting, or relies on an uncertain reading.
Your job is accuracy in both directions. Never add a code to raise severity.
"""


def coder_agent() -> Agent[dict, CodingDraft]:
    agent = Agent(MODEL_REASON, defer_model_check=True, output_type=CodingDraft, deps_type=dict, instructions=CODER_INSTRUCTIONS,
                  retries=4, name="coder", model_settings=settings(think=True, anthropic_effort="medium", max_tokens=16000))

    @agent.tool_plain
    def index_lookup(term: str) -> list[str]:
        """Search FY2027 ICD-10-CM billable codes by clinical terms, e.g. 'sepsis escherichia coli'."""
        hits = codes.search(term, limit=12)
        if not hits:
            # Fall back to any-word matching on the first two significant words.
            words = [w for w in re.findall(r"[A-Za-z]+", term) if len(w) > 3][:2]
            hits = codes.search(" ".join(words), limit=12) if words else []
        return [f"{c.code}  {c.long}" for c in hits] or ["no matches; try different terms"]

    @agent.tool_plain
    def tabular_lookup(code: str) -> str:
        """Look up a code in the FY2027 Tabular List: description, billable status, children if a header."""
        c = codes.get(code)
        if c is None:
            return f"{code}: not in FY2027 ICD-10-CM"
        if c.billable:
            return f"{c.code}: {c.long} (billable)"
        kids = codes.children(code)[:20]
        return f"{c.code}: {c.long} (HEADER, not billable). Billable children:\n" + "\n".join(
            f"  {k.code}  {k.long}" for k in kids
        )

    @agent.output_validator
    def valid_codes(ctx: RunContext[dict], out: CodingDraft) -> CodingDraft:
        finding_ids = ctx.deps["finding_ids"]
        problems = []
        seen = set()
        for a in [out.pdx, *out.secondary]:
            c = codes.get(a.code)
            if c is None:
                problems.append(f"{a.code} does not exist in FY2027 ICD-10-CM")
            elif not c.billable:
                kids = ", ".join(k.code for k in codes.children(a.code)[:8])
                problems.append(f"{a.code} is a header, not billable. Pick a child: {kids}")
            if codes.dot(a.code) in seen:
                problems.append(f"{a.code} assigned twice")
            seen.add(codes.dot(a.code))
            missing = [f for f in a.finding_ids if f not in finding_ids]
            if missing:
                problems.append(f"{a.code} cites unknown findings {missing}")
        if problems:
            raise ModelRetry("Fix these before returning:\n" + "\n".join(problems))
        out.pdx.code = codes.dot(out.pdx.code)
        for a in out.secondary:
            a.code = codes.dot(a.code)
        return out

    return agent


# ---------------------------------------------------------------- stage: critic


CRITIC_INSTRUCTIONS = """\
You are a coding compliance auditor. Another coder proposed codes for this inpatient stay. Your job is to
try to REFUTE each one using the chart and findings, as a payer clinical-validation auditor would.
For every proposed code return a verdict:
- supported: provider-documented, specific, consistent with the latest documentation.
- unsupported: negated, ruled out, history-only, integral symptom, from labs/nursing only, superseded by a
  later note, or contradicted by the discharge summary without resolution. These will be removed.
- needs_query: documented but conflicting or clinically weak; keep it pending a provider query.
Give a calibrated `confidence` that the code should be billed as-is. Check the principal diagnosis choice.
Add any issue the coder missed (unresolved conflicts, lab-only conditions worth a query, POA questions).
Label each issue's `impact` honestly: only 'principal' or 'severity' if a provider's answer could change the
principal diagnosis or a CC/MCC-level diagnosis. Reserve `needs_query` verdicts for codes where billing as-is
is genuinely at risk; specificity quibbles on minor codes are `supported`. Only set pdx_ok=false when a
different principal is clearly better supported, and give it as a code. Be brief. Never suggest codes for revenue.
"""


def critic_agent() -> Agent[None, Critique]:
    return Agent(MODEL_REASON, defer_model_check=True, output_type=Critique, instructions=CRITIC_INSTRUCTIONS, retries=3, name="critic",
                 model_settings=settings(think=True, anthropic_effort="medium", max_tokens=12000))


# ---------------------------------------------------------------- stage: query drafter


QUERY_INSTRUCTIONS = """\
You write compliant provider queries (AHIMA/ACDIS Guidelines for Achieving a Compliant Query Practice, 2022).
Write ONE query for the issue described. Requirements:
- Include the clinical indicators from the record (with finding ids) that prompted the query.
- Ask an open, non-leading question. No yes/no questions for new diagnoses.
- Multiple-choice options: at least two clinically reasonable diagnoses, plus "Other (please specify)"
  and "Clinically undetermined".
- Never mention reimbursement, DRGs, severity tiers, audits, or financial impact.
"""


def query_agent() -> Agent[None, ProviderQuery]:
    agent = Agent(MODEL_REASON, defer_model_check=True, output_type=ProviderQuery, instructions=QUERY_INSTRUCTIONS, retries=3,
                  name="query", model_settings=settings(anthropic_effort="low", max_tokens=6000))

    @agent.output_validator
    def compliant(out: ProviderQuery) -> ProviderQuery:
        problems = lint(out)
        if problems:
            raise ModelRetry("Query failed the compliance linter: " + "; ".join(problems))
        return out

    return agent


# ---------------------------------------------------------------- orchestration


def triage(case: Case, tr: Tracer) -> list[dict[str, Any]]:
    """Deterministic: order documents, flag addenda and late documents."""
    tr.emit("triage", "stage_start")
    docs = sorted(case.documents, key=lambda d: d.timestamp)
    out = []
    for d in docs:
        flags = []
        if "addendum" in d.type.lower() or d.text.lstrip().lower().startswith("addendum"):
            flags.append("addendum")
        if d.type.lower().startswith("discharge"):
            flags.append("discharge")
        out.append({"id": d.id, "type": d.type, "author_role": d.author_role, "timestamp": d.timestamp,
                    "words": len(d.text.split()), "flags": flags})
    tr.emit("triage", "output", documents=out)
    tr.stages.append({"stage": "triage", "model": None, "started": 0, "ms": tr.now(),
                      "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cost_usd": 0})
    return out


async def run_case(case: Case, tracer: Tracer | None = None) -> dict[str, Any]:
    tr = tracer or Tracer()
    chart = render_chart(case)
    triage(case, tr)

    # Evidence
    t = tr.now()
    tr.emit("evidence", "stage_start", model=MODEL_FAST)
    ev = await evidence_agent().run(f"<chart>\n{chart}\n</chart>\n\nExtract the findings.", deps=case)
    tr.record_messages("evidence", ev.new_messages(), MODEL_FAST, t)
    findings = ev.output.findings
    docs = {d.id: d.text for d in case.documents}
    finding_rows = []
    for f in findings:
        span = locate(docs[f.doc_id], f.quote)
        finding_rows.append({**f.model_dump(), "start": span[0] if span else None, "end": span[1] if span else None})
    tr.emit("evidence", "output", findings=finding_rows)

    findings_block = "\n".join(
        f"{f.id} [{f.doc_id}, {f.assertion}] {f.condition}: \"{f.quote}\"" + (f" ({f.note})" if f.note else "")
        for f in findings
    )

    # Coder
    t = tr.now()
    tr.emit("coder", "stage_start", model=MODEL_REASON)
    cd = await coder_agent().run(
        f"<chart>\n{chart}\n</chart>\n\n<findings>\n{findings_block}\n</findings>\n\nCode this stay.",
        deps={"finding_ids": {f.id for f in findings}},
    )
    tr.record_messages("coder", cd.new_messages(), MODEL_REASON, t)
    draft = cd.output
    tr.emit("coder", "output", draft=draft.model_dump())

    # Critic
    t = tr.now()
    tr.emit("critic", "stage_start", model=MODEL_REASON)
    proposed = json.dumps(draft.model_dump(), indent=1)
    cr = await critic_agent().run(
        f"<chart>\n{chart}\n</chart>\n\n<findings>\n{findings_block}\n</findings>\n\n"
        f"<proposed>\n{proposed}\n</proposed>\n\nAudit these codes."
    )
    tr.record_messages("critic", cr.new_messages(), MODEL_REASON, t)
    critique = cr.output
    tr.emit("critic", "output", critique=critique.model_dump())

    # Merge: critic can remove codes and lower (never raise above coder +0.05) confidence.
    reviews = {codes.dot(r.code): r for r in critique.reviews}
    final_codes = []
    removed = []
    for role, a in [("pdx", draft.pdx), *[("secondary", s) for s in draft.secondary]]:
        r = reviews.get(a.code)
        conf = a.confidence if r is None else min(a.confidence + 0.05, r.confidence)
        row = {**a.model_dump(), "role": role, "confidence": round(conf, 3),
               "verdict": r.verdict if r else "supported", "critic_reason": r.reason if r else None,
               "severity": severity(a.code) if role == "secondary" else None,
               "description": (codes.get(a.code).long if codes.get(a.code) else "")}
        if r and r.verdict == "unsupported" and role == "secondary":
            removed.append(row)
            tr.emit("critic", "removed", code=a.code, reason=r.reason)
        else:
            final_codes.append(row)
    issues: list[Issue] = [*draft.issues, *critique.missed]

    # Grouper
    pdx_row = next(r for r in final_codes if r["role"] == "pdx")
    secondary_rows = [r for r in final_codes if r["role"] == "secondary"]
    g = group(pdx_row["code"], [(r["code"], r["poa"]) for r in secondary_rows])
    tr.emit("grouper", "output", family=g.family, drg=g.drg.number if g.drg else None,
            title=g.drg.title if g.drg else None, weight=g.drg.weight if g.drg else None,
            tier=g.tier, drivers=g.drivers)

    # Router: deterministic policy over the models' labels (see router.py)
    routing = route(final_codes, [i.model_dump() for i in issues], g.drivers,
                    None if critique.pdx_ok else critique.pdx_alternative)
    confidence, base, blocking_reasons = routing.confidence, routing.base, routing.blocking
    tr.emit("router", "output", base=base, blocking=len(blocking_reasons), reasons=blocking_reasons,
            confidence=confidence)
    marked_issues = routing.issues
    # A critic "needs_query" on a claim code is a provider question too.
    for r in [pdx_row, *[x for x in secondary_rows if x["code"] in g.drivers]]:
        if r["verdict"] == "needs_query":
            marked_issues.append({"kind": "clinical_validation", "summary": f"{r['code']}: {r['critic_reason']}",
                                  "finding_ids": r["finding_ids"], "guideline": None, "impact": "severity",
                                  "codes": [r["code"]], "blocks_autonomy": True,
                                  "source": "critic_verdict"})

    # Queries for blocking issues that need a provider answer
    # One query per kind of question; the critic and coder often flag the same gap twice.
    queries = []
    to_query, seen_kinds = [], set()
    for i in marked_issues:
        if i["blocks_autonomy"] and i["kind"] not in seen_kinds:
            seen_kinds.add(i["kind"])
            to_query.append(i)
    for issue in to_query[:2]:
        t = tr.now()
        tr.emit("query", "stage_start", model=MODEL_REASON, issue=issue["summary"])
        cited = "\n".join(f"{f.id}: \"{f.quote}\" ({f.doc_id})" for f in findings if f.id in issue["finding_ids"])
        qr = await query_agent().run(
            f"Issue: {issue['summary']}\nGuideline: {issue.get('guideline')}\nRelevant findings:\n{cited or findings_block}"
        )
        tr.record_messages("query", qr.new_messages(), MODEL_REASON, t)
        queries.append({"issue": issue["summary"], **qr.output.model_dump(), "lint": lint(qr.output)})
        tr.emit("query", "output", query=queries[-1])

    total_cost = round(sum(s["cost_usd"] for s in tr.stages), 5)
    return {
        "case_id": case.id,
        "prompt_version": PROMPT_VERSION,
        "models": {"fast": MODEL_FAST, "reason": MODEL_REASON},
        "findings": finding_rows,
        "codes": final_codes,
        "removed": removed,
        "issues": marked_issues,
        "queries": queries,
        "drg": {"family": g.family, "number": g.drg.number if g.drg else None,
                "title": g.drg.title if g.drg else None, "weight": g.drg.weight if g.drg else None,
                "tier": g.tier, "drivers": g.drivers},
        "confidence": confidence,
        "confidence_base": base,
        "blocking_issues": len(blocking_reasons),
        "blocking_reasons": blocking_reasons,
        "stages": tr.stages,
        "events": tr.events,
        "ms": tr.now(),
        "cost_usd": total_cost,
    }
