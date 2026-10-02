from threshold.lint import lint
from threshold.schemas import ProviderQuery, QueryIndicator


def q(question="Based on the indicators, please clarify the condition being treated.", options=None, n_ind=2):
    return ProviderQuery(
        to="Attending physician",
        clinical_indicators=[QueryIndicator(text=f"indicator {i}") for i in range(n_ind)],
        question=question,
        options=options or ["Sepsis due to UTI", "UTI without sepsis", "Other (please specify)", "Clinically undetermined"],
    )


def test_compliant_query_passes():
    assert lint(q()) == []


def test_money_language_fails():
    assert any("financial" in p for p in lint(q(question="Clarifying this would change the DRG. Please clarify.")))


def test_leading_question_fails():
    assert any("leading" in p for p in lint(q(question="Please document sepsis if you agree.")))


def test_options_need_other_and_undetermined():
    problems = lint(q(options=["Sepsis", "No sepsis", "Maybe"]))
    assert any("Other" in p for p in problems) and any("undetermined" in p for p in problems)


def test_single_diagnosis_option_is_leading():
    problems = lint(q(options=["Sepsis", "Other (please specify)", "Clinically undetermined"]))
    assert any("two clinically reasonable" in p for p in problems)
