# Requests for Discussion (RFD)

Design documents for this fork's "agentic analytics" direction: making Umami the best
self-hosted analytics for a web increasingly visited by AI crawlers, agents, and
LLM-referred humans — and making Umami itself usable *by* agents.

Inspired by [Oxide's RFD process](https://rfd.shared.oxide.computer/). One document per
coherent feature. States:

- `ideation` — problem statement, no committed design
- `discussion` — design under review
- `accepted` — design settled, implementation may proceed
- `implemented` — shipped in this fork (commit referenced in the doc)
- `abandoned`

## Index

| RFD | Title | State |
| --- | ----- | ----- |
| [0001](0001-api-keys.md) | API keys (programmatic access) | implemented |
| [0002](0002-agent-traffic-capture.md) | Capture & classify AI/bot traffic instead of dropping it | implemented |
| [0003](0003-ai-source-attribution.md) | Expanded AI-assistant referral attribution | implemented |
| [0004](0004-openapi.md) | OpenAPI description of the HTTP API | implemented |
| [0005](0005-mcp-server.md) | In-app MCP server | implemented |
| [0006](0006-server-side-collection.md) | Server-side / edge collection endpoint | implemented |
| [0007](0007-agent-traffic-report.md) | AI traffic dashboard & report | implemented |
| [0008](0008-alerts-webhooks-jobs.md) | Alerts, webhooks & the jobs runner | implemented |
| [0009](0009-ask-analytics.md) | Ask-your-analytics (LLM query) & digests | implemented |
| [0010](0010-ai-content-roi.md) | AI content ROI: crawl → referral → conversion | ideation |
| [0011](0011-autonomous-analyst.md) | Autonomous analyst | ideation |
| [0012](0012-agent-session-semantics.md) | Agent session semantics | ideation |

## Fork ground rules (apply to every RFD)

Upstream is `umami-software/umami`. This fork must survive upstream merges cheaply:

1. **Additive by default.** New tables, new routes, new modules under fork-owned paths
   (`src/lib/agents.ts`, `src/lib/mcp/`, `src/app/api/mcp/`, `src/app/api/collect/`,
   `src/app/api/api-keys/`, `src/app/api/jobs/`, `src/app/api/ai/`, `rfd/`).
2. **Hot upstream files get one-line hooks only.** `src/app/api/send/route.ts`,
   `src/lib/auth.ts`, `src/lib/constants.ts`, `src/lib/schema.ts`,
   `src/components/hooks/useWebsiteNavItems.tsx` are upstream-churny; any fork change
   there must be a single call into a fork-owned module.
3. **Never widen upstream-owned tables.** Side tables keyed by the upstream id instead.
4. **Postgres first.** This fork deploys on Railway Postgres. ClickHouse variants of new
   queries are optional and may throw `not implemented`.
5. **Upstream what we can.** LLM domain list additions, API keys, OpenAPI are PR
   candidates; everything merged upstream is fork surface we stop maintaining.
