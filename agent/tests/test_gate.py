from gate import check

FLOOR = {"threshold": 0.8, "min_cases": 20, "code_precision_min": 0.9, "drg_match_min": 0.9,
         "overcoding_max": 0.05, "escape_rate_max": 0.0}


def summary(**over):
    s = {"code_precision": [0.95, 0.9, 0.99], "drg_match": [1.0, 1.0, 1.0], "overcoding_rate": [0.0, 0.0, 0.0],
         "escape_rate": 0.0, "invalid_code_rate": 0.0}
    s.update(over)
    return s


def test_passes_when_every_metric_clears_its_floor():
    assert all(ok for *_, ok in check(summary(), FLOOR))


def test_precision_regression_fails():
    results = {name: ok for name, *_, ok in check(summary(code_precision=[0.85, 0.8, 0.9]), FLOOR)}
    assert results["code precision (auto)"] is False


def test_any_escape_fails_when_floor_is_zero():
    results = {name: ok for name, *_, ok in check(summary(escape_rate=0.125), FLOOR)}
    assert results["escape rate"] is False


def test_invalid_codes_always_fail():
    results = {name: ok for name, *_, ok in check(summary(invalid_code_rate=0.01), FLOOR)}
    assert results["invalid code rate"] is False


def test_no_autonomous_stays_is_not_a_pass():
    # NaN precision (nothing auto-coded) must fail, not slip through a comparison.
    results = {name: ok for name, *_, ok in check(summary(code_precision=[float("nan")] * 3), FLOOR)}
    assert results["code precision (auto)"] is False
