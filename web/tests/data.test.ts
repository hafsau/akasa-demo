import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import encounters from "@/data/encounters.json";
import evalDoc from "@/data/eval.json";
import { atThreshold } from "@/lib/stats";
import type { EncounterDoc, EvalDoc, Row } from "@/lib/types";

const rows = encounters.agent as unknown as Row[];
const ev = evalDoc as unknown as EvalDoc;
const load = (id: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "..", "data", "encounters", `${id}.json`), "utf8")) as EncounterDoc;

describe("exported data contract", () => {
  it("has every encounter file the threshold view links to", () => {
    expect(rows.length).toBeGreaterThanOrEqual(24);
    for (const r of rows) expect(existsSync(path.join(__dirname, "..", "data", "encounters", `${r.id}.json`))).toBe(true);
  });

  it("every highlighted span slices to its quote (citations point at real text)", () => {
    for (const r of rows) {
      const { case: c, run } = load(r.id);
      const docs = new Map(c.documents.map((d) => [d.id, d.text]));
      for (const f of run.findings) {
        expect(f.start, `${r.id} ${f.id}`).not.toBeNull();
        const slice = docs.get(f.doc_id)!.slice(f.start!, f.end!);
        expect(slice.replace(/\s+/g, " ")).toBe(f.quote.replace(/\s+/g, " "));
      }
    }
  });

  it("every code cites at least one extracted finding", () => {
    for (const r of rows) {
      const { run } = load(r.id);
      const ids = new Set(run.findings.map((f) => f.id));
      for (const c of run.codes) expect(c.finding_ids.some((id) => ids.has(id)), `${r.id} ${c.code}`).toBe(true);
    }
  });

  it("never shows a CPT code", () => {
    for (const r of rows) for (const c of load(r.id).run.codes) expect(c.code).toMatch(/^[A-Z]/);
  });
});

describe("browser stats agree with the Python harness", () => {
  it("point estimates at the default threshold match eval.json", () => {
    const v = atThreshold(rows, ev.default_threshold);
    const p = ev.agent.at_default;
    expect(v.auto.length).toBe(p.n_auto);
    expect(v.precision[0]).toBeCloseTo(p.code_precision[0], 10);
    expect(v.drgMatch[0]).toBeCloseTo(p.drg_match[0], 10);
    expect(v.overcoding[0]).toBeCloseTo(p.overcoding_rate[0], 10);
    expect(v.escaped.length).toBe(p.escaped);
  });
});
