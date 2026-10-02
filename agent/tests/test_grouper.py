import pytest

from threshold.grouper import family_of, group, is_hac, severity


@pytest.mark.parametrize(
    "pdx,family",
    [("A41.9", "sepsis"), ("N39.0", "uti"), ("I50.23", "hf"), ("I13.0", "hf"), ("J18.9", "pneumonia"),
     ("J10.00", "pneumonia"), ("I26.99", "pe"), ("J44.1", "copd"), ("N17.9", "aki"), ("K35.80", None)],
)
def test_family_of(pdx, family):
    assert family_of(pdx) == family


def test_three_tier_family_moves_with_secondary_severity():
    assert group("J18.9", ["I10"]).drg.number == "195"
    assert group("J18.9", ["E87.1"]).drg.number == "194"  # CC
    assert group("J18.9", ["I26.99"]).drg.number == "193"  # MCC


def test_mcc_wins_over_cc_and_reports_drivers():
    g = group("J18.9", ["E87.1", "I26.99", "I10"])
    assert g.tier == "MCC" and g.drivers == ["I26.99"]


def test_same_cluster_secondary_is_excluded():
    # Sepsis-family secondary can't be the MCC for a sepsis principal.
    assert group("A41.51", ["R65.20"]).drg.number == "872"
    # HF specificity on an I13.0 principal still counts (the classic specificity case).
    assert group("I13.0", ["I50.23"]).drg.number == "291"


def test_hac_with_poa_n_cannot_raise_drg():
    assert is_hac("L89.153", "N") and not is_hac("L89.153", "Y")
    assert group("I50.33", [("L89.153", "N")]).drg.number == "293"
    assert group("I50.33", [("L89.153", "Y")]).drg.number == "291"


def test_severity_longest_prefix():
    assert severity("I50.23") == "MCC"
    assert severity("I50.22") == "CC"
    assert severity("I50.9") == "none"
