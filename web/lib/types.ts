// Shapes exported by agent/export.py. Kept in sync by hand; tests load the
// real files so drift fails CI.

export type Interval = [number, number, number]; // point, lo, hi

export interface Row {
  id: string;
  title: string;
  summary: string;
  family: string;
  hero: boolean;
  traps: string[];
  gold_route: "autonomous" | "coder";
  gold_drg: string;
  pred_drg: string | null;
  gold_weight: number | null;
  pred_weight: number | null;
  confidence: number;
  tp: number;
  fp: number;
  fn: number;
  fp_codes: string[];
  fn_codes: string[];
  cc_tp: number;
  cc_fp: number;
  cc_fn: number;
  pdx_ok: boolean;
  drg_ok: boolean;
  overcoded: boolean;
  undercoded: boolean;
  invalid_codes: string[];
  citations: number;
  citations_located: number;
  queries: number;
  queries_lint_clean: number;
  cost_usd: number;
  ms: number;
}

export interface Summary {
  n: number;
  n_auto: number;
  autonomy: number;
  code_precision: Interval;
  code_recall: Interval;
  ccmcc_precision: Interval;
  ccmcc_recall: Interval;
  drg_match: Interval;
  pdx_accuracy: Interval;
  overcoding_rate: Interval;
  undercoding_rate: Interval;
  invalid_code_rate: number;
  escaped?: number;
  escape_rate?: number;
  held_needlessly?: number;
  cost_mean: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
}

export interface SweepPoint {
  threshold: number;
  autonomy: number;
  code_precision: number;
  drg_match: number;
  escape_rate: number;
  overcoding_rate: number;
}

export interface EvalDoc {
  generated: string;
  prompt_version: string;
  default_threshold: number;
  agent: { all: Summary; at_default: Summary };
  baseline: { all: Summary; at_default: Summary } | null;
  sweep: { agent: SweepPoint[]; baseline: SweepPoint[] };
  history: { version: string; all: Summary; at_default: Summary; sweep: SweepPoint[] }[];
  taxonomy: { trap: string; cases: string[]; fp: number; fn: number; drg_miss: number }[];
  stage_costs: { stage: string; model: string | null; cost_usd: number; ms: number; input_tokens: number; output_tokens: number; n: number }[];
  retries: Record<string, number>;
}

export interface Document {
  id: string;
  type: string;
  author: string;
  author_role: string;
  timestamp: string;
  text: string;
}

export interface Finding {
  id: string;
  condition: string;
  assertion: string;
  doc_id: string;
  quote: string;
  note: string | null;
  start: number | null;
  end: number | null;
}

export interface CodeRow {
  code: string;
  poa: string;
  role: "pdx" | "secondary";
  finding_ids: string[];
  confidence: number;
  rationale: string;
  verdict: "supported" | "unsupported" | "needs_query";
  critic_reason: string | null;
  severity: "MCC" | "CC" | "none" | null;
  description: string;
}

export interface Issue {
  kind: string;
  summary: string;
  finding_ids: string[];
  guideline: string | null;
  blocks_autonomy: boolean;
}

export interface Query {
  issue: string;
  to: string;
  clinical_indicators: { text: string; finding_id: string | null }[];
  question: string;
  options: string[];
  lint: string[];
}

export interface TraceEvent {
  t: number;
  stage: string;
  type: string;
  [k: string]: unknown;
}

export interface Stage {
  stage: string;
  model: string | null;
  started: number;
  ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface Run {
  case_id: string;
  prompt_version: string;
  findings: Finding[];
  codes: CodeRow[];
  removed: CodeRow[];
  issues: Issue[];
  queries: Query[];
  drg: { family: string | null; number: string | null; title: string | null; weight: number | null; tier: string; drivers: string[] };
  confidence: number;
  confidence_base: number;
  blocking_issues: number;
  stages: Stage[];
  events: TraceEvent[];
  ms: number;
  cost_usd: number;
}

export interface BaselineRun {
  codes: { code: string; poa: string; role: string; valid: boolean; description: string }[];
  drg: { number: string | null; weight: number | null };
  confidence: number;
  needs_human: boolean;
  reason: string | null;
  cost_usd: number;
  ms: number;
}

export interface Case {
  id: string;
  title: string;
  summary: string;
  hero: boolean;
  family: string;
  patient: { age: number; sex: "F" | "M" };
  admit_date: string;
  discharge_date: string;
  documents: Document[];
  gold: {
    pdx: string;
    secondary: { code: string; poa: string }[];
    drg: string;
    route: "autonomous" | "coder";
    hold_reasons: string[];
    query: { topic: string; options: string[] } | null;
    traps: string[];
    explanation: string;
  };
}

export interface EncounterDoc {
  case: Case;
  run: Run;
  baseline: BaselineRun | null;
  score: Row;
}
