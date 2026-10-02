"use client";

import Link from "next/link";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";
import { atThreshold, pct } from "@/lib/stats";
import type { Interval, Row } from "@/lib/types";
import { TermTip } from "./term-tip";

const FAMILY_LABEL: Record<string, string> = {
  sepsis: "Sepsis",
  uti: "UTI",
  hf: "Heart failure",
  pneumonia: "Pneumonia",
  pe: "Pulmonary embolism",
  copd: "COPD",
  aki: "Kidney injury",
};

export function ThresholdView({ rows, initial }: { rows: Row[]; initial: number }) {
  const [t, setT] = useState(initial);
  const deferred = useDeferredValue(t);
  const view = useMemo(() => atThreshold(rows, deferred), [rows, deferred]);
  const reduce = useReducedMotion();
  const sortByConf = (a: Row, b: Row) => b.confidence - a.confidence;

  return (
    <div>
      <div className="grid gap-6 rounded-xl border border-line bg-paper p-5 shadow-soft sm:p-7 lg:grid-cols-[1.1fr_2fr] lg:gap-10">
        <div>
          <label htmlFor="threshold-input" className="eyebrow">
            Confidence threshold
          </label>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="stat text-[56px] text-ink" aria-hidden>
              {t.toFixed(2)}
            </span>
            <span className="text-sm text-ink-dim">auto-code at or above</span>
          </div>
          <input
            id="threshold-input"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
            className="threshold-range mt-3"
            style={{ ["--fill" as string]: `${t * 100}%` }}
            aria-valuetext={`${t.toFixed(2)}: ${view.auto.length} of ${rows.length} stays coded autonomously`}
          />
          <div className="mt-1 flex justify-between text-[12px] font-medium text-ink-dim">
            <span>Code everything</span>
            <span>Review everything</span>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            Each stay gets one confidence score from the agent. Stays at or above the line are finalized without a
            human. Everything below goes to a coder, with the reason it was held.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-6 self-center sm:grid-cols-4" aria-live="polite">
          <Stat label="Coded autonomously" value={pct(view.autonomy)} sub={`${view.auto.length} of ${rows.length} stays`} />
          <Stat
            label={<TermTip term="precision">Code precision</TermTip>}
            value={pct(view.precision[0], 1)}
            sub={ci(view.precision)}
          />
          <Stat
            label={<TermTip term="drg">DRG match</TermTip>}
            value={pct(view.drgMatch[0])}
            sub={ci(view.drgMatch)}
          />
          <Stat
            label={<TermTip term="overcoding" align="right">Over-coded</TermTip>}
            value={pct(view.overcoding[0])}
            sub={ci(view.overcoding)}
            tone={view.overcoding[0] > 0 ? "coral" : "ink"}
          />
          <div className="col-span-2 rounded-lg bg-card px-4 py-3 text-[14px] text-ink-soft sm:col-span-4">
            {view.escaped.length === 0 ? (
              <>
                <span className="font-semibold text-teal-ink">No escapes.</span> Every stay that needed a human was
                held at this threshold.
              </>
            ) : (
              <>
                <span className="font-semibold text-coral-ink">
                  {view.escaped.length} {view.escaped.length === 1 ? "stay" : "stays"} escaped
                </span>{" "}
                review that the answer key says needed a human ({pct(view.escapeRate)} of them). Outlined in coral below.
              </>
            )}
          </div>
        </div>
      </div>

      <LayoutGroup>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Lane
            title="Coded autonomously"
            tone="teal"
            rows={[...view.auto].sort(sortByConf)}
            reduce={!!reduce}
            empty="Nothing clears this threshold."
          />
          <Lane
            title="Sent to a coder"
            tone="coral"
            rows={[...view.held].sort(sortByConf)}
            reduce={!!reduce}
            empty="Nothing held. Every stay is finalized without review."
          />
        </div>
      </LayoutGroup>
      <p className="mt-4 text-[13px] text-ink-dim">
        n = {rows.length} synthetic stays. Intervals are 95% case-level bootstrap. With this few cases they are wide on
        purpose: the point is the method, not the number.
      </p>
    </div>
  );
}

function ci(x: Interval) {
  return Number.isFinite(x[1]) ? `95% CI ${pct(x[1])}–${pct(x[2])}` : "no stays";
}

function Stat({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: React.ReactNode;
  value: string;
  sub: string;
  tone?: "ink" | "coral";
}) {
  return (
    <dl>
      <dt className="text-[12px] font-bold tracking-[0.06em] text-ink-dim uppercase">{label}</dt>
      <dd className={`stat mt-2 text-[40px] ${tone === "coral" ? "text-coral-ink" : "text-ink"}`}>{value}</dd>
      <dd className="mt-1.5 text-[12px] text-ink-dim tnum">{sub}</dd>
    </dl>
  );
}

function Lane({
  title,
  tone,
  rows,
  reduce,
  empty,
}: {
  title: string;
  tone: "teal" | "coral";
  rows: Row[];
  reduce: boolean;
  empty: string;
}) {
  return (
    <section aria-label={title} className="rounded-xl bg-card p-4 sm:p-5">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-[17px] font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${tone === "teal" ? "bg-teal" : "bg-coral"}`} aria-hidden />
          {title}
        </h3>
        <span className="stat text-[28px] text-ink tnum">{rows.length}</span>
      </header>
      <ul className="grid gap-2.5" data-testid={`lane-${tone}`}>
        {rows.map((r) => (
          <motion.li
            key={r.id}
            layout={!reduce}
            layoutId={reduce ? undefined : r.id}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <Card row={r} lane={tone} />
          </motion.li>
        ))}
        {rows.length === 0 && <li className="py-8 text-center text-sm text-ink-dim">{empty}</li>}
      </ul>
    </section>
  );
}

function Card({ row, lane }: { row: Row; lane: "teal" | "coral" }) {
  const escaped = lane === "teal" && row.gold_route === "coder";
  const wrong = !row.drg_ok || row.fp > 0 || row.fn > 0;
  return (
    <Link
      href={`/encounter/${row.id}`}
      className={`group block rounded-lg border bg-paper px-4 py-3 transition-shadow hover:shadow-soft ${
        escaped ? "border-coral ring-2 ring-coral/25" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold group-hover:text-coral-ink">{row.title}</p>
          <p className="mt-0.5 text-[12px] text-ink-dim">
            {FAMILY_LABEL[row.family] ?? row.family} · DRG {row.pred_drg ?? "–"}
            {row.hero && <span className="ml-2 font-semibold text-coral-ink">Walkthrough</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-[15px] font-bold tnum">{row.confidence.toFixed(2)}</span>
          <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-line" aria-hidden>
            <div
              className={`h-full ${lane === "teal" ? "bg-teal" : "bg-coral"}`}
              style={{ width: `${row.confidence * 100}%` }}
            />
          </div>
        </div>
      </div>
      {(escaped || (lane === "teal" && wrong)) && (
        <p className="mt-2 text-[12px] font-medium text-coral-ink">
          {escaped ? "Answer key says a human was needed" : `Differs from answer key: ${describeMiss(row)}`}
        </p>
      )}
    </Link>
  );
}

function describeMiss(r: Row) {
  const bits = [];
  if (!r.drg_ok) bits.push(`DRG ${r.pred_drg} vs ${r.gold_drg}`);
  if (r.fp) bits.push(`+${r.fp_codes.join(", ")}`);
  if (r.fn) bits.push(`missed ${r.fn_codes.join(", ")}`);
  return bits.join(" · ");
}
