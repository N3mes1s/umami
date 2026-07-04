# RFD 0005 — In-app MCP server

- State: **accepted** (→ implemented)
- Depends on: RFD 0001 (auth). RFD 0007 adds a tool later.

## Problem

The moment analytics is an MCP tool, "how did the launch post do?" is a question you
ask Claude in a terminal, and a scheduled agent can do weekly reporting for free.
PostHog ships an official MCP server; self-hosted Umami has nothing (a community
`umami-mcp-server` exists as a *separate process* — worse: another deploy on Railway,
API drift, no permission enforcement). In-app is the right shape: direct access to the
query layer, permissions for free, one deployment.

## Design

### Transport

`POST /api/mcp` implementing **stateless Streamable HTTP** JSON-RPC. Hand-rolled
handler (~150 lines) rather than `@modelcontextprotocol/sdk`'s transport, because the
SDK's `StreamableHTTPServerTransport` wants Node req/res plumbing that fights Next
App Router, and stateless mode (single JSON response per POST, no SSE, no session
resumption) is explicitly allowed by the spec and is all an analytics query surface
needs. Methods: `initialize`, `notifications/initialized` (202), `ping`,
`tools/list`, `tools/call`. Everything else → `-32601`.

Auth: standard `Authorization: Bearer umami_ak_…` — the shared `checkAuth` path. The
resulting auth object flows into every tool's permission checks (`canViewWebsite`),
so an MCP caller can see exactly what its key's user can see, nothing more.

### Tool registry — `src/lib/mcp/tools.ts` (single source of truth)

Each tool: `{ name, description, inputSchema (zod), execute(auth, args) }`.
`tools/list` converts schemas with `z.toJSONSchema()`. The same registry is reused by
RFD 0009's in-dashboard LLM loop — one definition of what an "analytics tool" is.

| tool | wraps |
| --- | --- |
| `list_websites` | `getUserWebsites` |
| `get_website_stats` | `getWebsiteStats` (visitors/visits/views/bounce/duration + prior-period comparison) |
| `get_pageview_series` | `getPageviewStats` (time series, unit auto-clamped) |
| `get_metrics` | `getPageviewMetrics`/`getSessionMetrics` — breakdown by url/referrer/browser/os/device/country/event/utm… with existing filter operators |
| `get_events` | `getWebsiteEvents` (recent custom events) |
| `get_active_visitors` | `getActiveVisitors` |
| `run_report` | funnel / retention / journey / goal — parameters mirror `/api/reports/*` bodies |
| `get_agent_traffic` | RFD 0007 queries (AI crawler/agent activity) |

Design rules learned from LLM tool-use:

- Date ranges accepted as ISO or relative (`"7d"`, `"30d"`, `"today"`); the resolved
  absolute range is **echoed back in every response** (models lose track of time).
- Responses are compact JSON with units named (`"visit_duration_seconds"`), row-capped
  (default 50), and carry `definitions` strings for non-obvious metrics.
- Tool descriptions state metric semantics (visitors = salted distinct sessions, salt
  rotation caveat) so agents don't misreport.

## Merge risk

Zero — new directory + one route. **Fork-first, strong upstream candidate.**
