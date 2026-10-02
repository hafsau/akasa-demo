from export import build
from threshold.cases import load_all


def fake_run(case, conf, extra=()):
    gold = [case.gold.pdx, *(s.code for s in case.gold.secondary)]
    rows = [{"code": gold[0], "role": "pdx"}] + [{"code": c, "role": "secondary"} for c in [*gold[1:], *extra]]
    return {"codes": rows, "drg": {"number": case.gold.drg, "weight": 1.0}, "confidence": conf, "findings": [],
            "queries": [], "cost_usd": 0.1, "ms": 1000, "events": [], "stages": []}


def test_build_produces_summaries_rows_and_version_history():
    cases = {c.id: c for c in load_all()[:4]}
    v2 = {i: fake_run(c, 0.9) for i, c in cases.items()}
    v1 = {i: fake_run(c, 0.3) for i, c in cases.items()}
    base = {i: fake_run(c, 0.95, extra=["Z99.89"]) for i, c in cases.items()}
    doc, rows = build(cases, v2, base, history={"v1": v1}, threshold=0.8)

    assert [r["id"] for r in rows["agent"]] == list(cases)
    assert doc["agent"]["at_default"]["n_auto"] == 4
    assert doc["baseline"]["at_default"]["code_precision"][0] < 1.0
    versions = [h["version"] for h in doc["history"]]
    assert versions == ["v1", "current"]
    assert doc["history"][0]["at_default"]["n_auto"] == 0
    assert doc["history"][1]["at_default"]["n_auto"] == 4


def test_build_without_baseline_or_history():
    cases = {c.id: c for c in load_all()[:2]}
    doc, rows = build(cases, {i: fake_run(c, 0.9) for i, c in cases.items()}, {}, history={}, threshold=0.8)
    assert doc["baseline"] is None and rows["baseline"] == []
    assert [h["version"] for h in doc["history"]] == ["current"]


def test_dumps_is_strict_json_with_nan_as_null():
    import json
    import math

    from export import dumps

    text = dumps({"a": math.nan, "b": [1.0, float("nan")], "c": {"d": (0.5, math.nan)}})
    assert json.loads(text) == {"a": None, "b": [1.0, None], "c": {"d": [0.5, None]}}
    assert "NaN" not in text
