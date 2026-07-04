# RFD 0007 — AI traffic dashboard & report

- State: **accepted** (→ implemented)
- Depends on: RFD 0002 + 0006 (the data), RFD 0003 (referral labels)

## Problem

The payoff view for the whole agentic direction: one page answering *"what is AI doing
on my site?"* No self-hosted analytics has this; SaaS "AI visibility" tools charging
for it start at hundreds of dollars a month. Without a surface, the `agent_event` data
is invisible plumbing.

## Design

### Queries — `src/queries/sql/agents/` (Postgres; ClickHouse variant throws)

- `getAgentTrafficStats(websiteId, range)` — totals + per-category counts + distinct
  `ip_hash` count, with prior-period comparison.
- `getAgentTrafficSeries(websiteId, range, unit)` — time series grouped by category.
- `getAgentMetrics(websiteId, range, type)` — top N by `name`, `operator`, or
  `url_path` (the "most-ingested content" table), each with count + share.

LLM-referral side needs **no new SQL**: existing `getPageviewMetrics(type=referrer)`
filtered to `AI_ASSISTANT_DOMAINS`, surfaced as a fourth panel.

### API

`GET /api/websites/[websiteId]/agents/stats | series | metrics?type=name|operator|path`
— standard `parseRequest` + `canViewWebsite`, same date-range params as sibling
endpoints. (Chose website-scoped GETs over the `/api/reports/*` POST pattern: this is
a permanent tab, not a parameterized saved report.)

### UI

New tab `websites/[websiteId]/agents` (nav item appended in `useWebsiteNavItems.tsx`
under Traffic — one-line hook into an upstream-churny file, accepted):

1. Metrics bar: AI events, AI crawlers, AI agents, distinct clients (+deltas)
2. Stacked bar chart: events over time by category (existing `BarChart`)
3. Tables: top agents (name+operator), most-fetched pages, LLM referrals by assistant

All built from existing components (`MetricsTable`-style list tables, `Panel` layout,
chart components) + fork-owned hooks (`useAgentStatsQuery` etc. following the
`useApi`/react-query pattern).

### MCP

`get_agent_traffic` tool (RFD 0005 registry) wrapping the same three queries.

## Merge risk

One nav-item line in `useWebsiteNavItems.tsx`; everything else additive. Fork-only —
this page *is* the fork's identity.
