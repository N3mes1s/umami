# RFD 0003 — Expanded AI-assistant referral attribution

- State: **accepted** (→ implemented)
- Depends on: RFD 0002 (shares the data table in `src/lib/agents.ts`)

## Problem

Upstream classifies referrers into an "LLM" channel using `LLM_DOMAINS`
(`src/lib/constants.ts:363`): six domains (chatgpt.com, claude.ai,
copilot.microsoft.com, gemini.google.com, meta.ai, perplexity.ai). Already stale for
2026 — no grok.com, chat.deepseek.com, chat.mistral.ai, kagi.com, you.com, poe.com,
felo.ai, phind.com, andisearch.com, iask.ai, komo.ai. LLM referrals are the
fastest-growing acquisition channel for developer-facing sites (theagora.dev,
pruva.dev) and they're currently undercounted and unlabeled.

## Design

1. `src/lib/agents.ts` exports `AI_ASSISTANT_DOMAINS: string[]` — the superset list,
   maintained in one fork-owned place alongside the crawler table (same vendors, same
   research). Each entry carries a display label (`chatgpt.com → ChatGPT`).
2. `constants.ts` change is a single append: `LLM_DOMAINS.push(...FORK_LLM_DOMAINS)`
   equivalent — implemented as a spread in the array literal's tail or a one-line
   import+concat, whichever survives merges better. Everything downstream
   (`getChannelMetrics`, `getChannelExpandedMetrics`, `getRevenueMetrics`) picks the
   additions up for free.
3. Per-assistant breakdown: the channel system already supports expanded drill-down
   (`getChannelExpandedMetrics`); with the domains present, filtering
   `referrer_domain eq chatgpt.com` etc. works in the existing UI today. RFD 0007's
   page adds a dedicated "LLM referrals by assistant" table using plain
   `getPageviewMetrics(type=referrer)` scoped to AI domains — no new SQL.

## Merge risk / upstreaming

The domain-list addition is the single most upstreamable diff in this fork — file a PR
against `umami-software/umami` extending `LLM_DOMAINS`, and carry only the delta until
merged. One-line conflict surface in `constants.ts` meanwhile.
