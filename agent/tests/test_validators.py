"""Validators are the safety net: drive the real agents with a scripted model
(no API calls) and check that bad output is sent back, not accepted."""

import pytest
from pydantic_ai import ModelRetry  # noqa: F401
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.messages import ModelResponse, RetryPromptPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from threshold.cases import load_all
from threshold.pipeline import coder_agent, evidence_agent, locate, query_agent


def scripted(*outputs):
    """A model that returns each output in turn via the output tool, and records retries."""
    calls = {"n": 0, "retries": []}

    def fn(messages, info: AgentInfo) -> ModelResponse:
        for m in messages:
            for p in getattr(m, "parts", []):
                if isinstance(p, RetryPromptPart) and p not in calls["retries"]:
                    calls["retries"].append(p)
        out = outputs[min(calls["n"], len(outputs) - 1)]
        calls["n"] += 1
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, out)])

    return FunctionModel(fn), calls


@pytest.fixture
def case():
    return next(c for c in load_all() if c.id == "enc-01")


def finding(quote, doc_id):
    return {"id": "F1", "condition": "x", "assertion": "affirmed", "doc_id": doc_id, "quote": quote}


def test_locate_tolerates_whitespace_only():
    assert locate("No  pulmonary\nembolism.", "No pulmonary embolism") == (0, 22)
    assert locate("No pulmonary embolism.", "No PE") is None


async def test_evidence_rejects_paraphrased_quote_then_accepts_verbatim(case):
    doc = case.documents[0]
    verbatim = doc.text[20:80]
    model, calls = scripted({"findings": [finding("a paraphrase that is not in the note", doc.id)]},
                            {"findings": [finding(verbatim, doc.id)]})
    agent = evidence_agent()
    with agent.override(model=model):
        res = await agent.run("go", deps=case)
    assert res.output.findings[0].quote == verbatim
    assert len(calls["retries"]) == 1
    assert "not verbatim" in str(calls["retries"][0].content)


async def test_evidence_gives_up_if_never_verbatim(case):
    model, _ = scripted({"findings": [finding("never in the chart", case.documents[0].id)]})
    agent = evidence_agent()
    with agent.override(model=model), pytest.raises(UnexpectedModelBehavior):
        await agent.run("go", deps=case)


def draft(pdx="J18.9", secondary=("I10",), fids=("F1",)):
    a = lambda c: {"code": c, "poa": "Y", "finding_ids": list(fids), "confidence": 0.9, "rationale": "r"}
    return {"pdx": a(pdx), "secondary": [a(s) for s in secondary], "issues": []}


async def test_coder_rejects_header_code_and_suggests_children():
    model, calls = scripted(draft(secondary=("I50.2",)), draft(secondary=("I50.23",)))
    agent = coder_agent()
    with agent.override(model=model):
        res = await agent.run("go", deps={"finding_ids": {"F1"}})
    assert [s.code for s in res.output.secondary] == ["I50.23"]
    assert "header" in str(calls["retries"][0].content) and "I50.23" in str(calls["retries"][0].content)


async def test_coder_rejects_invented_code_and_unknown_finding():
    model, calls = scripted(draft(secondary=("I50.99",), fids=("F9",)), draft())
    agent = coder_agent()
    with agent.override(model=model):
        await agent.run("go", deps={"finding_ids": {"F1"}})
    msg = str(calls["retries"][0].content)
    assert "does not exist" in msg and "unknown findings" in msg


async def test_coder_normalizes_undotted_codes():
    model, _ = scripted(draft(pdx="J189", secondary=("I10",)))
    agent = coder_agent()
    with agent.override(model=model):
        res = await agent.run("go", deps={"finding_ids": {"F1"}})
    assert res.output.pdx.code == "J18.9"


async def test_query_linter_blocks_leading_query():
    bad = {"to": "Attending", "clinical_indicators": [{"text": "a"}, {"text": "b"}],
           "question": "Please document sepsis.", "options": ["Sepsis", "Other (please specify)", "Clinically undetermined"]}
    good = {**bad, "question": "Please clarify the condition being treated, based on the indicators above.",
            "options": ["Sepsis due to UTI", "UTI without sepsis", "Other (please specify)", "Clinically undetermined"]}
    model, calls = scripted(bad, good)
    agent = query_agent()
    with agent.override(model=model):
        res = await agent.run("go")
    assert res.output.options[0] == "Sepsis due to UTI"
    assert "compliance linter" in str(calls["retries"][0].content)
