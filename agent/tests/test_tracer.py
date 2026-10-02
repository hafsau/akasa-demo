from datetime import UTC, datetime, timedelta

from pydantic_ai.messages import ModelRequest, ModelResponse, RetryPromptPart, ToolCallPart, ToolReturnPart
from pydantic_ai.usage import RequestUsage

from threshold.pipeline import Tracer


def test_events_carry_their_own_message_times_not_the_stage_end_time():
    tr = Tracer()
    t0 = tr.wall0
    msgs = [
        ModelResponse(parts=[ToolCallPart("index_lookup", {"term": "sepsis"}, "c1")],
                      usage=RequestUsage(input_tokens=100, output_tokens=10), timestamp=t0 + timedelta(seconds=2)),
        ModelRequest(parts=[ToolReturnPart("index_lookup", ["A41.9"], "c1", timestamp=t0 + timedelta(seconds=2.1))]),
        ModelRequest(parts=[RetryPromptPart("quote not verbatim", timestamp=t0 + timedelta(seconds=5))]),
    ]
    tr.record_messages("coder", msgs, "anthropic:claude-sonnet-5-5", started=0)
    times = {e["type"]: e["t"] for e in tr.events}
    assert 1900 <= times["tool_call"] <= 2100
    assert 2000 <= times["tool_result"] <= 2200
    assert 4900 <= times["validation_retry"] <= 5100
    assert tr.stages[0]["input_tokens"] == 100


def test_tracer_wall_clock_is_timezone_aware():
    assert Tracer().wall0.tzinfo is UTC and isinstance(Tracer().wall0, datetime)
