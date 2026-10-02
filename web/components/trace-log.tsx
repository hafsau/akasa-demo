"use client";

import { useEffect, useRef } from "react";
import type { Finding, Stage, TraceEvent } from "@/lib/types";

const STAGE_META: Record<string, { label: string; color: string }> = {
  triage: { label: "Triage", color: "bg-line text-ink-soft" },
  evidence: { label: "Evidence", color: "bg-[#e6f7fa] text-[#0b6e7a]" },
  coder: { label: "Coder", color: "bg-teal-wash text-teal-ink" },
  critic: { label: "Critic", color: "bg-[#eceefa] text-indigo" },
  grouper: { label: "Grouper", color: "bg-line text-ink-soft" },
  router: { label: "Router", color: "bg-line text-ink-soft" },
  query: { label: "Query", color: "bg-orange-wash text-orange-ink" },
};

export function TraceLog({
  events,
  findings,
  stages,
  live,
  onCode,
}: {
  events: TraceEvent[];
  findings: Finding[];
  stages: Stage[];
  live: boolean;
  onCode: (code: string) => void;
}) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length, live]);

  return (
    <ol ref={ref} className="grid max-h-[78vh] content-start gap-2 overflow-y-auto pr-1" aria-live="off" tabIndex={0} aria-label="Trace events">
      {events.map((e, i) => (
        <li key={i}>
          <EventRow e={e} findings={findings} stages={stages} onCode={onCode} />
        </li>
      ))}
    </ol>
  );
}

function StageTag({ stage }: { stage: string }) {
  const m = STAGE_META[stage] ?? { label: stage, color: "bg-line text-ink-soft" };
  return <span className={`rounded-sm px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide uppercase ${m.color}`}>{m.label}</span>;
}

function Time({ t }: { t: number }) {
  return <span className="w-11 shrink-0 text-right font-mono text-[11px] text-ink-dim tnum">{(t / 1000).toFixed(1)}s</span>;
}

function EventRow({
  e,
  findings,
  stages,
  onCode,
}: {
  e: TraceEvent;
  findings: Finding[];
  stages: Stage[];
  onCode: (code: string) => void;
}) {
  const base = "flex gap-2.5 rounded-lg px-3 py-2 text-[13px] leading-snug";
  switch (e.type) {
    case "stage_start": {
      const s = stages.find((x) => x.stage === e.stage && Math.abs(x.started - e.t) < 50);
      return (
        <div className={`${base} items-center bg-card`}>
          <Time t={e.t} />
          <StageTag stage={e.stage} />
          <span className="font-semibold">{(e.model as string | undefined)?.split(":").pop() ?? "deterministic"}</span>
          {s && s.model && (
            <span className="ml-auto text-[11px] text-ink-dim tnum">
              {(s.input_tokens / 1000).toFixed(1)}k in · {(s.output_tokens / 1000).toFixed(1)}k out · ${s.cost_usd.toFixed(3)}
            </span>
          )}
        </div>
      );
    }
    case "tool_call": {
      const args = e.args as Record<string, string>;
      return (
        <div className={`${base}`}>
          <Time t={e.t} />
          <div className="min-w-0">
            <p className="font-mono text-[12px]">
              <span className="font-semibold text-teal-ink">{String(e.tool)}</span>(
              <span className="text-ink">{JSON.stringify(args?.term ?? args?.code ?? args)}</span>)
            </p>
          </div>
        </div>
      );
    }
    case "tool_result": {
      const r = e.result as string;
      let lines: string[] = [];
      try {
        const parsed = JSON.parse(r);
        lines = Array.isArray(parsed) ? parsed : [String(parsed)];
      } catch {
        lines = String(r).split("\n");
      }
      return (
        <div className={`${base} pt-0`}>
          <span className="w-11 shrink-0" />
          <ul className="min-w-0 border-l-2 border-teal/40 pl-3 font-mono text-[11.5px] text-ink-dim">
            {lines.slice(0, 4).map((l, i) => (
              <li key={i} className="truncate">{l}</li>
            ))}
            {lines.length > 4 && <li>+{lines.length - 4} more</li>}
          </ul>
        </div>
      );
    }
    case "validation_retry":
      return (
        <div className={`${base} bg-coral-wash`}>
          <Time t={e.t} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-wide text-coral-ink uppercase">Validator rejected output, model retried</p>
            <p className="mt-1 line-clamp-3 text-[12px] text-ink-soft">{String(e.reason)}</p>
          </div>
        </div>
      );
    case "thinking":
    case "text":
      // Skip structured output the model echoed as text; the stage's output row summarizes it.
      if (/^\s*[{[]/.test(String(e.text))) return null;
      return (
        <div className={base}>
          <Time t={e.t} />
          <p className="min-w-0 text-[12.5px] text-ink-soft italic">
            <span className="mr-1.5 not-italic"><StageTag stage={e.stage} /></span>
            {String(e.text)}
          </p>
        </div>
      );
    case "removed":
      return (
        <div className={`${base} bg-[#eceefa]`}>
          <Time t={e.t} />
          <p className="min-w-0">
            <span className="text-[11px] font-bold tracking-wide text-indigo uppercase">Critic removed </span>
            <button type="button" onClick={() => onCode(String(e.code))} className="font-mono font-semibold underline decoration-dotted">
              {String(e.code)}
            </button>
            <span className="text-ink-soft">: {String(e.reason)}</span>
          </p>
        </div>
      );
    case "output":
      return <OutputRow e={e} findings={findings} base={base} />;
    default:
      return null;
  }
}

function OutputRow({ e, findings, base }: { e: TraceEvent; findings: Finding[]; base: string }) {
  let body: React.ReactNode = null;
  if (e.stage === "triage") {
    const docs = e.documents as { type: string; flags: string[] }[];
    const flagged = docs.filter((d) => d.flags.length).map((d) => `${d.type} (${d.flags.join(", ")})`);
    body = <>Ordered {docs.length} documents. {flagged.length ? `Flagged: ${flagged.join("; ")}.` : ""}</>;
  } else if (e.stage === "evidence") {
    const n = findings.length;
    const neg = findings.filter((f) => ["negated", "ruled_out", "history", "resolved"].includes(f.assertion)).length;
    body = <>Extracted {n} verbatim quotes ({neg} negated, ruled out, resolved or history).</>;
  } else if (e.stage === "coder") {
    const d = e.draft as { pdx: { code: string }; secondary: { code: string }[]; issues: unknown[] };
    body = <>Draft: principal {d.pdx.code} + {d.secondary.length} secondary codes, {d.issues.length} issues raised.</>;
  } else if (e.stage === "critic") {
    const c = e.critique as { reviews: { verdict: string }[]; missed: unknown[]; pdx_ok: boolean };
    const un = c.reviews.filter((r) => r.verdict === "unsupported").length;
    const q = c.reviews.filter((r) => r.verdict === "needs_query").length;
    body = <>Reviewed {c.reviews.length} codes: {un} unsupported, {q} need a query, {c.missed.length} missed issues added. Principal {c.pdx_ok ? "upheld" : "questioned"}.</>;
  } else if (e.stage === "grouper") {
    body = <>DRG {String(e.drg)} {e.title ? `· ${e.title}` : ""} · tier {String(e.tier)}{(e.drivers as string[]).length ? ` (driven by ${(e.drivers as string[]).join(", ")})` : ""}.</>;
  } else if (e.stage === "router") {
    body = <>Confidence {Number(e.base).toFixed(2)}{Number(e.blocking) ? ` × 0.5 for ${e.blocking} blocking issue(s)` : ""} = <b>{Number(e.confidence).toFixed(2)}</b>.</>;
  } else if (e.stage === "query") {
    const q = e.query as { lint: string[] };
    body = <>Drafted a provider query. Compliance linter: {q.lint.length ? q.lint.join("; ") : "all rules pass"}.</>;
  }
  return (
    <div className={`${base} border border-line`}>
      <Time t={e.t} />
      <p className="min-w-0">
        <span className="mr-1.5"><StageTag stage={e.stage} /></span>
        {body}
      </p>
    </div>
  );
}
