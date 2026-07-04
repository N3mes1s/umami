# RFD 0011 — Autonomous analyst

- State: **ideation**
- Depends on: RFD 0005, 0008, 0009 in production; trust earned by digests

## Thesis

Alerts say *that* something happened; an analyst says *why*. Close the loop with a
scheduled agent that holds the MCP tools, watches period-over-period deltas,
investigates anomalies itself — drilling into breakdown/journey/attribution to find
the cause, not the symptom — and files a narrative:

> "Traffic to pruva.dev up 40%, driven by an HN referral to /blog/x; bounce on that
> page is 82% and it has no CTA."

This is also the honest answer to "how should the dashboard evolve for an AI-first
world": the dashboard remains the human drill-down surface; the *default* consumption
becomes push-based narrative plus on-demand Q&A (RFD 0009).

## Sketch (not committed)

- Runner: either a digest-type alert with an "investigate" budget (multi-round tool
  loop inside `/api/jobs/tick`, bounded rounds/tokens), or an external Claude
  Agent SDK worker hitting the MCP endpoint — the second needs no in-app changes at
  all, which is a strong argument for it.
- Investigation policy: start from the largest absolute delta; expand one dimension
  at a time (referrer → page → geo → device); stop when a single segment explains
  >60% of the delta or budget exhausted.
- Output: narrative + the tool-call trace as provenance, delivered via `notify.ts`;
  optionally files an annotation (future annotations feature) on the chart.

## Open questions

- Hallucination discipline: require every numeric claim in the narrative to appear in
  a tool result (verifiable post-hoc)?
- Cost envelope per run; weekly cadence probably caps this at cents.
- In-app runner vs external SDK worker (leaning external — zero fork surface).
