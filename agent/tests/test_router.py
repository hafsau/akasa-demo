"""Routing policy v2: the model labels issues; code decides what blocks autonomy.

v1 let the model set `blocks_autonomy` itself. Error analysis on the first
full run showed it over-held clean stays (blocking on things that can't move
the claim) and let one stay escape (a lab-only AKI query it didn't block).
"""

from threshold.router import route


def code(c, role="secondary", conf=0.9, verdict="supported"):
    return {"code": c, "role": role, "confidence": conf, "verdict": verdict}


def issue(kind, impact, codes=()):
    return {"kind": kind, "impact": impact, "codes": list(codes), "summary": "s"}


PNEUMONIA = [code("J18.9", "pdx", 0.92), code("I26.99", conf=0.88), code("I10", conf=0.95), code("E11.9", conf=0.6)]


def test_clean_stay_confidence_is_min_over_claim_codes_only():
    # E11.9 (0.6) doesn't touch the DRG, so it can't drag the stay down.
    r = route(PNEUMONIA, [], drivers=["I26.99"])
    assert r.confidence == 0.88 and r.blocking == []


def test_provider_question_that_can_move_the_claim_blocks():
    r = route(PNEUMONIA, [issue("query_opportunity", "severity")], drivers=["I26.99"])
    assert len(r.blocking) == 1 and r.confidence <= 0.44


def test_issue_with_no_claim_impact_never_blocks():
    r = route(PNEUMONIA, [issue("clinical_validation", "none", ["E11.9"])], drivers=["I26.99"])
    assert r.blocking == [] and r.confidence == 0.88


def test_advisory_kinds_never_block_even_with_impact():
    r = route(PNEUMONIA, [issue("copy_forward", "severity"), issue("other", "principal")], drivers=["I26.99"])
    assert r.blocking == []


def test_needs_query_verdict_blocks_only_on_claim_codes():
    codes = [code("J18.9", "pdx", 0.92), code("I26.99", conf=0.88), code("M17.0", conf=0.5, verdict="needs_query")]
    assert route(codes, [], drivers=["I26.99"]).blocking == []
    codes[1]["verdict"] = "needs_query"
    assert len(route(codes, [], drivers=["I26.99"]).blocking) == 1


def test_questioned_principal_blocks_only_if_drg_would_change():
    # J18.9 -> J15.9 stays in simple pneumonia: same DRG, no block.
    assert route(PNEUMONIA, [], drivers=["I26.99"], pdx_alternative="J15.9").blocking == []
    # J18.9 -> A41.9 moves the stay to sepsis: block.
    assert len(route(PNEUMONIA, [], drivers=["I26.99"], pdx_alternative="A41.9").blocking) == 1


def test_unparseable_alternative_is_ignored():
    assert route(PNEUMONIA, [], drivers=["I26.99"], pdx_alternative="Unresolved; depends on query").blocking == []


def test_blocking_marks_are_returned_on_issues():
    issues = [issue("conflicting_documentation", "principal"), issue("copy_forward", "none")]
    r = route(PNEUMONIA, issues, drivers=["I26.99"])
    assert [i["blocks_autonomy"] for i in r.issues] == [True, False]


def test_hospital_acquired_condition_blocks_for_poa_confirmation():
    # A stage 3 pressure ulcer coded POA=N can't move the DRG (HAC rule) but is a
    # reportable quality event (PSI-03), so a human confirms POA before billing.
    codes = [code("I50.23", "pdx", 0.95), {**code("L89.153", conf=0.95), "poa": "N"}]
    r = route(codes, [], drivers=[])
    assert any("hospital-acquired" in b for b in r.blocking)
    codes[1]["poa"] = "Y"
    assert route(codes, [], drivers=[]).blocking == []


def test_reroute_recorded_run_is_idempotent_and_matches_route():
    from threshold.router import reroute

    run = {
        "codes": [code("J18.9", "pdx", 0.92), code("I26.99", conf=0.88)],
        "issues": [{**issue("query_opportunity", "severity"), "blocks_autonomy": True}],
        "drg": {"drivers": ["I26.99"]},
        "events": [{"stage": "critic", "type": "output", "critique": {"pdx_ok": True, "pdx_alternative": None}}],
        "confidence": 0.1,
    }
    once = reroute(run)
    assert once["confidence"] == 0.44 and once["blocking_issues"] == 1
    assert reroute(once)["confidence"] == once["confidence"]
