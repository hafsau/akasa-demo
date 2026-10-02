import { describe, expect, it } from "vitest";
import { segments } from "@/lib/highlight";

const f = (id: string, start: number, end: number) => ({ id, start, end });

describe("segments", () => {
  const text = "No pulmonary embolism. Segmental emboli RLL.";

  it("rebuilds the original text exactly", () => {
    const s = segments(text, [f("F1", 0, 21), f("F2", 23, 39)]);
    expect(s.map((x) => x.text).join("")).toBe(text);
    expect(s.filter((x) => x.findingId).map((x) => x.findingId)).toEqual(["F1", "F2"]);
  });

  it("keeps the first of overlapping spans and drops the rest", () => {
    const s = segments(text, [f("F1", 0, 21), f("F2", 3, 12)]);
    expect(s.filter((x) => x.findingId).map((x) => x.findingId)).toEqual(["F1"]);
    expect(s.map((x) => x.text).join("")).toBe(text);
  });

  it("ignores findings without offsets and out-of-order input", () => {
    const s = segments(text, [f("F2", 23, 39), { id: "F3", start: null, end: null }, f("F1", 0, 2)]);
    expect(s.filter((x) => x.findingId).map((x) => x.findingId)).toEqual(["F1", "F2"]);
  });
});
