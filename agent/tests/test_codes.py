from threshold import codes


def test_billable_leaf_and_header():
    assert codes.is_billable("I50.23")
    assert not codes.is_billable("I50.2")  # header
    assert not codes.is_billable("I50.99")  # does not exist


def test_dot_and_undot_round_trip():
    assert codes.dot("I5023") == "I50.23"
    assert codes.dot("I10") == "I10"
    assert codes.undot("i50.23") == "I5023"


def test_children_of_header_are_billable():
    kids = [c.code for c in codes.children("I50.2")]
    assert {"I50.20", "I50.21", "I50.22", "I50.23"} <= set(kids)
    assert all(codes.is_billable(k) for k in kids)


def test_search_returns_only_real_billable_codes():
    hits = codes.search("acute on chronic systolic heart failure")
    assert hits and hits[0].code == "I50.23"
    assert all(h.billable for h in hits)


def test_search_with_no_match_is_empty():
    assert codes.search("zzzz qqqq") == []


def test_search_is_thread_safe():
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda q: codes.search(q), ["sepsis", "pneumonia", "heart failure", "kidney"] * 10))
    assert all(results)
