# Threshold

**Autonomy you can audit.** An unofficial concept by [Hafsa Usmani](https://hafsausmani.com), built as my application for **Software Engineer, Applied AI** at [Akasa](https://akasa.com).

> **Not affiliated with Akasa.** Synthetic charts only, no patient data. DRG weights are illustrative. Codes are real FY2027 ICD-10-CM.

Akasa launched autonomous inpatient coding on October 2, 2026. Its pitch includes a citation for every code, a confidence score, and "you set the threshold." Threshold is the part I'd want to own behind a product like that. It has three pieces:

- **Agent:** reads each chart and cites every code to the exact sentence.
- **Router:** decides which stays the machine finalizes and sends the rest to a coder with a reason.
- **Eval harness:** keeps both honest. Its CI gate fails a build when stays that needed a human start getting through.

## What it shows

| | |
|---|---|
| **Threshold** (`/`) | Drag the confidence threshold and 24 stays spring between "coded autonomously" and "sent to a coder." Precision, DRG match and over-coding, each with a bootstrap 95% CI, plus escapes, recompute live from the recorded runs. |
| **Replay** (`/encounter/[id]`) | The real recorded trace of each run: verbatim quotes highlighted in the chart, `index_lookup` and `tabular_lookup` tool calls against the code table, validator retries, codes the critic removed, the DRG, the routing decision, and a linted provider query. Each stay ends with the answer key. |
| **Evals** (`/evals`) | Agent vs a single-prompt baseline, threshold sweeps, the v1 → v2 routing fix, error taxonomy, cost per stage, and the CI gate output. |
| **How it works** (`/about`) | Principles, architecture, what failed, limits, and next steps. |

## Results at threshold 0.80

All results are on 24 synthetic stays, scored against answer keys written before each chart.

| | Agent (v2) | Agent (v1) | One-prompt baseline |
|---|---|---|---|
| Coded autonomously | **46%** (11) | 33% (8) | 33% (8) |
| Escapes (needed a human, got through) | **0** | 1 | 1 |
| Held needlessly | 5 | 9 | 9 |
| Code precision, autonomous stays | **95.3%** (CI 91–99%) | 93.7% | 92.3% |
| DRG match, autonomous stays | 100% | 100% | 100% |
| Over-coded | 0% | 0% | 0% |
| Cost per stay | $0.096 | | $0.011 |

At n = 24 the intervals are wide on purpose. The harness is the point. The case study shows the numbers are only meaningful when re-run on a real gold set.

## How it's built

```
chart ─▶ triage (code) ─▶ evidence (Haiku 4.5) ── quotes validated against the chart by offset
                               ▼
                      coder (Sonnet 5.5) ◀─▶ index_lookup / tabular_lookup  (FY2027 ICD-10-CM, SQLite FTS5)
                               ▼          ── codes validated: billable, cited, no duplicates
                      critic (Sonnet 5.5) ── adversarial; can remove codes or lower confidence, never raise
                               ▼
              grouper (code) ─▶ router (code) ─▶ query drafter (Sonnet 5.5 + compliance linter)
                               ▼
           JSONL trace ─▶ eval harness ─▶ CI gate ─▶ site (replays)
```

- **`agent/threshold/pipeline.py`:** the Pydantic AI pipeline. Every stage returns a typed Pydantic model. Output validators reject paraphrased quotes, header or invented codes, and leading queries, then send the model back with the reason. Those retries are recorded in the trace.
- **`agent/threshold/router.py`:** routing policy as code. The models label each issue's impact on the claim (principal, severity, none). The router blocks on:
  - provider questions that can move the claim
  - critic doubts about codes that set the DRG
  - a questioned principal diagnosis, only if it regroups to another DRG
  - hospital-acquired conditions coded POA = N
  `reroute.py` re-applies the policy to recorded runs with no model calls.
- **`agent/threshold/grouper.py`:** a deliberately small, deterministic MS-DRG grouper covering 7 medical families. It includes CC/MCC tiers, same-cluster exclusions and the HAC POA rule. DRG assignment is arithmetic, not a model output.
- **`agent/threshold/metrics.py`, `export.py`, `gate.py`:** scoring, bootstrap CIs, threshold sweeps, error taxonomy, and the CI gate. The site's stats in `web/lib/stats.ts` mirror these, and a test checks the browser and Python numbers agree.
- **`agent/server.py`:** the live-mode service. FastAPI streams the trace over SSE, limited to curated charts only, with a per-IP limit and a global daily cap. It ships with a Dockerfile and `fly.toml`.
- **`evals/cases/*.json`:** 24 synthetic stays. Each case lists its planted traps, such as a late addendum, copy-forward text, uncertain-at-discharge, a lab-only finding, a consultant conflict or a HAC.
- **`evals/runs/`:** recorded runs for `agent` (current), `agent-v1` and `baseline`. The site serves these and never calls a model.

**Stack:** Python 3.12, Pydantic AI, Pydantic v2, FastAPI, numpy, uv; Next.js 16, React 19, TypeScript, Tailwind v4, Motion; pytest, Vitest, Playwright and axe.

## Run it

```bash
# Agent + evals (Python)
cd agent
uv sync
uv run pytest -q                       # 66 tests, scripted models, no API calls
uv run python gate.py                  # re-score committed runs against evals/gate.json
uv run python gate.py --runs agent-v1  # watch the gate fail on v1
cp .env.example .env                   # add ANTHROPIC_API_KEY to record new runs
uv run python run.py --system both     # record agent + baseline runs (~$2.60 for 24 stays)
uv run python export.py                # write web/data
uv run uvicorn server:app --port 8000  # live-mode service

# Site
cd ../web
npm install
npm run dev                            # http://localhost:3000
npm test                               # Vitest
npm run e2e                            # Playwright + axe on a production build
```

## Tests

- **pytest (66):**
  - code table and thread-safe search
  - grouper tiers, exclusions and HAC rule
  - query linter
  - answer keys vs the grouper
  - validators, driven by scripted `FunctionModel`s
  - router policy and offline reroute
  - metrics and bootstrap
  - export (strict JSON)
  - the gate
  - tracer timestamps
  - the SSE service with rate limits
- **Vitest (19):**
  - bootstrap and threshold maths
  - evidence highlighting
  - trace timeline
  - the exported-data contract: every citation slices to its quote, and no CPT codes appear
  - browser/Python parity
- **Playwright (24):**
  - the slider moves stays between lanes
  - all four walkthroughs replay to an answer key
  - code-to-evidence highlighting
  - compliant queries on held stays
  - reduced motion
  - "not affiliated" notice on every page
  - axe on every page
  - no horizontal scroll on phones

## Limits

- Synthetic, short charts (500–1,000 words; real stays are around 50,000).
- Answer keys were written by me, not credentialed coders.
- The charts were written by Claude in a separate session and the agent runs on Claude models, so some circularity is possible.
- One run per stay, so there's no variance estimate yet.
- No CPT (AMA-licensed). No MIMIC. No patient data.

---

Built by Hafsa Usmani. Feedback welcome.
