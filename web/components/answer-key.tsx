import type { EncounterDoc } from "@/lib/types";

export function AnswerKey({ doc, routedAuto }: { doc: EncounterDoc; routedAuto: boolean }) {
  const { case: c, run, baseline, score } = doc;
  const gold = [c.gold.pdx, ...c.gold.secondary.map((s) => s.code)];
  const pred = new Set(run.codes.map((r) => r.code));
  const extra = run.codes.filter((r) => !gold.includes(r.code));
  const humanNeeded = c.gold.route === "coder";
  const routedRight = humanNeeded ? run.confidence < 0.8 || run.blocking_issues > 0 : true;
  void routedAuto;

  return (
    <section className="grid gap-6 rounded-xl border-t-4 border-navy bg-card p-6 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <p className="eyebrow">Answer key, written before the chart</p>
        <h2 className="h-section mt-3 text-[26px]">How the agent did on this stay</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{c.gold.explanation}</p>
        <div className="mt-5 flex flex-wrap gap-2.5 text-[13px] font-semibold">
          <Pill ok={score.drg_ok}>DRG {score.pred_drg} {score.drg_ok ? "matches" : `vs key ${score.gold_drg}`}</Pill>
          <Pill ok={score.pdx_ok}>Principal {score.pdx_ok ? "correct" : "differs"}</Pill>
          <Pill ok={score.fp === 0 && score.fn === 0}>
            {score.tp}/{gold.length} codes{score.fp ? `, ${score.fp} extra` : ""}
          </Pill>
          <Pill ok={routedRight}>
            {humanNeeded ? (routedRight ? "Held, as the key requires" : "Should have been held") : "Key: safe to auto-code"}
          </Pill>
        </div>
        {c.gold.hold_reasons.length > 0 && (
          <ul className="mt-4 grid gap-1 text-[13px] text-ink-soft">
            {c.gold.hold_reasons.map((h, i) => (
              <li key={i}>• {h}</li>
            ))}
          </ul>
        )}
        {c.gold.traps.length > 0 && (
          <p className="mt-4 text-[12px] text-ink-dim">
            Traps planted in this chart: {c.gold.traps.map((t) => t.replaceAll("_", " ")).join(", ")}
          </p>
        )}
      </div>
      <div className="grid content-start gap-4">
        <table className="w-full text-left text-[13px]">
          <caption className="mb-2 text-left text-[12px] font-bold tracking-[0.08em] text-ink-dim uppercase">Key vs agent</caption>
          <tbody>
            {gold.map((g) => (
              <tr key={g} className="border-b border-line">
                <td className="py-1.5 font-mono font-semibold">{g}</td>
                <td className={`py-1.5 text-right font-semibold ${pred.has(g) ? "text-teal-ink" : "text-coral-ink"}`}>
                  {pred.has(g) ? "✓ found" : "✗ missed"}
                </td>
              </tr>
            ))}
            {extra.map((r) => (
              <tr key={r.code} className="border-b border-line">
                <td className="py-1.5 font-mono font-semibold">{r.code}</td>
                <td className="py-1.5 text-right font-semibold text-coral-ink">+ not in key</td>
              </tr>
            ))}
          </tbody>
        </table>
        {baseline && (
          <div className="rounded-lg bg-paper p-4 text-[13px]">
            <p className="text-[12px] font-bold tracking-[0.08em] text-ink-dim uppercase">Single-prompt baseline, same chart</p>
            <p className="mt-2 font-mono text-[12.5px] leading-relaxed">
              {baseline.codes.map((b, i) => (
                <span key={i} className={`mr-2 ${!b.valid ? "text-coral-ink line-through" : gold.includes(b.code) ? "" : "text-coral-ink"}`}>
                  {b.code}
                </span>
              ))}
            </p>
            <p className="mt-2 text-ink-soft">
              DRG {baseline.drg.number ?? "–"} · confidence {baseline.confidence.toFixed(2)} · {baseline.needs_human ? "asked for review" : "did not ask for review"} · $
              {baseline.cost_usd.toFixed(3)} vs ${run.cost_usd.toFixed(3)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-md px-2.5 py-1.5 ${ok ? "bg-teal-wash text-teal-ink" : "bg-coral-wash text-coral-ink"}`}>
      {ok ? "✓" : "✗"} {children}
    </span>
  );
}
