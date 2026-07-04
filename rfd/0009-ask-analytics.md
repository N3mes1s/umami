# RFD 0009 — Ask-your-analytics (LLM query) & digests

- State: **accepted** (→ implemented)
- Depends on: RFD 0005 (tool registry), RFD 0008 (digest delivery)

## Problem

"LLM-ready" for the humans using the dashboard: ask questions in prose, get answers
grounded in real queries. GA4 and PostHog both ship this. With the MCP tool registry
in place it is cheap — the model doesn't need NL→SQL, it needs tool-use over tools we
already defined.

## Design

### `POST /api/ai/query`

`{ websiteId, question, history? }` → agentic loop against the Anthropic API:

- Env-gated: `ANTHROPIC_API_KEY` absent → 404 and the UI never shows. The fork must
  run perfectly LLM-less.
- Model: `ANTHROPIC_MODEL` env, defaulting to a current Sonnet-class model.
- Tools: **the RFD 0005 registry**, scoped to the requesting user's auth and pinned to
  the requested website — one source of truth for MCP, chat, and digests.
- Loop: max 8 tool rounds, row-capped tool results, final text answer returned with
  the list of tool calls made (shown as "how I got this" provenance in the UI).
- System prompt states metric semantics + the website's timezone/date so relative
  questions resolve correctly.

No conversation persistence in v1 (client keeps history and resends).

### UI

"Ask AI" panel on the website overview (fork-owned component, rendered only when
`/api/config` advertises `aiEnabled`): question box, streaming-less answer card,
provenance footer. Deliberately a drawer/panel, not a takeover — the dashboard stays
the drill-down surface.

### Digests (closing the RFD 0008 loop)

Digest-type alerts call `composeDigest(websiteId, period)`: gather stats/top-movers/
agent-traffic via the same tools, then one LLM call to write a 6-10 line narrative
("what changed and why it matters"), delivered through `notify.ts`. LLM absent →
formatted numbers. This is the seed of RFD 0011's autonomous analyst.

## Cost & safety

- Tool results capped (rows + chars) before hitting the context; a runaway question
  costs cents, not dollars.
- The model only reaches data through permission-checked tools; prompt injection via
  page titles/referrers in tool results is bounded by read-only tools (worst case: a
  wrong narrative, never a write or exfil channel beyond the caller's own access).

## Merge risk

Zero — additive (`src/app/api/ai/`, `src/lib/ai/`, one overview panel component
mounted from a fork-owned file). Fork-only: upstream won't take an LLM dependency.
