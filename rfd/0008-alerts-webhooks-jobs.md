# RFD 0008 — Alerts, webhooks & the jobs runner

- State: **accepted** (→ implemented)
- Depends on: RFD 0001 (jobs auth option), RFD 0002 (new-agent alerts)

## Problem

Umami cannot tell you anything unprompted: no webhooks, no email, no cron, no alerts,
no scheduler of any kind (audited: zero call sites). An analytics tool that must be
opened to be useful is a dashboard you forget. Wanted: "traffic spiked", "goal
converted N times", "a new AI crawler showed up", pushed to Slack/Discord/webhook —
and a scheduled substrate the AI digest (RFD 0009) can ride on.

## Design

### Scheduling: external tick, internal logic

The app has no daemon and shouldn't grow one (serverless-hostile, second process on
Railway). Instead: `POST /api/jobs/tick`, idempotent, called by any external cron
(Railway cron, GitHub Actions, `curl` in crontab). Auth: `x-umami-jobs-key` header
matching env `JOBS_KEY` (no user context — the runner evaluates all enabled alerts),
or an admin API key. Each tick: find alerts due (`nextRunAt <= now`), evaluate,
deliver, reschedule. Ticks more frequent than alert granularity are no-ops.

### Schema (additive migration `23_add_alert`)

```prisma
model Alert {
  id              String    @id @map("alert_id") @db.Uuid
  websiteId       String    @map("website_id") @db.Uuid
  userId          String    @map("user_id") @db.Uuid
  name            String    @db.VarChar(200)
  type            String    @db.VarChar(50)      // 'threshold' | 'change' | 'new-agent' | 'digest'
  parameters      Json                            // metric, operator, value, window, pct…
  channels        Json                            // [{type: 'slack'|'discord'|'webhook', url}]
  enabled         Boolean   @default(true)
  intervalMinutes Int       @map("interval_minutes") @default(60)
  nextRunAt       DateTime? @map("next_run_at") @db.Timestamptz(6)
  lastTriggeredAt DateTime? @map("last_triggered_at") @db.Timestamptz(6)
  createdAt / updatedAt / deletedAt …
  @@index([enabled, nextRunAt])
  @@map("alert")
}

model AlertEvent { id, alertId, websiteId, status ('triggered'|'ok'|'error'), payload Json, createdAt
  @@index([alertId, createdAt]) @@map("alert_event") }
```

### Alert types (v1)

- **threshold** — metric (`visitors|views|events|event:<name>`) over trailing window
  `{gt|lt}` value.
- **change** — metric vs same window one period earlier, trigger on ±pct. (This plus
  a same-weekday comparison is anomaly detection enough for v1; z-scores later.)
- **new-agent** — an `agent_event.name` never seen before for this website (delight
  feature: "ClaudeBot discovered pruva.dev today").
- **digest** — unconditional summary on its interval (daily/weekly), body composed by
  RFD 0009 if `ANTHROPIC_API_KEY` is set, plain numbers otherwise.

Evaluation reuses existing query functions (`getWebsiteStats`, `getEventMetrics`,
agent queries) — no new analytics SQL. Cooldown: a triggered alert won't refire until
its window fully rolls over.

### Delivery — `src/lib/notify.ts`

Plain `fetch`, 5s timeout, one retry. Slack (`blocks`) and Discord (`embeds`) payload
shapes, generic JSON POST otherwise. Every attempt logged to `alert_event`.

### API + UI

CRUD `GET/POST /api/alerts`, `GET/POST/DELETE /api/alerts/[alertId]` (permission:
website access). UI: website Settings → Alerts tab — list + create/edit form (type,
metric, threshold, channel URL) + recent `alert_event` log.

## Merge risk

Fully additive. Fork-only (upstream's cloud tier will likely never accept it).
