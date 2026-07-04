# RFD 0002 — Capture & classify AI/bot traffic instead of dropping it

- State: **accepted** (→ implemented)
- Depends on: nothing. RFD 0006 and 0007 build on it.

## Problem

`/api/send` and `/api/record` gate on `isbot(userAgent)` and return `{beep: 'boop'}`
without writing anything (`src/app/api/send/route.ts:137`). In 2026 that discards the
most strategically interesting traffic a site gets: GPTBot/ClaudeBot/PerplexityBot
ingesting content (which precedes LLM referrals — a channel Umami *does* track), and
browser-driving agents acting on behalf of users. `DISABLE_BOT_CHECK` is the only
alternative and it pollutes human metrics. You cannot analyze data you deleted, and
backfill is impossible — every week this isn't shipped is a week of lost signal.

## Design

### Principle: separate pipeline, untouched human metrics

Bot traffic does **not** enter `session`/`website_event`. It goes to a dedicated
`agent_event` table. Rationale:

- Every existing query stays byte-identical (no `WHERE NOT bot` sprinkled through ~60
  dual-implemented SQL files — an unmaintainable fork diff).
- Human sessionization (ip+ua+salt, 30-min visits, bounce) is wrong for crawlers anyway
  (see RFD 0012); pretending a crawler is a session corrupts both models.

### Classifier — `src/lib/agents.ts` (fork-owned)

`detectAgent(userAgent) → { category, name, operator } | null`

Categories:

| category | examples |
| --- | --- |
| `ai_crawler` | GPTBot, ClaudeBot, CCBot, Google-Extended, Applebot-Extended, Bytespider, Meta-ExternalAgent, Amazonbot, cohere-ai |
| `ai_agent` | ChatGPT-User, Claude-User, Perplexity-User, OAI-SearchBot fetches on behalf of a user, Devin, computer-use browsers |
| `ai_search` | OAI-SearchBot, Claude-SearchBot, PerplexityBot, DuckAssistBot, YouBot |
| `search_crawler` | Googlebot, Bingbot, DuckDuckBot, YandexBot, Baiduspider |
| `seo_tool` | AhrefsBot, SemrushBot, MJ12bot, DotBot, DataForSeoBot |
| `monitoring` | UptimeRobot, Pingdom, StatusCake, BetterUptime |
| `other_bot` | anything else `isbot()` matches |

Curated regex table, first match wins; falls through to `isbot()` → `other_bot`.
The table is data (exported array), so additions are one-line diffs and the same source
feeds RFD 0003's referral domains and RFD 0007's UI labels.

### Storage (additive migration `22_add_agent_event`)

```prisma
model AgentEvent {
  id             String   @id @map("agent_event_id") @db.Uuid
  websiteId      String   @map("website_id") @db.Uuid
  category       String   @db.VarChar(20)
  name           String?  @db.VarChar(50)
  operator       String?  @db.VarChar(50)
  urlPath        String   @map("url_path") @db.VarChar(500)
  hostname       String?  @db.VarChar(100)
  referrerDomain String?  @map("referrer_domain") @db.VarChar(500)
  userAgent      String?  @map("user_agent") @db.VarChar(500)  // raw, for reclassification
  ipHash         String?  @map("ip_hash") @db.VarChar(64)      // hash(ip, daily salt) — dedup only
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@index([websiteId, createdAt])
  @@index([websiteId, createdAt, name])
  @@index([websiteId, createdAt, urlPath])
  @@map("agent_event")
}
```

Privacy: raw IP never stored; `ipHash` uses the daily salt so "distinct clients per day"
is answerable but cross-day correlation isn't. Raw UA is stored (it's what bots exist
to broadcast) so future classifier improvements can re-run over history.

### Ingest hook

In `send/route.ts`, the isbot block becomes one call:

```ts
const agentCheck = await checkAgentTraffic({ userAgent, websiteId, urlPath, hostname, referrer, ip });
if (agentCheck.handled) return json(agentCheck.response);
```

`checkAgentTraffic` (fork-owned) preserves upstream semantics exactly:
`DISABLE_BOT_CHECK=1` → not handled, bot flows into human pipeline (upstream behavior);
otherwise classified bots are persisted to `agent_event` (pageview-type payloads with a
`website` id only) and get `{beep: 'boop'}`. New env `AGENT_TRACKING=0` restores the
pure drop behavior.

Reality check: most AI crawlers never execute the JS tracker, so `/api/send` only
catches JS-executing agents. The full firehose arrives via RFD 0006 (server-side
collection), which writes to this same table through the same classifier.

## Merge risk

`send/route.ts` diff is ~6 lines replacing the isbot block — the file upstream churns
most, so the hook is deliberately minimal. Schema append + new files otherwise.
Fork-only for now; upstreamable once proven (Plausible shipped "AI referrals" in 2025,
crawler analytics is the obvious next step for upstream too).
