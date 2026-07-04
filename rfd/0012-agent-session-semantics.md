# RFD 0012 — Agent session semantics

- State: **ideation**
- Depends on: RFD 0002/0006 data proving the need

## Thesis

Human session logic is wrong for non-humans, in both directions:

- **Crawlers** fetch in bursts from rotating IP pools. `uuid(ip, ua, salt)`
  sessionization shreds one logical crawl into hundreds of "sessions". The natural
  unit is *(operator, day)* — "OpenAI crawled 400 pages today", not "400 visitors".
- **Browser agents** complete tasks in seconds. "Bounce rate" and "visit duration"
  are meaningless; *task completion* (did the agent reach the conversion endpoint /
  fetch the pricing page / call the API?) is the metric.

`agent_event` deliberately has no visit model yet (RFD 0002). This RFD is where one
would grow.

## Sketch (not committed)

- **Crawl sessions:** derived, not stored — group `agent_event` by (operator, day)
  at query time; materialize a daily rollup (`agent_daily_stats`) once volume hurts.
- **Agent journeys:** for `ai_agent`-category traffic with stable `ipHash` within a
  day, order events into a path and render with the existing Journey visualization.
- **Agent funnels:** funnel report variant over `agent_event` paths ("of agents that
  read /docs, how many reached /api/signup?").
- **Coverage metric:** % of site paths fetched by a given operator in a window —
  "Anthropic has ingested 74% of pruva.dev's docs".

## Open questions

- Is `ipHash` (daily-salted) stable enough to sequence agent journeys, or do we need
  a coarser (operator, ASN?) key — and is that worth the privacy surface?
- Do verified bot IP ranges (Google/OpenAI/Anthropic publish them) belong in the
  classifier first (RFD 0002 hardening) before any of this is trustworthy?

Deliberately last: only worth building once RFD 0007 shows real usage patterns.
