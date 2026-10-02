import type { Metadata } from "next";
import Link from "next/link";
import evalDoc from "@/data/eval.json";
import { SweepChart, type Series } from "@/components/sweep-chart";
import { pct } from "@/lib/stats";
import type { EvalDoc, Interval, Summary } from "@/lib/types";

export const metadata: Metadata = {
  title: "Evals",
  description: "Offline evaluation of the Threshold agent: agent vs single-prompt baseline, threshold sweeps, error taxonomy, cost, and the CI gate.",
};

const ev = evalDoc as unknown as EvalDoc;
const T = ev.default_threshold;

const ci = (x: Interval, d = 0) => (Number.isFinite(x[1]) ? `${pct(x[1], d)}–${pct(x[2], d)}` : "");

export default function EvalsPage() {
  const a = ev.agent.at_default;
  const b = ev.baseline?.at_default;
  const v1 = ev.history.find((h) => h.version === "v1");
  const cur = ev.history.find((h) => h.version === "current")!;

  const series: Series[] = [
    { key: "current", label: "Agent", points: ev.sweep.agent },
    ...(ev.sweep.baseline.length ? [{ key: "baseline" as const, label: "Baseline", points: ev.sweep.baseline }] : []),
    ...(v1 ? [{ key: "v1" as const, label: "Agent v1", points: v1.sweep, dashed: true }] : []),
  ];
  const totalCost = ev.stage_costs.reduce((s, x) => s + x.cost_usd, 0);
  const retries = Object.values(ev.retries).reduce((s, x) => s + x, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
      <p className="eyebrow">Evals</p>
      <h1 className="h-section mt-4 max-w-3xl text-[36px] sm:text-[52px]">The eval is the product.</h1>
      <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-ink-soft">
        {a.n} synthetic inpatient stays, each with an answer key written <em>before</em> its chart: codes, principal
        diagnosis, DRG, and whether a human was required. Every number below is recomputed from recorded runs by the
        same Python that gates CI. Intervals are 95% case-level bootstrap; at n = {a.n} they are honest, which means
        wide.
      </p>
      <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 text-[13px] text-ink-dim">
        <Meta k="Prompt version" v={ev.prompt_version} />
        <Meta k="Operating threshold" v={T.toFixed(2)} />
        <Meta k="Models" v="Haiku 4.5 (evidence) · Sonnet 5.5 (coder, critic, query)" />
        <Meta k="Recorded" v={ev.generated} />
      </dl>

      <section className="mt-14">
        <span className="accent-bar" />
        <h2 className="h-section mt-4 text-[28px] sm:text-[36px]">Agent vs one prompt</h2>
        <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-ink-soft">
          The baseline is the same Sonnet model given the whole chart and asked for codes: no tools, no evidence step, no
          critic, no validators. It routes on its own stated confidence and &ldquo;needs review&rdquo; flag. Same answer
          key, same threshold.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <caption className="sr-only">Agent versus baseline at threshold {T.toFixed(2)}</caption>
            <thead className="bg-card text-[12px] tracking-[0.06em] text-ink-dim uppercase">
              <tr>
                <th className="px-4 py-3 font-bold">At {T.toFixed(2)}</th>
                <th className="px-4 py-3 font-bold">Agent</th>
                <th className="px-4 py-3 font-bold">95% CI</th>
                <th className="px-4 py-3 font-bold">Baseline</th>
                <th className="px-4 py-3 font-bold">95% CI</th>
              </tr>
            </thead>
            <tbody className="tnum">
              <Row label="Stays coded autonomously" a={`${pct(a.autonomy)} (${a.n_auto})`} b={b && `${pct(b.autonomy)} (${b.n_auto})`} />
              <Row label="Escapes (needed a human, got through)" a={`${a.escaped}`} b={b && `${b.escaped}`} strong />
              <Row label="Held needlessly" a={`${a.held_needlessly}`} b={b && `${b.held_needlessly}`} />
              <RowCI label="Code precision (autonomous)" s={a} bs={b} k="code_precision" d={1} />
              <RowCI label="Code recall (autonomous)" s={a} bs={b} k="code_recall" d={1} />
              <RowCI label="CC/MCC precision" s={a} bs={b} k="ccmcc_precision" />
              <RowCI label="CC/MCC recall" s={a} bs={b} k="ccmcc_recall" />
              <RowCI label="DRG match" s={a} bs={b} k="drg_match" />
              <RowCI label="Principal diagnosis correct" s={a} bs={b} k="pdx_accuracy" />
              <RowCI label="Over-coded (DRG above key)" s={a} bs={b} k="overcoding_rate" strong />
              <RowCI label="Under-coded (DRG below key)" s={a} bs={b} k="undercoding_rate" />
              <Row label="Invalid or non-billable codes" a={pct(a.invalid_code_rate, 1)} b={b && pct(b.invalid_code_rate, 1)} />
              <Row
                label="Cost per stay (all stays)"
                a={`$${ev.agent.all.cost_mean.toFixed(3)}`}
                b={ev.baseline && `$${ev.baseline.all.cost_mean.toFixed(3)}`}
              />
              <Row
                label="Latency p50 / p95"
                a={`${(ev.agent.all.latency_p50_ms / 1000).toFixed(0)}s / ${(ev.agent.all.latency_p95_ms / 1000).toFixed(0)}s`}
                b={ev.baseline && `${(ev.baseline.all.latency_p50_ms / 1000).toFixed(0)}s / ${(ev.baseline.all.latency_p95_ms / 1000).toFixed(0)}s`}
              />
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-ink-dim">
          On the stays each system finalizes on its own, both get the DRG right; these charts are short and the traps are
          about documentation, not grouping. The difference is in what gets through without a human, how much reaches
          autonomy at all, and whether each code can be explained with a verbatim quote.
        </p>
      </section>

      <section className="mt-16 grid gap-6 lg:grid-cols-2">
        <SweepChart title="Share of stays coded autonomously" metric="autonomy" series={series} marker={T} />
        <SweepChart title="Escape rate: stays that needed a human but got through" metric="escape_rate" series={series} marker={T} />
      </section>

      {v1 && (
        <section className="mt-16 grid gap-8 rounded-xl bg-card p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="eyebrow">What failed</p>
            <h2 className="h-section mt-3 text-[26px] sm:text-[32px]">v1 let the model decide what blocks autonomy.</h2>
            <div className="mt-4 grid gap-3 text-[15px] leading-relaxed text-ink-soft">
              <p>
                In v1 every issue carried a <code className="font-mono text-[13px]">blocks_autonomy</code> boolean set by
                the coder or critic. Error analysis on the first full run found the model was noisy about it in both
                directions:
              </p>
              <ul className="ml-5 list-disc">
                <li>
                  It <b>over-held</b> clean stays, blocking on a non-specific knee-osteoarthritis code, on a stale
                  copy-forwarded line that newer notes had superseded, and on a &ldquo;questioned&rdquo; principal whose
                  alternative grouped to the same DRG.
                </li>
                <li>
                  It let the heart-failure stay <b>escape</b>: a creatinine rise no provider named was flagged as a query
                  opportunity, but not as blocking.
                </li>
              </ul>
              <p>
                v2 splits the job. The model labels each issue&rsquo;s <em>impact</em> on the claim (principal, severity,
                none). <code className="font-mono text-[13px]">router.py</code> decides with rules a reviewer can read:
                block on provider questions that can move the claim, on critic doubts about codes that set the DRG, on a
                questioned principal only if it regroups, and on any hospital-acquired condition coded POA = N. Because
                routing is plain code over recorded labels, that last rule was applied to every recorded run with no new
                model calls.
              </p>
            </div>
          </div>
          <div className="grid content-start gap-4">
            <table className="w-full text-left text-[14px] tnum">
              <caption className="mb-2 text-left text-[12px] font-bold tracking-[0.08em] text-ink-dim uppercase">
                Same {a.n} charts, threshold {T.toFixed(2)}
              </caption>
              <thead className="text-[12px] text-ink-dim">
                <tr className="border-b border-line-strong">
                  <th className="py-2 font-semibold" />
                  <th className="py-2 font-semibold">v1</th>
                  <th className="py-2 font-semibold">v2</th>
                </tr>
              </thead>
              <tbody>
                <HistRow label="Coded autonomously" a={pct(v1.at_default.autonomy)} b={pct(cur.at_default.autonomy)} />
                <HistRow label="Held needlessly" a={`${v1.at_default.held_needlessly}`} b={`${cur.at_default.held_needlessly}`} />
                <HistRow label="Escapes" a={`${v1.at_default.escaped}`} b={`${cur.at_default.escaped}`} />
                <HistRow label="Code precision" a={pct(v1.at_default.code_precision[0], 1)} b={pct(cur.at_default.code_precision[0], 1)} />
              </tbody>
            </table>
            <pre className="overflow-x-auto rounded-lg bg-navy p-4 font-mono text-[12px] leading-relaxed text-white/90" aria-label="CI gate output">
{`$ uv run python gate.py --runs agent-v1
✓ code precision (auto)   ${pct(v1.at_default.code_precision[0], 1)} >= 92%
✓ DRG match (auto)        ${pct(v1.at_default.drg_match[0])} >= 95%
✓ over-coding rate        ${pct(v1.at_default.overcoding_rate[0])} <= 0%
✗ escape rate             ${pct(v1.at_default.escape_rate ?? 0, 1)} <= 0%
exit 1

$ uv run python gate.py
✓ … all five checks pass
exit 0`}
            </pre>
            <p className="text-[13px] text-ink-dim">
              The CI gate re-scores committed runs on every PR, with no API calls: a worse recording, an edited answer key,
              or a grouper change that moves a DRG fails the build.
            </p>
          </div>
        </section>
      )}

      <section className="mt-16 grid gap-10 lg:grid-cols-2">
        <div>
          <span className="accent-bar" />
          <h2 className="h-section mt-4 text-[26px]">Where the remaining errors are</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            Code-level misses grouped by the trap planted in the chart. Most are secondary-code choices that don&rsquo;t move
            the DRG (a status Z-code, a more specific organism), which is why precision is below DRG match.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-[14px] tnum">
              <caption className="sr-only">Error taxonomy by planted trap</caption>
              <thead className="text-[12px] tracking-[0.06em] text-ink-dim uppercase">
                <tr className="border-b border-line-strong">
                  <th className="py-2 font-bold">Trap</th>
                  <th className="py-2 font-bold">Extra</th>
                  <th className="py-2 font-bold">Missed</th>
                  <th className="py-2 font-bold">DRG</th>
                  <th className="py-2 font-bold">Stays</th>
                </tr>
              </thead>
              <tbody>
                {ev.taxonomy.map((t) => (
                  <tr key={t.trap} className="border-b border-line">
                    <td className="py-2 font-medium">{t.trap.replaceAll("_", " ")}</td>
                    <td className="py-2">{t.fp}</td>
                    <td className="py-2">{t.fn}</td>
                    <td className="py-2">{t.drg_miss}</td>
                    <td className="py-2">
                      {t.cases.map((c) => (
                        <Link key={c} href={`/encounter/${c}`} className="mr-2 font-semibold text-coral-ink underline-offset-2 hover:underline">
                          {c.replace("enc-", "")}
                        </Link>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <span className="accent-bar" />
          <h2 className="h-section mt-4 text-[26px]">What a stay costs</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            Average per stay, from recorded token usage at list prices. Validators rejected and re-prompted {retries}{" "}
            {retries === 1 ? "output" : "outputs"} across the run (mostly paraphrased quotes); none reached the result.
          </p>
          <table className="mt-5 w-full text-left text-[14px] tnum">
            <caption className="sr-only">Cost and latency by pipeline stage</caption>
            <thead className="text-[12px] tracking-[0.06em] text-ink-dim uppercase">
              <tr className="border-b border-line-strong">
                <th className="py-2 font-bold">Stage</th>
                <th className="py-2 font-bold">Model</th>
                <th className="py-2 font-bold">Tokens in / out</th>
                <th className="py-2 font-bold">Time</th>
                <th className="py-2 font-bold">Cost</th>
              </tr>
            </thead>
            <tbody>
              {ev.stage_costs.filter((s) => s.model).map((s) => (
                <tr key={s.stage} className="border-b border-line">
                  <td className="py-2 font-medium capitalize">{s.stage}</td>
                  <td className="py-2 text-ink-soft">{s.model?.replace("claude-", "")}</td>
                  <td className="py-2">{(s.input_tokens / 1000).toFixed(1)}k / {(s.output_tokens / 1000).toFixed(1)}k</td>
                  <td className="py-2">{(s.ms / 1000).toFixed(1)}s</td>
                  <td className="py-2">${s.cost_usd.toFixed(3)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-bold" colSpan={4}>Total per stay</td>
                <td className="py-2 font-bold">${totalCost.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[13px] text-ink-dim">
            Queries are drafted only for held stays, so their cost is spread across all stays. Next lever: prompt-cache the
            chart across the coder and critic calls, which share it as the largest input.
          </p>
        </div>
      </section>

      <section className="mt-16 rounded-xl border-t-4 border-navy bg-card p-6 sm:p-8">
        <h2 className="text-[20px] font-semibold">How to read these numbers</h2>
        <ul className="mt-3 grid gap-2 text-[15px] leading-relaxed text-ink-soft sm:grid-cols-2 sm:gap-x-10">
          <li>• Charts are synthetic and short (500–1,000 words; real stays run around 50,000).</li>
          <li>• Answer keys were written by the author before each chart, not by credentialed coders.</li>
          <li>• Charts were written by Claude in a separate session; the agent runs on Haiku and Sonnet. Same family, so some circularity is possible.</li>
          <li>• DRG weights and the CC/MCC list are illustrative; codes are real FY2027 ICD-10-CM.</li>
          <li>• One recorded run per stay. Run-to-run variance is not yet measured; that&rsquo;s the next eval.</li>
          <li>• Re-run on Akasa&rsquo;s gold set, these numbers would mean something. The harness is the point.</li>
        </ul>
      </section>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold tracking-[0.08em] uppercase">{k}</dt>
      <dd className="mt-1 font-semibold text-ink">{v}</dd>
    </div>
  );
}

function Row({ label, a, b, strong }: { label: string; a: string; b?: string | null | false; strong?: boolean }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className={`px-4 py-2.5 ${strong ? "font-bold" : "font-medium"}`}>{label}</th>
      <td className={`px-4 py-2.5 ${strong ? "font-bold" : "font-semibold"}`}>{a}</td>
      <td className="px-4 py-2.5 text-ink-dim" />
      <td className="px-4 py-2.5">{b || "–"}</td>
      <td className="px-4 py-2.5 text-ink-dim" />
    </tr>
  );
}

function RowCI({
  label,
  s,
  bs,
  k,
  d = 0,
  strong,
}: {
  label: string;
  s: Summary;
  bs?: Summary;
  k: "code_precision" | "code_recall" | "ccmcc_precision" | "ccmcc_recall" | "drg_match" | "pdx_accuracy" | "overcoding_rate" | "undercoding_rate";
  d?: number;
  strong?: boolean;
}) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className={`px-4 py-2.5 ${strong ? "font-bold" : "font-medium"}`}>{label}</th>
      <td className={`px-4 py-2.5 ${strong ? "font-bold" : "font-semibold"}`}>{pct(s[k][0], d)}</td>
      <td className="px-4 py-2.5 text-[13px] text-ink-dim">{ci(s[k], d)}</td>
      <td className="px-4 py-2.5">{bs ? pct(bs[k][0], d) : "–"}</td>
      <td className="px-4 py-2.5 text-[13px] text-ink-dim">{bs ? ci(bs[k], d) : ""}</td>
    </tr>
  );
}

function HistRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr className="border-b border-line">
      <th scope="row" className="py-2 font-medium">{label}</th>
      <td className="py-2 text-ink-dim">{a}</td>
      <td className="py-2 font-bold">{b}</td>
    </tr>
  );
}
