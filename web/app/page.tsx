import Link from "next/link";
import encounters from "@/data/encounters.json";
import evalDoc from "@/data/eval.json";
import { ThresholdView } from "@/components/threshold-view";
import { Orbits } from "@/components/orbits";
import { pct } from "@/lib/stats";
import type { EvalDoc, Row } from "@/lib/types";

const rows = encounters.agent as unknown as Row[];
const ev = evalDoc as unknown as EvalDoc;

const STEPS = [
  { n: "01", name: "Triage", who: "code", body: "Orders the documents, flags addenda and the discharge summary." },
  { n: "02", name: "Evidence", who: "Haiku 4.5", body: "Pulls every relevant statement as a verbatim quote. Quotes that aren't in the chart are rejected." },
  { n: "03", name: "Coder", who: "Sonnet 5.5 + tools", body: "Looks codes up in the real FY2027 code set. Non-billable or invented codes are sent back." },
  { n: "04", name: "Critic", who: "Sonnet 5.5", body: "Tries to refute every code like a payer auditor. Can remove codes and lower confidence, never raise it." },
  { n: "05", name: "Grouper + router", who: "code", body: "DRG is arithmetic, not a model output. One confidence per stay decides who finalizes it." },
  { n: "06", name: "Query", who: "Sonnet 5.5 + linter", body: "Drafts a neutral provider query for held stays. A linter blocks leading or money language." },
];

export default function Home() {
  const heroes = rows.filter((r) => r.hero);
  const a = ev.agent.at_default;
  const b = ev.baseline?.at_default;
  return (
    <>
      <section className="on-navy relative overflow-hidden bg-navy text-white">
        <Orbits />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <p className="eyebrow">A concept for the autonomous mid-cycle</p>
          <h1 className="h-display mt-5 max-w-4xl text-[40px] sm:text-[60px]">
            Autonomous coding launched today.
            <span className="mt-3 block text-coral">Here&rsquo;s how you&rsquo;d know when to trust it.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-[18px] leading-relaxed text-white/80">
            Threshold is the eval harness and exception router I&rsquo;d want behind an autonomous inpatient coder. An
            agent reads each chart, cites every code to the exact sentence, and scores its own confidence. You choose
            where autonomy stops.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#threshold" className="rounded-md bg-coral-ink px-5 py-3.5 text-[14px] font-semibold tracking-wide text-white uppercase hover:bg-coral-deep">
              Move the threshold
            </a>
            <Link
              href={`/encounter/${heroes[0]?.id ?? "enc-01"}`}
              className="rounded-md bg-white/10 px-5 py-3.5 text-[14px] font-semibold tracking-wide text-white uppercase ring-1 ring-white/25 hover:bg-white/15"
            >
              Watch a chart get coded
            </Link>
          </div>
          <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-8 border-t border-navy-line pt-8 sm:grid-cols-4">
            <HeroStat value={String(rows.length)} label="synthetic stays, real agent runs" />
            <HeroStat value={pct(a.autonomy)} label={`coded autonomously at ${ev.default_threshold.toFixed(2)}`} />
            <HeroStat value={pct(a.code_precision[0], 1)} label="code precision when autonomous" />
            <HeroStat value={pct(a.overcoding_rate[0])} label="over-coded when autonomous" />
          </dl>
        </div>
      </section>

      <section id="threshold" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-20">
        <span className="accent-bar" />
        <h2 className="h-section mt-5 max-w-3xl text-[32px] sm:text-[44px]">You set the threshold. The evidence moves with it.</h2>
        <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-ink-soft">
          Drag the line. Stays spring between lanes and every metric recomputes from the recorded runs, graded against
          an answer key written before each chart. The number to watch is escapes: stays that needed a human but got
          through.
        </p>
        <div className="mt-10">
          <ThresholdView rows={rows} initial={ev.default_threshold} />
        </div>
      </section>

      <section className="bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <span className="accent-bar" />
          <h2 className="h-section mt-5 max-w-3xl text-[32px] sm:text-[44px]">Four charts worth watching</h2>
          <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-ink-soft">
            Each replays the real agent trace: every tool call, every rejected quote, every code the critic removed.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {heroes.map((h) => (
              <Link
                key={h.id}
                href={`/encounter/${h.id}`}
                className="group rounded-xl border-t-4 border-coral bg-paper p-6 shadow-soft transition-transform hover:-translate-y-0.5"
              >
                <p className="eyebrow">
                  Agent {h.confidence >= ev.default_threshold ? "coded it autonomously" : "held it for a coder"} · {h.confidence.toFixed(2)}
                </p>
                <h3 className="mt-3 text-[22px] leading-tight font-semibold group-hover:text-coral-ink">{h.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{h.summary}</p>
                <p className="mt-4 text-[13px] font-bold tracking-wide text-coral-ink uppercase">Replay the trace →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <span className="accent-bar" />
        <h2 className="h-section mt-5 max-w-3xl text-[32px] sm:text-[44px]">Models where judgment is needed. Code everywhere else.</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl bg-card p-6">
              <div className="flex items-baseline justify-between">
                <span className="stat text-[34px] text-coral">{s.n}</span>
                <span
                  className={`rounded-sm px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase ${
                    s.who === "code" ? "bg-line text-ink-soft" : "bg-teal-wash text-teal-ink"
                  }`}
                >
                  {s.who}
                </span>
              </div>
              <h3 className="mt-3 text-[20px] font-semibold">{s.name}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {b && (
        <section className="on-navy relative overflow-hidden bg-navy text-white">
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="eyebrow">Does the agent earn its cost?</p>
              <h2 className="h-section mt-5 text-[32px] sm:text-[44px]">Same charts, one prompt, no tools.</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-white/80">
                A single-prompt baseline on the same model reads each chart once and returns codes. Same answer key,
                same threshold. The agent costs more per stay. The evals page shows exactly what that buys.
              </p>
              <Link href="/evals" className="mt-7 inline-block rounded-md bg-coral-ink px-5 py-3.5 text-[14px] font-semibold tracking-wide text-white uppercase hover:bg-coral-deep">
                See the evals
              </Link>
            </div>
            <table className="w-full self-center text-left text-[15px]">
              <caption className="sr-only">Agent versus single-prompt baseline at threshold {ev.default_threshold}</caption>
              <thead>
                <tr className="border-b border-navy-line text-[12px] tracking-wide text-white/60 uppercase">
                  <th className="py-3 font-semibold">At {ev.default_threshold.toFixed(2)}</th>
                  <th className="py-3 font-semibold">Agent</th>
                  <th className="py-3 font-semibold">Baseline</th>
                </tr>
              </thead>
              <tbody className="tnum">
                <Cmp label="Code precision" a={pct(a.code_precision[0], 1)} b={pct(b.code_precision[0], 1)} />
                <Cmp label="DRG match" a={pct(a.drg_match[0])} b={pct(b.drg_match[0])} />
                <Cmp label="Escapes" a={`${a.escaped ?? 0}`} b={`${b.escaped ?? 0}`} />
                <Cmp label="Invalid codes" a={pct(a.invalid_code_rate, 1)} b={pct(b.invalid_code_rate, 1)} />
                <Cmp label="Cost per stay" a={`$${ev.agent.all.cost_mean.toFixed(3)}`} b={`$${ev.baseline!.all.cost_mean.toFixed(3)}`} />
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="stat text-[44px] text-white">{value}</dd>
      <dd className="mt-2 text-[13px] leading-snug text-white/70">{label}</dd>
    </div>
  );
}

function Cmp({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr className="border-b border-navy-line">
      <th scope="row" className="py-3 font-medium text-white/80">{label}</th>
      <td className="py-3 font-semibold">{a}</td>
      <td className="py-3 text-white/70">{b}</td>
    </tr>
  );
}
