"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodeRow, EncounterDoc, Finding, TraceEvent } from "@/lib/types";
import { ChartDocs } from "./chart-docs";
import { TraceLog } from "./trace-log";
import { CodesPanel } from "./codes-panel";
import { AnswerKey } from "./answer-key";
import { spreadStageEvents } from "@/lib/timeline";
import { TermTip } from "./term-tip";

const REPLAY_SECONDS = 16; // the whole recorded run, compressed to this

export function Replay({ doc, prev, next }: { doc: EncounterDoc; prev: string | null; next: string | null }) {
  const { case: c, run } = doc;
  const reduce = useReducedMotion();
  const total = run.ms;
  const [rawClock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [touched, setTouched] = useState(false);
  // Reduced motion: no replay, show the finished run until the visitor asks for one.
  const clock = reduce && !touched ? total : rawClock;
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const speed = total / (REPLAY_SECONDS * 1000);

  useEffect(() => {
    if (reduce) return;
    const id = requestAnimationFrame(() => setPlaying(true));
    return () => cancelAnimationFrame(id);
  }, [reduce]);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      if (last.current != null) {
        setClock((t) => {
          const nt = Math.min(total, t + (now - last.current!) * speed);
          if (nt >= total) setPlaying(false);
          return nt;
        });
      }
      last.current = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = null;
    };
  }, [playing, speed, total]);

  const done = clock >= total;
  const events = useMemo(() => spreadStageEvents(run.events), [run.events]);
  const seen = useMemo(() => events.filter((e) => e.t <= clock), [events, clock]);
  const reached = useCallback((stage: string, type = "output") => seen.some((e) => e.stage === stage && e.type === type), [seen]);

  const evidenceDone = reached("evidence");
  const coderDone = reached("coder");
  const criticDone = reached("critic");
  const grouperDone = reached("grouper");
  const routerDone = reached("router");
  const currentStage = [...seen].reverse().find((e) => e.type === "stage_start")?.stage ?? "triage";

  const findings: Finding[] = evidenceDone ? run.findings : [];
  const activeFindings = useMemo(() => {
    if (!activeCode) return new Set<string>();
    const row = [...run.codes, ...run.removed].find((r) => r.code === activeCode);
    return new Set(row?.finding_ids ?? []);
  }, [activeCode, run.codes, run.removed]);

  const routedAuto = run.blocking_issues === 0 && run.confidence >= 0.8;

  return (
    <div>
      <section className="border-b border-line bg-card">
        <div className="mx-auto max-w-[1400px] px-4 pt-8 pb-6">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center justify-between gap-3 text-[13px] font-semibold text-ink-dim">
            <Link href="/#threshold" className="hover:text-coral-ink">← All stays</Link>
            <span className="flex gap-4">
              {prev && <Link href={`/encounter/${prev}`} className="hover:text-coral-ink">‹ Previous</Link>}
              {next && <Link href={`/encounter/${next}`} className="hover:text-coral-ink">Next ›</Link>}
            </span>
          </nav>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <p className="eyebrow">
                {c.id} · {c.patient.age}
                {c.patient.sex} · {c.admit_date} to {c.discharge_date} · {c.documents.length} documents
              </p>
              <h1 className="h-section mt-3 text-[30px] sm:text-[40px]">{c.title}</h1>
              <p className="mt-3 text-[17px] leading-relaxed text-ink-soft">{c.summary}</p>
            </div>
            <Verdict show={routerDone} confidence={run.confidence} blocking={run.blocking_issues} drg={run.drg} />
          </div>
          <Controls
            clock={clock}
            total={total}
            playing={playing}
            stage={currentStage}
            onPlay={() => {
              setTouched(true);
              if (done) setClock(0);
              setPlaying((p) => !p);
            }}
            onSkip={() => {
              setTouched(true);
              setPlaying(false);
              setClock(total);
            }}
            onSeek={(t) => {
              setTouched(true);
              setPlaying(false);
              setClock(t);
            }}
            stages={run.stages}
          />
        </div>
      </section>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,1.1fr)]">
        <section aria-label="Chart" className="min-w-0">
          <PanelTitle title="The chart" sub={evidenceDone ? `${run.findings.length} quotes extracted, all verified verbatim` : "Reading…"} />
          <ChartDocs docs={c.documents} findings={findings} active={activeFindings} />
        </section>
        <section aria-label="Agent trace" className="min-w-0">
          <PanelTitle title="Agent trace" sub={`${seen.filter((e) => e.type === "tool_call").length} tool calls · recorded run`} />
          <TraceLog events={seen} findings={run.findings} stages={run.stages} live={!done} onCode={setActiveCode} />
        </section>
        <section aria-label="Codes and decision" className="min-w-0">
          <PanelTitle
            title="Codes"
            sub={criticDone ? "After the critic's review" : coderDone ? "Coder draft, critic reviewing…" : "Waiting for the coder"}
          />
          <AnimatePresence>
            {coderDone && (
              <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <CodesPanel
                  run={run}
                  findings={run.findings}
                  reviewed={criticDone}
                  grouped={grouperDone}
                  routed={routerDone}
                  activeCode={activeCode}
                  onCode={setActiveCode}
                  draftCodes={draftFromEvents(events)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {!coderDone && <Placeholder />}
        </section>
      </div>

      {done && (
        <div className="mx-auto max-w-[1400px] px-4 pb-16">
          <AnswerKey doc={doc} routedAuto={routedAuto} />
        </div>
      )}
    </div>
  );
}

function draftFromEvents(events: TraceEvent[]): string[] {
  const e = events.find((x) => x.stage === "coder" && x.type === "output") as
    | (TraceEvent & { draft: { pdx: { code: string }; secondary: { code: string }[] } })
    | undefined;
  return e ? [e.draft.pdx.code, ...e.draft.secondary.map((s) => s.code)] : [];
}

function PanelTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="mb-3 flex items-baseline justify-between gap-3 border-b-2 border-ink pb-2 whitespace-nowrap">
      <h2 className="text-[18px] font-bold">{title}</h2>
      <p className="truncate text-[12px] text-ink-dim">{sub}</p>
    </header>
  );
}

function Placeholder() {
  return (
    <div className="grid gap-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-card" />
      ))}
    </div>
  );
}

function Verdict({
  show,
  confidence,
  blocking,
  drg,
}: {
  show: boolean;
  confidence: number;
  blocking: number;
  drg: EncounterDoc["run"]["drg"];
}) {
  return (
    <div className={`flex items-stretch gap-3 transition-opacity ${show ? "opacity-100" : "opacity-30"}`} aria-live="polite">
      <div className="rounded-xl bg-paper px-5 py-3.5 shadow-soft">
        <p className="text-[11px] font-bold tracking-[0.08em] text-ink-dim uppercase">
          <TermTip term="drg" align="right">DRG</TermTip>
        </p>
        <p className="stat mt-1.5 text-[34px]">{show ? drg.number : "–"}</p>
        <p className="mt-1 text-[12px] text-ink-dim tnum">{show && drg.weight ? `weight ${drg.weight.toFixed(2)}*` : " "}</p>
      </div>
      <div className={`rounded-xl px-5 py-3.5 shadow-soft ${show ? (blocking ? "bg-coral-ink text-white" : "bg-teal-ink text-white") : "bg-paper"}`}>
        <p className="text-[11px] font-bold tracking-[0.08em] uppercase opacity-95">Confidence</p>
        <p className="stat mt-1.5 text-[34px]">{show ? confidence.toFixed(2) : "–"}</p>
        <p className="mt-1 text-[12px] font-semibold">
          {show ? (blocking ? `${blocking} blocking ${blocking === 1 ? "issue" : "issues"}` : "No blocking issues") : " "}
        </p>
      </div>
    </div>
  );
}

const STAGE_COLORS: Record<string, string> = {
  triage: "var(--line-strong)",
  evidence: "var(--cyan)",
  coder: "var(--teal)",
  critic: "var(--indigo)",
  query: "var(--orange)",
};

function Controls({
  clock,
  total,
  playing,
  stage,
  onPlay,
  onSkip,
  onSeek,
  stages,
}: {
  clock: number;
  total: number;
  playing: boolean;
  stage: string;
  onPlay: () => void;
  onSkip: () => void;
  onSeek: (t: number) => void;
  stages: EncounterDoc["run"]["stages"];
}) {
  const done = clock >= total;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={onPlay}
        className="rounded-md bg-navy px-4 py-2.5 text-[13px] font-semibold tracking-wide text-white uppercase hover:bg-navy-deep"
      >
        {playing ? "Pause" : done ? "Replay" : "Play"}
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={done}
        className="rounded-md px-3 py-2.5 text-[13px] font-semibold tracking-wide text-ink uppercase ring-1 ring-line-strong hover:bg-paper disabled:opacity-40"
      >
        Skip to result
      </button>
      <div className="relative min-w-[220px] flex-1">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
          {stages
            .filter((s) => s.ms > 0)
            .map((s, i) => (
              <div key={i} style={{ width: `${(s.ms / total) * 100}%`, background: STAGE_COLORS[s.stage] ?? "var(--line-strong)" }} />
            ))}
        </div>
        <div
          className="pointer-events-none absolute top-[-3px] h-4 w-[3px] rounded-full bg-coral"
          style={{ left: `calc(${(clock / total) * 100}% - 1px)` }}
          aria-hidden
        />
        <input
          type="range"
          min={0}
          max={total}
          value={clock}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Seek through the recorded run"
          className="absolute inset-0 h-2.5 w-full cursor-pointer opacity-0"
        />
      </div>
      <p className="w-[210px] text-right text-[13px] text-ink-dim tnum">
        <span className="font-semibold text-ink capitalize">{done ? "Done" : stage}</span> · {(clock / 1000).toFixed(1)}s of{" "}
        {(total / 1000).toFixed(1)}s real time
      </p>
    </div>
  );
}

export type { CodeRow };
