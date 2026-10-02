import { describe, expect, it } from "vitest";
import { spreadStageEvents } from "@/lib/timeline";
import type { TraceEvent } from "@/lib/types";

const ev = (t: number, stage: string, type: string): TraceEvent => ({ t, stage, type });

describe("spreadStageEvents", () => {
  it("spreads events that share a timestamp evenly between stage start and output, keeping order", () => {
    const events = [ev(0, "coder", "stage_start"), ev(100, "coder", "tool_call"), ev(100, "coder", "tool_result"), ev(100, "coder", "text"), ev(100, "coder", "output")];
    const out = spreadStageEvents(events);
    expect(out.map((e) => e.t)).toEqual([0, 25, 50, 75, 100]);
    expect(out.map((e) => e.type)).toEqual(events.map((e) => e.type));
  });

  it("leaves events with distinct real timestamps alone", () => {
    const events = [ev(0, "coder", "stage_start"), ev(30, "coder", "tool_call"), ev(70, "coder", "tool_result"), ev(100, "coder", "output")];
    expect(spreadStageEvents(events).map((e) => e.t)).toEqual([0, 30, 70, 100]);
  });

  it("handles several stages and stages without a start", () => {
    const events = [ev(0, "triage", "output"), ev(10, "evidence", "stage_start"), ev(50, "evidence", "output"), ev(50, "coder", "stage_start"), ev(90, "coder", "tool_call"), ev(90, "coder", "output")];
    expect(spreadStageEvents(events).map((e) => e.t)).toEqual([0, 10, 50, 50, 70, 90]);
  });

  it("never reorders across the whole trace", () => {
    const events = [ev(0, "coder", "stage_start"), ev(80, "coder", "tool_call"), ev(80, "coder", "output"), ev(80, "critic", "stage_start"), ev(120, "critic", "output")];
    const ts = spreadStageEvents(events).map((e) => e.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });
});
