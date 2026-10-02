from threshold.cases import load_all


def test_all_cases_load_and_answer_keys_agree_with_grouper():
    cases = load_all()
    assert len(cases) >= 24
    problems = {c.id: c.check() for c in cases}
    assert not {k: v for k, v in problems.items() if v}


def test_hero_cases_and_mix_of_routes():
    cases = load_all()
    assert sum(c.hero for c in cases) == 4
    routes = {c.gold.route for c in cases}
    assert routes == {"autonomous", "coder"}


def test_no_cpt_codes_in_answer_keys():
    # CPT is AMA-licensed; every answer-key code must be ICD-10-CM (letter first).
    for c in load_all():
        for code in [c.gold.pdx, *(s.code for s in c.gold.secondary)]:
            assert code[0].isalpha(), (c.id, code)
