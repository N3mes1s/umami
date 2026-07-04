# RFD 0006 — Server-side / edge collection endpoint

- State: **accepted** (→ implemented)
- Depends on: RFD 0001 (auth), RFD 0002 (classifier + agent_event)

## Problem

AI crawlers and most agents never execute JavaScript, so the tracker
(`src/tracker/index.js`) is structurally blind to them. GPTBot reading
`/docs/quickstart`, ClaudeBot fetching `/llms.txt`, an agent curling your API — none
of it reaches `/api/send`. RFD 0002's classifier only sees the JS-executing minority.
To measure AI consumption of a site you must collect at the HTTP layer: a
fire-and-forget hit from the site's own server/edge middleware for every request.

## Design

### Endpoint

`POST /api/collect` — API-key-authenticated (RFD 0001), so unlike `/api/send` we can
trust caller-supplied `ip` and `userAgent`.

```jsonc
{
  "websiteId": "…",
  "url": "/docs/quickstart",          // path or full URL
  "hostname": "pruva.dev",
  "referrer": "https://claude.ai/",   // optional
  "userAgent": "…",                    // required — classification input
  "ip": "…",                           // optional — geo + dedup hash only
  "name": "…",                         // optional custom event name
  "data": { },                         // optional event data
  "timestamp": 1751600000              // optional, unix seconds
}
```

Permission: key's user must pass `canUpdateWebsite`-level access? No — `canViewWebsite`
is wrong direction; collection is a write. Use website access check
(`canViewAuthenticatedWebsite`) — pragmatically the key belongs to the site owner.

### Flow

1. `detectAgent(userAgent)`:
   - **match** → `saveAgentEvent` (RFD 0002 table). This is the primary purpose and
     the hot path.
   - **no match (human)** → normal pipeline: derive `sessionId` exactly like
     `/api/send` (`uuid(websiteId, ip, userAgent, salt)`), `createSession` if needed,
     `saveEvent` as pageview/custom event. Server-rendered sites get JS-free human
     analytics as a bonus (Plausible's "proxied events" equivalent).
2. Responds `202 {}` fast; callers are middleware and must not block page serving.

### Client helper

`src/tracker/edge.md` documents a ~30-line middleware snippet (Next.js `middleware.ts`
/ generic `fetch` pattern) to vendor into theagora.dev / pruva.dev: filter static
assets, fire-and-forget with `waitUntil`-style semantics, never await in the request
path. Publishing a real npm package is deferred until the shape stabilizes.

## Merge risk

Zero — new route + doc. Fork-only (upstream is tracker-centric); some duplication of
`/api/send` URL/session logic is deliberate — sharing it would mean refactoring the
hottest upstream file.
