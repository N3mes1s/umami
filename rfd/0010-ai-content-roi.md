# RFD 0010 — AI content ROI: crawl → referral → conversion

- State: **ideation**
- Depends on: months of RFD 0002/0006 data accumulation, RFD 0007

## Thesis

Correlate what AI systems *ingest* with what they later *send back*:

> "ClaudeBot fetched `/docs/quickstart` 87× this month → 34 sessions arrived from
> claude.ai landing on that page → 6 signups."

That is a content-ROI statement no self-hosted tool can make, and it converts
analytics from measurement into strategy: it tells you what to write so that models
recommend your product. This is the fork's end-game differentiator.

## Sketch (not committed)

- Nightly rollup (RFD 0008 tick) joining `agent_event` (crawls by path) with
  LLM-channel `website_event` sessions (landing path) and goal conversions, windowed
  (e.g. crawl → referral within 30 days), into an `ai_content_stats` table.
- Attribution is correlational, not causal — the UI must say so. Confidence grows
  with per-assistant pairing (ClaudeBot crawl ↔ claude.ai referral) which the
  operator field already supports.
- Page: per-path trios (crawl volume / AI referrals / conversions) + trend, sortable
  by "AI opportunity" (crawled a lot, referred little → content models read but don't
  cite).

## Open questions

- Minimum data volume before the view is honest rather than noise?
- Path normalization (locales, trailing slashes, query params) between crawler hits
  and human landings.
- Does per-operator matching need UA-verified crawls (IP range validation) to avoid
  spoofed-UA pollution? Probably yes for headline numbers.

Not scheduled until the underlying tables have real history.
