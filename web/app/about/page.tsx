import type { Metadata } from "next";
import Link from "next/link";
import evalDoc from "@/data/eval.json";
import { pct } from "@/lib/stats";
import type { EvalDoc } from "@/lib/types";

export const metadata: Metadata = {
  title: "How it works",
  description: "Case study: why Threshold is an eval harness and router rather than another coder, how the agent is built, what failed, and what's next.",
};

const ev = evalDoc as unknown as EvalDoc;

const PRINCIPLES = [
  ["Every code points at a sentence.", "Quotes are validated against the chart by character offset. A paraphrase is rejected and the model is asked again."],
  ["Only real codes exist.", "The coder looks codes up in the FY2027 ICD-10-CM table through tools. A header or invented code is sent back with its billable children."],
  ["Models label; code decides.", "LLMs read, choose codes, argue against them, and write queries. Ordering documents, DRG grouping, routing and linting are deterministic and unit-tested."],
  ["Accuracy in both directions.", "Over-coding is tracked as its own metric, the critic can only remove codes or lower confidence, and queries are linted so they can't lead a physician or mention money."],
  ["Escapes are the number that matters.", "Autonomy is only worth having if the stays that need a human still reach one. The threshold is chosen against escapes, not against accuracy."],
];

export default function About() {
  const a = ev.agent.at_default;
  const v1 = ev.history.find((h) => h.version === "v1")?.at_default;
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
      <p className="eyebrow">How it works</p>
      <h1 className="h-section mt-4 text-[36px] sm:text-[52px]">An autonomous coder is only as good as its off switch.</h1>
      <div className="prose-body mt-8 grid gap-5 text-[17px] leading-relaxed text-ink-soft">
        <p>
          On October 2, 2026, Akasa announced autonomous coding for inpatient stays, with a citation for every code, a
          confidence score, and a threshold the health system sets. I built Threshold the same day as my application for
          Software Engineer, Applied AI. It isn&rsquo;t a copy of that product. It&rsquo;s the part I&rsquo;d want to own
          behind it: the harness that tells you <em>which</em> stays to trust, the router that sends the rest to a coder
          with a reason, and the evals that keep both honest as prompts, models and code sets change.
        </p>
        <p>
          The job description asks for someone who can design agentic systems, run offline and online evals with
          statistics, and balance coding guidelines, user feedback and auditability. That&rsquo;s what this demo tries to
          show, on 24 synthetic charts, in one day.
        </p>
      </div>

      <h2 className="h-section mt-14 text-[28px]">Principles</h2>
      <ol className="mt-6 grid gap-4">
        {PRINCIPLES.map(([h, b], i) => (
          <li key={h} className="flex gap-4 rounded-xl bg-card p-5">
            <span className="stat text-[30px] text-coral">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3 className="text-[17px] font-semibold text-ink">{h}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{b}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="h-section mt-14 text-[28px]">Architecture</h2>
      <figure className="mt-6 rounded-xl bg-navy p-5 text-white sm:p-6">
        <pre className="overflow-x-auto font-mono text-[12.5px] leading-relaxed text-white/90" aria-label="Pipeline diagram">
{`chart ─▶ triage (code) ─▶ evidence (Haiku 4.5)  ── quotes validated by offset
                              │
                              ▼
                     coder (Sonnet 5.5) ◀─▶ index_lookup / tabular_lookup
                              │                (FY2027 ICD-10-CM, SQLite FTS5)
                              ▼           ── codes validated: billable, cited
                     critic (Sonnet 5.5)  ── can remove codes, lower confidence
                              │
                              ▼
               grouper (code) ─▶ router (code) ─▶ query (Sonnet + linter)
                              │
                              ▼
            JSONL trace ─▶ eval harness ─▶ CI gate ─▶ this site (replays)`}
        </pre>
        <figcaption className="mt-4 text-[13px] text-white/70">
          Python 3.12, Pydantic AI and Pydantic v2 for typed agent outputs and validators, FastAPI-ready service layer,
          numpy for the bootstrap. Next.js 16, React 19, Tailwind v4 and Motion for the site. Vitest, pytest and
          Playwright with axe in CI.
        </figcaption>
      </figure>
      <div className="mt-6 grid gap-4 text-[16px] leading-relaxed text-ink-soft">
        <p>
          <b className="text-ink">Why split it into agents?</b> Each stage has one job and one typed output, so each can
          be validated, priced and evaluated on its own. Extraction is cheap pattern work and runs on Haiku. Coding needs
          guideline judgment and tools, so it runs on Sonnet. The critic is a second, adversarial read: it was told to
          refute, not agree. The single-prompt baseline on the{" "}
          <Link href="/evals" className="font-semibold text-coral-ink underline-offset-2 hover:underline">evals page</Link>{" "}
          is there so this split has to earn its cost.
        </p>
        <p>
          <b className="text-ink">Why replays instead of a live button?</b> Recorded runs are deterministic, free to serve,
          and safe on a public URL. The trace schema is the same one a live run streams, so a rate-limited live mode
          (FastAPI with SSE on Fly.io) is a deployment step, not a rewrite.
        </p>
      </div>

      <h2 className="h-section mt-14 text-[28px]">The eval</h2>
      <div className="mt-5 grid gap-4 text-[16px] leading-relaxed text-ink-soft">
        <p>
          Each of the 24 charts started as an answer key: principal diagnosis, secondary codes with POA, DRG, and whether a
          human must look. Then the chart was written to produce it, with traps planted on purpose: a late CT addendum
          that contradicts the first read, &ldquo;probable sepsis&rdquo; at discharge (codable inpatient), sepsis documented
          then ruled out by a different physician, a lab-only kidney injury, malnutrition only in a dietitian&rsquo;s note,
          a hospital-acquired pressure ulcer, copy-forwarded progress notes.
        </p>
        <p>
          Metrics are micro-averaged at the code level with case-level bootstrap intervals, plus DRG match, principal
          accuracy, CC/MCC precision and recall, over- and under-coding against the key&rsquo;s DRG, citation validity,
          query compliance, cost and latency. The reviewer accept/reject buttons on each stay show where the online signal
          would come from: accept rate by confidence bin is how the threshold gets recalibrated in production.
        </p>
      </div>

      <h2 className="h-section mt-14 text-[28px]">What failed</h2>
      <div className="mt-5 grid gap-4 text-[16px] leading-relaxed text-ink-soft">
        <p>
          <b className="text-ink">Letting the model decide what blocks.</b> v1 asked the model to mark each issue as
          blocking. It over-held clean stays and let one through that needed a query.{" "}
          {v1 && (
            <>
              At the {ev.default_threshold.toFixed(2)} threshold, v1 coded {pct(v1.autonomy)} of stays autonomously with{" "}
              {v1.escaped} escape; v2, which has the model label impact and lets code decide, codes {pct(a.autonomy)} with{" "}
              {a.escaped}.
            </>
          )}{" "}
          The CI gate fails v1 on escapes. Details on the{" "}
          <Link href="/evals" className="font-semibold text-coral-ink underline-offset-2 hover:underline">evals page</Link>.
        </p>
        <p>
          <b className="text-ink">Parallel tool calls on one SQLite connection.</b> The first full run lost five stays to
          &ldquo;bad parameter or other API misuse&rdquo;: Pydantic AI runs sync tools in worker threads, and the code index
          shared a connection. A lock fixed it; a threaded test keeps it fixed.
        </p>
        <p>
          <b className="text-ink">Paraphrased citations.</b> The extraction model paraphrased quotes often enough that the
          validator re-prompted {Object.values(ev.retries).reduce((s, x) => s + x, 0)} outputs across the run. None reached
          the site, which is the point of validating, but it costs latency. Next step: ask for document offsets directly, or
          use the API&rsquo;s native citations.
        </p>
        <p>
          <b className="text-ink">Agents disagree with the key on minor codes.</b> Most remaining misses are status Z-codes
          and organism specificity that don&rsquo;t move the DRG. A real gold set would need adjudication rules for those,
          and probably a separate &ldquo;claim-affecting&rdquo; precision metric.
        </p>
      </div>

      <h2 className="h-section mt-14 text-[28px]">Limits, plainly</h2>
      <ul className="mt-5 grid gap-2 text-[16px] leading-relaxed text-ink-soft">
        <li>• Synthetic, short charts. Real stays are about 50,000 words across 60 to 100 documents.</li>
        <li>• Answer keys written by me, not credentialed coders, and not adjudicated.</li>
        <li>• The DRG grouper covers seven medical families with illustrative weights and a simplified CC/MCC list.</li>
        <li>• One run per stay; no variance estimate yet.</li>
        <li>• No CPT anywhere (AMA-licensed). No patient data anywhere.</li>
        <li>• Not affiliated with or endorsed by Akasa. Akasa&rsquo;s product details here come from its public site and press.</li>
      </ul>

      <h2 className="h-section mt-14 text-[28px]">What I&rsquo;d do next</h2>
      <ol className="mt-5 grid gap-2 text-[16px] leading-relaxed text-ink-soft">
        <li>1. Live mode: FastAPI + SSE on Fly.io, three curated charts, rate-limited, with &ldquo;this run vs recorded&rdquo; agreement shown.</li>
        <li>2. Variance: five runs per stay, and route on agreement across runs as a second confidence signal.</li>
        <li>3. A coder-reviewed gold subset with inter-rater agreement reported before adjudication.</li>
        <li>4. FY regression gate: replay the set whenever the code table changes (FY2027 took effect Oct 1).</li>
        <li>5. Calibration: fit isotonic regression on accept/reject feedback, and report expected calibration error.</li>
      </ol>

      <div className="mt-14 rounded-xl border-t-4 border-coral bg-card p-6">
        <p className="text-[16px] leading-relaxed text-ink-soft">
          Built by <a href="https://hafsausmani.com" className="font-semibold text-ink underline-offset-2 hover:underline">Hafsa Usmani</a>.
          Source, tests and recorded runs are on{" "}
          <a href="https://github.com/hafsau/akasa-demo" className="font-semibold text-ink underline-offset-2 hover:underline">GitHub</a>.
        </p>
      </div>
    </article>
  );
}
