from threshold.cases import load_all
from threshold.metrics import score_case, summarize


def fake_run(case, codes, drg, weight, confidence, findings=()):
    rows = [{"code": codes[0], "role": "pdx"}] + [{"code": c, "role": "secondary"} for c in codes[1:]]
    return {"codes": rows, "drg": {"number": drg, "weight": weight}, "confidence": confidence,
            "findings": list(findings), "queries": [], "cost_usd": 0.1, "ms": 1000}


def gold_codes(c):
    return [c.gold.pdx, *(s.code for s in c.gold.secondary)]


def test_perfect_run_scores_perfect():
    c = next(x for x in load_all() if x.id == "enc-04")
    s = score_case(c, fake_run(c, gold_codes(c), c.gold.drg, 0.68, 0.95))
    assert (s["tp"], s["fp"], s["fn"]) == (len(gold_codes(c)), 0, 0)
    assert s["drg_ok"] and s["pdx_ok"] and not s["overcoded"]


def test_extra_mcc_is_overcoding():
    c = next(x for x in load_all() if x.id == "enc-04")
    s = score_case(c, fake_run(c, [*gold_codes(c), "J96.01"], "193", 1.31, 0.9))
    assert s["fp"] == 1 and s["cc_fp"] == 1 and s["overcoded"] and not s["drg_ok"]


def test_threshold_splits_and_counts_escapes():
    cases = {c.id: c for c in load_all()}
    auto_ok = cases["enc-04"]   # gold autonomous
    needs_human = cases["enc-02"]  # gold coder
    rows = [
        score_case(auto_ok, fake_run(auto_ok, gold_codes(auto_ok), auto_ok.gold.drg, 0.68, 0.95)),
        score_case(needs_human, fake_run(needs_human, gold_codes(needs_human), needs_human.gold.drg, 0.79, 0.85)),
    ]
    hi = summarize(rows, 0.9)
    assert hi["n_auto"] == 1 and hi["escaped"] == 0
    lo = summarize(rows, 0.8)
    assert lo["n_auto"] == 2 and lo["escaped"] == 1 and lo["escape_rate"] == 1.0


def test_bootstrap_interval_contains_point_and_is_deterministic():
    c = next(x for x in load_all() if x.id == "enc-04")
    rows = [score_case(c, fake_run(c, gold_codes(c)[:k] + ["Z99.89"], c.gold.drg, 0.68, 0.9)) for k in range(1, 6)]
    a, b = summarize(rows), summarize(rows)
    p, lo, hi = a["code_precision"]
    assert lo <= p <= hi
    assert a["code_precision"] == b["code_precision"]
