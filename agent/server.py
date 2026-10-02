"""Live-mode service: run the agent on a curated chart and stream its trace.

    uv run uvicorn server:app --port 8000

POST /runs/{case_id} streams Server-Sent Events: every trace event as it is
emitted, then a final {"type": "result"} with the full run (the same schema the
site replays). Only curated charts can run live, there is no free-text input,
and a per-IP limit plus a global daily cap keep a public URL from draining the
API budget; when either trips, the client falls back to the recorded replay.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv(Path(__file__).parent / ".env")
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from threshold.cases import load_all
from threshold.pipeline import Tracer, run_case

LIVE_CASES = set(os.environ.get("LIVE_CASES", "enc-01,enc-02,enc-04").split(","))
CASES = {c.id: c for c in load_all()}


class Limiter:
    """In-memory per-IP and global daily limits. One instance per process is
    enough for a single small machine; swap for Redis when scaled out."""

    def __init__(self, per_ip: int, daily: int) -> None:
        self.reset(per_ip, daily)

    def reset(self, per_ip: int, daily: int) -> None:
        self.per_ip, self.daily = per_ip, daily
        self.day = datetime.now(UTC).date()
        self.by_ip: dict[str, int] = defaultdict(int)
        self.total = 0

    def take(self, ip: str) -> str | None:
        if datetime.now(UTC).date() != self.day:
            self.reset(self.per_ip, self.daily)
        if self.total >= self.daily:
            return "Daily live-run budget used up. Showing the recorded replay instead."
        if self.by_ip[ip] >= self.per_ip:
            return "You've used your live runs for today. Showing the recorded replay instead."
        self.by_ip[ip] += 1
        self.total += 1
        return None


limiter = Limiter(per_ip=int(os.environ.get("LIVE_PER_IP", "3")), daily=int(os.environ.get("LIVE_DAILY", "60")))

app = FastAPI(title="Threshold agent", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
                   allow_methods=["GET", "POST"], allow_headers=["*"])


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/cases")
def cases() -> list[dict]:
    return [{"id": c.id, "title": c.title, "summary": c.summary, "family": c.family, "hero": c.hero,
             "live": c.id in LIVE_CASES} for c in CASES.values()]


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


@app.post("/runs/{case_id}")
async def live_run(case_id: str, request: Request) -> StreamingResponse:
    case = CASES.get(case_id)
    if case is None:
        raise HTTPException(404, "Unknown case")
    if case_id not in LIVE_CASES:
        raise HTTPException(403, "This chart is replay-only")
    if reason := limiter.take(_ip(request)):
        raise HTTPException(429, reason)

    queue: asyncio.Queue = asyncio.Queue()
    tracer = Tracer(sink=queue.put_nowait)

    async def work() -> None:
        try:
            run = await run_case(case, tracer=tracer)
            queue.put_nowait({"type": "result", "run": run})
        except Exception as e:  # noqa: BLE001 - surfaced to the client as an event
            queue.put_nowait({"type": "error", "detail": f"{type(e).__name__}: {e}"})
        queue.put_nowait(None)

    async def stream():
        task = asyncio.create_task(work())
        try:
            while (event := await queue.get()) is not None:
                yield f"data: {json.dumps(event, default=str)}\n\n"
        finally:
            task.cancel()

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
