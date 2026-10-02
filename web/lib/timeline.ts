import type { TraceEvent } from "./types";

/**
 * Recorded runs from before per-message timestamps stamped every event in an
 * LLM stage at the moment the stage finished. For replay, spread a cluster of
 * same-time events evenly between the stage's start and its output. Order is
 * always preserved; events that already have distinct times are untouched.
 */
export function spreadStageEvents(events: readonly TraceEvent[]): TraceEvent[] {
  const out = events.map((e) => ({ ...e }));
  let i = 0;
  while (i < out.length) {
    if (out[i].type !== "stage_start") {
      i++;
      continue;
    }
    const start = out[i];
    let j = i + 1;
    while (j < out.length && out[j].stage === start.stage && out[j].type !== "stage_start") j++;
    const body = out.slice(i + 1, j); // ends with the stage's output when present
    const end = body.length ? body[body.length - 1].t : start.t;
    const clustered = body.length > 1 && body.every((e) => e.t === end);
    if (clustered && end > start.t) {
      body.forEach((e, k) => {
        e.t = Math.round(start.t + ((k + 1) * (end - start.t)) / body.length);
      });
    }
    i = j;
  }
  return out;
}
