"use client";

import { useState } from "react";
import type { CodeRow, Finding, Run } from "@/lib/types";
import { TermTip } from "./term-tip";

const SEV_STYLE: Record<string, string> = {
  MCC: "bg-coral-ink text-white",
  CC: "bg-orange-wash text-orange-ink",
};

const KIND_LABEL: Record<string, string> = {
  conflicting_documentation: "Conflicting documentation",
  query_opportunity: "Query opportunity",
  clinical_validation: "Clinical validation",
  poa_uncertain: "POA uncertain",
  copy_forward: "Copy-forward",
  other: "Review",
};

export function CodesPanel({
  run,
  findings,
  reviewed,
  grouped,
  routed,
  activeCode,
  onCode,
  draftCodes,
}: {
  run: Run;
  findings: Finding[];
  reviewed: boolean;
  grouped: boolean;
  routed: boolean;
  activeCode: string | null;
  onCode: (c: string | null) => void;
  draftCodes: string[];
}) {
  const fById = new Map(findings.map((f) => [f.id, f]));
  // Before the critic finishes, show the coder's draft (final codes + the ones it will remove).
  const rows: CodeRow[] = reviewed ? run.codes : [...run.codes, ...run.removed].filter((r) => draftCodes.includes(r.code));
  const order = (r: CodeRow) => (r.role === "pdx" ? 0 : r.severity === "MCC" ? 1 : r.severity === "CC" ? 2 : 3);
  const sorted = [...rows].sort((a, b) => order(a) - order(b));

  return (
    <div className="grid gap-5">
      <ul className="grid gap-2.5">
        {sorted.map((r) => (
          <li key={r.code}>
            <CodeCard
              row={r}
              findings={r.finding_ids.map((id) => fById.get(id)).filter(Boolean) as Finding[]}
              reviewed={reviewed}
              driver={grouped && run.drg.drivers.includes(r.code)}
              active={activeCode === r.code}
              onClick={() => onCode(activeCode === r.code ? null : r.code)}
            />
          </li>
        ))}
      </ul>

      {reviewed && run.removed.length > 0 && (
        <div>
          <h3 className="text-[12px] font-bold tracking-[0.08em] text-indigo uppercase">Removed by the critic</h3>
          <ul className="mt-2 grid gap-2">
            {run.removed.map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => onCode(activeCode === r.code ? null : r.code)}
                  className="w-full rounded-lg border border-dashed border-indigo/40 px-3 py-2 text-left text-[13px]"
                >
                  <span className="font-mono font-semibold line-through">{r.code}</span>{" "}
                  <span className="text-ink-soft line-through">{r.description}</span>
                  <span className="mt-1 block text-[12px] text-ink-soft">{r.critic_reason}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {routed && run.issues.length > 0 && (
        <div>
          <h3 className="text-[12px] font-bold tracking-[0.08em] text-coral-ink uppercase">Why a human should look</h3>
          <ul className="mt-2 grid gap-2">
            {dedupeIssues(run.issues).map((i, k) => (
              <li key={k} className={`rounded-lg px-3 py-2.5 text-[13px] leading-snug ${i.blocks_autonomy ? "bg-coral-wash" : "bg-card"}`}>
                <p className="text-[11px] font-bold tracking-wide uppercase">
                  {KIND_LABEL[i.kind] ?? i.kind}
                  {i.blocks_autonomy && <span className="ml-2 text-coral-ink">Blocks autonomy</span>}
                </p>
                <p className="mt-1 text-ink-soft">{i.summary}</p>
                {i.guideline && <p className="mt-1 text-[11.5px] text-ink-dim">{i.guideline}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {routed && run.queries.map((q, k) => <QueryCard key={k} q={q} fById={fById} />)}

      {routed && <AuditLog key={run.case_id} caseId={run.case_id} codes={run.codes} confidence={run.confidence} promptVersion={run.prompt_version} />}

      <p className="text-[11.5px] leading-relaxed text-ink-dim">
        * DRG weights and the CC/MCC list are illustrative. Codes are real FY2027 ICD-10-CM; DRG assignment is a small
        deterministic grouper covering seven families, not the CMS grouper.
      </p>
    </div>
  );
}

function dedupeIssues(issues: Run["issues"]) {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = i.summary.slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function CodeCard({
  row,
  findings,
  reviewed,
  driver,
  active,
  onClick,
}: {
  row: CodeRow;
  findings: Finding[];
  reviewed: boolean;
  driver: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const pending = reviewed && row.verdict === "needs_query";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-lg border bg-paper px-3.5 py-3 text-left transition-shadow hover:shadow-soft ${
        active ? "border-coral ring-2 ring-coral/20" : pending ? "border-coral/50" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[15px] font-bold">{row.code}</span>
            {row.role === "pdx" && (
              <span className="rounded-sm bg-navy px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">Principal</span>
            )}
            {row.severity && row.severity !== "none" && (
              <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${SEV_STYLE[row.severity]}`}>
                {row.severity}
              </span>
            )}
            {driver && <span className="text-[10px] font-bold tracking-wide text-coral-ink uppercase">Sets DRG</span>}
            <span className="text-[10px] font-semibold text-ink-dim">POA {row.poa}</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{row.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-[14px] font-bold tnum">{row.confidence.toFixed(2)}</span>
          <div className="mt-1 h-1.5 w-14 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className={`h-full ${row.confidence >= 0.8 ? "bg-teal" : "bg-coral"}`} style={{ width: `${row.confidence * 100}%` }} />
          </div>
        </div>
      </div>
      {findings[0] && (
        <p className="mt-2 border-l-2 border-teal pl-2.5 text-[12.5px] leading-snug text-ink">
          &ldquo;{findings[0].quote}&rdquo;
          <span className="ml-1 text-[11px] text-ink-dim">
            {findings[0].id} · {findings[0].doc_id}
            {findings.length > 1 ? ` · +${findings.length - 1} more` : ""}
          </span>
        </p>
      )}
      {reviewed && row.verdict !== "supported" && row.critic_reason && (
        <p className="mt-2 text-[12px] text-coral-ink">Critic: {row.critic_reason}</p>
      )}
    </button>
  );
}

function QueryCard({ q, fById }: { q: Run["queries"][number]; fById: Map<string, Finding> }) {
  return (
    <div className="rounded-xl border-t-4 border-orange bg-paper p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold tracking-[0.08em] text-orange-ink uppercase">
          <TermTip term="query">Provider query</TermTip> draft
        </h3>
        <span className="rounded-sm bg-teal-wash px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-teal-ink uppercase">
          {q.lint.length ? `${q.lint.length} lint issues` : "Linter: compliant"}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-ink-dim">To: {q.to}</p>
      <p className="mt-3 text-[11px] font-bold tracking-wide text-ink-dim uppercase">Clinical indicators</p>
      <ul className="mt-1 grid gap-1 text-[13px] text-ink-soft">
        {q.clinical_indicators.map((ci, i) => (
          <li key={i}>
            • {ci.text}
            {ci.finding_id && fById.has(ci.finding_id) && <span className="ml-1 text-[11px] text-ink-dim">({ci.finding_id})</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[14px] leading-snug font-medium">{q.question}</p>
      <ul className="mt-2 grid gap-1.5">
        {q.options.map((o, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-ink-soft">
            <span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-sm border border-line-strong" aria-hidden />
            {o}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface AuditEntry {
  at: string;
  action: "accept" | "reject";
  case_id: string;
  confidence: number;
  prompt_version: string;
  codes: string[];
}

const KEY = "threshold.audit.v1";

function AuditLog({ caseId, codes, confidence, promptVersion }: { caseId: string; codes: CodeRow[]; confidence: number; promptVersion: string }) {
  // Only rendered after the client-side replay reaches the router, so localStorage is available.
  const [log, setLog] = useState<AuditEntry[]>(() => {
    try {
      return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as AuditEntry[]).filter((e) => e.case_id === caseId);
    } catch {
      return [];
    }
  });

  const add = (action: AuditEntry["action"]) => {
    const entry: AuditEntry = {
      at: new Date().toISOString(),
      action,
      case_id: caseId,
      confidence,
      prompt_version: promptVersion,
      codes: codes.map((c) => c.code),
    };
    setLog((l) => [entry, ...l]);
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? "[]") as AuditEntry[];
      localStorage.setItem(KEY, JSON.stringify([entry, ...all].slice(0, 200)));
    } catch {
      /* private mode: keep it in memory */
    }
  };

  return (
    <div className="rounded-xl bg-card p-4">
      <h3 className="text-[12px] font-bold tracking-[0.08em] text-ink-dim uppercase">Reviewer decision</h3>
      <p className="mt-1 text-[12.5px] text-ink-soft">
        In production each decision is an online eval signal: accept rate by confidence bin is how you&rsquo;d recalibrate
        the threshold. Here it&rsquo;s stored in your browser only.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => add("accept")} className="rounded-md bg-teal-ink px-3.5 py-2 text-[12px] font-semibold tracking-wide text-white uppercase hover:opacity-90">
          Accept codes
        </button>
        <button type="button" onClick={() => add("reject")} className="rounded-md bg-paper px-3.5 py-2 text-[12px] font-semibold tracking-wide text-ink uppercase ring-1 ring-line-strong hover:bg-white">
          Reject
        </button>
      </div>
      {log.length > 0 && (
        <ul className="mt-3 grid gap-1 font-mono text-[11px] text-ink-dim">
          {log.slice(0, 4).map((e, i) => (
            <li key={i}>
              {e.at.slice(11, 19)} {e.action.toUpperCase()} {e.case_id} conf={e.confidence.toFixed(2)} prompt={e.prompt_version}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
