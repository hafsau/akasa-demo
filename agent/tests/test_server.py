"""The service that will back live mode. Model calls are faked; the contract,
streaming, and abuse limits are what's under test."""

import json

import pytest
from fastapi.testclient import TestClient

import server


@pytest.fixture
def client(monkeypatch):
    async def fake_run_case(case, tracer=None):
        tracer.emit("triage", "stage_start")
        tracer.emit("coder", "tool_call", tool="index_lookup", args={"term": "sepsis"})
        return {"case_id": case.id, "confidence": 0.91, "drg": {"number": "871"}}

    monkeypatch.setattr(server, "run_case", fake_run_case)
    server.limiter.reset(per_ip=2, daily=3)
    monkeypatch.setattr(server, "LIVE_CASES", {"enc-04", "enc-05"})
    return TestClient(server.app)


def sse_events(text):
    return [json.loads(line[5:]) for line in text.splitlines() if line.startswith("data:")]


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_lists_cases_without_answer_keys(client):
    cases = client.get("/cases").json()
    assert len(cases) >= 24
    assert "gold" not in cases[0] and {"id", "title", "live"} <= set(cases[0])


def test_live_run_streams_trace_events_then_result(client):
    r = client.post("/runs/enc-04")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = sse_events(r.text)
    assert [e["type"] for e in events] == ["stage_start", "tool_call", "result"]
    assert events[-1]["run"]["confidence"] == 0.91


def test_only_curated_cases_can_run_live(client):
    assert client.post("/runs/enc-01").status_code == 403
    assert client.post("/runs/nope").status_code == 404


def test_per_ip_limit_then_daily_cap(client):
    assert client.post("/runs/enc-04").status_code == 200
    assert client.post("/runs/enc-05").status_code == 200
    r = client.post("/runs/enc-04")
    assert r.status_code == 429 and "replay" in r.json()["detail"].lower()


def test_daily_cap_applies_across_ips(client):
    for ip in ["1.1.1.1", "2.2.2.2", "3.3.3.3"]:
        assert client.post("/runs/enc-04", headers={"x-forwarded-for": ip}).status_code == 200
    assert client.post("/runs/enc-04", headers={"x-forwarded-for": "4.4.4.4"}).status_code == 429
