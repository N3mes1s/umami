# RFD 0004 — OpenAPI description of the HTTP API

- State: **accepted** (→ implemented)
- Depends on: RFD 0001 (the auth scheme it documents)

## Problem

Agents (and humans) can only drive an API they can read. Umami's API is
zod-validated per route but exposes no machine-readable contract — no
`/openapi.json`, no docs route. Everything in this fork's direction (MCP tools,
scripts, the autonomous analyst) benefits from a self-describing API; it's also the
cheapest way to make the fork instantly more usable *today* (paste the URL into any
OpenAPI client or LLM).

## Design

Hand-curated spec, not route introspection. Auto-deriving OpenAPI from every zod
schema across ~90 routes is a project; agents need the *read-side analytics* surface,
which is small and stable:

- `GET /api/websites` (list) and `GET /api/websites/{websiteId}`
- `GET /api/websites/{websiteId}/stats | pageviews | metrics | events | sessions | active | daterange`
- `POST /api/reports/{funnel|retention|journey|goal|attribution|utm|revenue}`
- `GET /api/websites/{websiteId}/agents/*` (RFD 0007)
- `GET /api/me`
- security scheme: HTTP bearer (`umami_ak_*` API keys per RFD 0001, or login JWT)

Implementation:

- `src/lib/openapi.ts` — typed spec object. Parameter/response schemas are written
  once as zod and converted with zod v4's native `z.toJSONSchema()`, shared with the
  MCP tool registry (RFD 0005) so tool inputs and OpenAPI params can't drift.
- `GET /api/openapi.json` — public route (the spec leaks nothing; endpoints still
  require auth), served with long cache headers.

Semantic notes are embedded in descriptions ("visitors = distinct salted session ids;
salt rotates per SALT_ROTATION (default monthly)") because LLM consumers repeat
whatever definitions the spec gives them.

## Merge risk

Zero — fully additive (`src/lib/openapi.ts`, `src/app/api/openapi.json/route.ts`).
Upstream candidate in principle.
