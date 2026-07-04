/**
 * Alert evaluation engine (RFD 0008).
 *
 * Evaluation reuses existing analytics query functions — no new SQL.
 * Scheduling is externally ticked via POST /api/jobs/tick, which calls
 * runDueAlerts().
 */
import type { Alert } from '@/generated/prisma/client';
import { aiEnabled } from '@/lib/ai/client';
import { composeNarrativeDigest } from '@/lib/ai/digest';
import { uuid } from '@/lib/crypto';
import { type NotifyChannel, sendNotification } from '@/lib/notify';
import {
  createAlertEvent,
  getDueAlerts,
  getRecentAgentNames,
  hasSeenAgentName,
  updateAlert,
} from '@/queries/prisma/alert';
import { type EventMetricData, getEventMetrics } from '@/queries/sql/events/getEventMetrics';
import {
  getWebsiteEventStats,
  type WebsiteEventStatsData,
} from '@/queries/sql/events/getWebsiteEventStats';
import { getWebsiteStats, type WebsiteStatsData } from '@/queries/sql/getWebsiteStats';
import { getPageviewMetrics } from '@/queries/sql/pageviews/getPageviewMetrics';

export interface AlertField {
  name: string;
  value: string;
}

export interface AlertEvaluation {
  triggered: boolean;
  title: string;
  body: string;
  fields?: AlertField[];
}

const MINUTE_MS = 60 * 1000;

// Jitter allowance in the cooldown/state comparisons, to absorb late ticks.
const RUN_SLACK_MS = MINUTE_MS;

function operatorLabel(operator: 'gt' | 'lt') {
  return operator === 'gt' ? '>' : '<';
}

/**
 * Compute a metric value over [startDate, endDate].
 * Supported metrics: visitors | views | visits | events | event:<name>.
 */
async function getMetricValue(
  websiteId: string,
  metric: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const filters = { startDate, endDate };

  if (metric === 'events') {
    // getWebsiteEventStats resolves to a single row despite its declared type.
    const stats = (await getWebsiteEventStats(
      websiteId,
      filters,
    )) as unknown as WebsiteEventStatsData;

    return Number(stats?.events ?? 0);
  }

  if (metric.startsWith('event:')) {
    const name = metric.slice('event:'.length);
    const rows: EventMetricData[] = await getEventMetrics(websiteId, { type: 'event' }, filters);

    return Number(rows?.find(row => row.x === name)?.y ?? 0);
  }

  // getWebsiteStats resolves to a single row despite its declared type.
  const stats = (await getWebsiteStats(websiteId, filters)) as unknown as WebsiteStatsData;

  switch (metric) {
    case 'views':
      return Number(stats?.pageviews ?? 0);
    case 'visits':
      return Number(stats?.visits ?? 0);
    case 'visitors':
      return Number(stats?.visitors ?? 0);
    default:
      throw new Error(`Unknown metric: ${metric}`);
  }
}

async function evaluateThreshold(alert: Alert, now: Date): Promise<AlertEvaluation> {
  const { metric, operator, value, windowMinutes } = alert.parameters as {
    metric: string;
    operator: 'gt' | 'lt';
    value: number;
    windowMinutes: number;
  };

  const startDate = new Date(now.getTime() - windowMinutes * MINUTE_MS);
  const current = await getMetricValue(alert.websiteId, metric, startDate, now);
  const triggered = operator === 'gt' ? current > value : current < value;

  return {
    triggered,
    title: alert.name,
    body: `${metric} was ${current} over the last ${windowMinutes} minutes (${operatorLabel(
      operator,
    )} ${value})`,
    fields: [
      { name: metric, value: String(current) },
      { name: 'Condition', value: `${operatorLabel(operator)} ${value}` },
      { name: 'Window', value: `${windowMinutes} minutes` },
    ],
  };
}

async function evaluateChange(alert: Alert, now: Date): Promise<AlertEvaluation> {
  const { metric, windowMinutes, pctChange, direction } = alert.parameters as {
    metric: string;
    windowMinutes: number;
    pctChange: number;
    direction: 'up' | 'down' | 'both';
  };

  const windowMs = windowMinutes * MINUTE_MS;
  const currentStart = new Date(now.getTime() - windowMs);
  const previousStart = new Date(now.getTime() - 2 * windowMs);

  const [current, previous] = await Promise.all([
    getMetricValue(alert.websiteId, metric, currentStart, now),
    getMetricValue(alert.websiteId, metric, previousStart, currentStart),
  ]);

  // Convention: from zero to anything counts as +100%; zero to zero is 0%.
  const delta =
    previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100;

  let triggered: boolean;
  if (direction === 'up') {
    triggered = delta >= pctChange;
  } else if (direction === 'down') {
    triggered = delta <= -pctChange;
  } else {
    triggered = Math.abs(delta) >= pctChange;
  }

  const rounded = Math.round(delta * 10) / 10;

  return {
    triggered,
    title: alert.name,
    body: `${metric} changed ${rounded >= 0 ? '+' : ''}${rounded}% vs the previous ${windowMinutes} minutes (${previous} to ${current})`,
    fields: [
      { name: 'Current', value: String(current) },
      { name: 'Previous', value: String(previous) },
      { name: 'Change', value: `${rounded >= 0 ? '+' : ''}${rounded}%` },
    ],
  };
}

async function evaluateNewAgent(alert: Alert, now: Date): Promise<AlertEvaluation> {
  const since = new Date(now.getTime() - alert.intervalMinutes * MINUTE_MS);
  const names = await getRecentAgentNames(alert.websiteId, since);

  const newNames: string[] = [];

  for (const name of names) {
    if (!(await hasSeenAgentName(alert.websiteId, name, since))) {
      newNames.push(name);
    }
  }

  return {
    triggered: newNames.length > 0,
    title: alert.name,
    body: newNames.length
      ? `New agents seen in the last ${alert.intervalMinutes} minutes: ${newNames.join(', ')}`
      : `No new agents in the last ${alert.intervalMinutes} minutes`,
    fields: newNames.map(name => ({ name: 'Agent', value: name })),
  };
}

/**
 * Plain-numbers digest for a period: totals, top pages, top referrers.
 * Exported standalone so RFD 0009 can wrap it with an LLM summary later.
 */
export async function composeDigest(websiteId: string, periodMinutes: number): Promise<string> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - periodMinutes * MINUTE_MS);
  const filters = { startDate, endDate };

  const stats = (await getWebsiteStats(websiteId, filters)) as unknown as WebsiteStatsData;

  const visitors = Number(stats?.visitors ?? 0);
  const views = Number(stats?.pageviews ?? 0);
  const visits = Number(stats?.visits ?? 0);
  const bounces = Number(stats?.bounces ?? 0);
  const bounceRate = visits > 0 ? Math.round((Math.min(bounces, visits) / visits) * 100) : 0;

  const [pages, referrers] = await Promise.all([
    getPageviewMetrics(websiteId, { type: 'path', limit: 5 }, filters),
    getPageviewMetrics(websiteId, { type: 'referrer', limit: 5 }, filters),
  ]);

  const lines = [
    `Visitors: ${visitors}`,
    `Views: ${views}`,
    `Visits: ${visits}`,
    `Bounce rate: ${bounceRate}%`,
  ];

  if (pages?.length) {
    lines.push('', 'Top pages:');
    lines.push(...pages.map(({ x, y }) => `  ${x || '(unknown)'}: ${Number(y)}`));
  }

  if (referrers?.length) {
    lines.push('', 'Top referrers:');
    lines.push(...referrers.map(({ x, y }) => `  ${x || '(direct)'}: ${Number(y)}`));
  }

  return lines.join('\n');
}

async function evaluateDigest(alert: Alert): Promise<AlertEvaluation> {
  let body = await composeDigest(alert.websiteId, alert.intervalMinutes);

  // Fork (RFD 0009): rewrite as an LLM narrative when configured;
  // composeNarrativeDigest falls back to the plain text on any error.
  if (aiEnabled()) {
    body = await composeNarrativeDigest(body, alert.websiteId, alert.intervalMinutes);
  }

  return {
    triggered: true,
    title: alert.name,
    body,
  };
}

/**
 * Evaluate one alert. Returns null on evaluation error (unknown type,
 * malformed parameters, query failure).
 */
export async function evaluateAlert(alert: Alert): Promise<AlertEvaluation | null> {
  const now = new Date();

  try {
    switch (alert.type) {
      case 'threshold':
        return await evaluateThreshold(alert, now);
      case 'change':
        return await evaluateChange(alert, now);
      case 'new-agent':
        return await evaluateNewAgent(alert, now);
      case 'digest':
        return await evaluateDigest(alert);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Did the previous run of this alert trigger?
 *
 * The previous run set nextRunAt = prevRunTime + interval, so prevRunTime is
 * approximately nextRunAt - interval. If lastTriggeredAt falls at or after
 * that point, the previous evaluation triggered.
 */
function wasTriggeredLastRun(alert: Alert, now: Date): boolean {
  if (!alert.lastTriggeredAt) {
    return false;
  }

  const intervalMs = alert.intervalMinutes * MINUTE_MS;
  const prevRunTime = alert.nextRunAt
    ? alert.nextRunAt.getTime() - intervalMs
    : now.getTime() - intervalMs;

  return alert.lastTriggeredAt.getTime() >= prevRunTime - RUN_SLACK_MS;
}

export interface RunDueAlertsResult {
  processed: number;
  triggered: number;
  errors: number;
}

export async function runDueAlerts(limit: number = 50): Promise<RunDueAlertsResult> {
  const alerts = await getDueAlerts(limit);

  let processed = 0;
  let triggered = 0;
  let errors = 0;

  for (const alert of alerts) {
    const now = new Date();
    processed += 1;

    try {
      const result = await evaluateAlert(alert);

      if (!result) {
        errors += 1;

        await createAlertEvent({
          id: uuid(),
          alertId: alert.id,
          websiteId: alert.websiteId,
          status: 'error',
          payload: { message: 'Evaluation failed' },
        });
      } else if (result.triggered) {
        triggered += 1;

        // Cooldown rule: a 'threshold'/'change' alert that triggered on its
        // previous run does not re-deliver until a non-triggered evaluation
        // happens in between. We still log the (suppressed) trigger and keep
        // lastTriggeredAt fresh so the cooldown extends while the condition
        // persists. 'new-agent' and 'digest' deliver every trigger.
        const suppressed =
          (alert.type === 'threshold' || alert.type === 'change') &&
          wasTriggeredLastRun(alert, now);

        const deliveries: Array<{
          type: string;
          ok: boolean;
          status?: number;
          error?: string;
        }> = [];

        if (!suppressed) {
          const channels = (Array.isArray(alert.channels)
            ? alert.channels
            : []) as unknown as NotifyChannel[];

          for (const channel of channels) {
            const outcome = await sendNotification(channel, {
              title: result.title,
              body: result.body,
              fields: result.fields,
            });

            deliveries.push({ type: channel.type, ...outcome });
          }
        }

        await createAlertEvent({
          id: uuid(),
          alertId: alert.id,
          websiteId: alert.websiteId,
          status: 'triggered',
          payload: {
            title: result.title,
            body: result.body,
            deliveries,
            ...(suppressed && { suppressed: true }),
          },
        });
      } else if (wasTriggeredLastRun(alert, now)) {
        // Recovery: log 'ok' only when the previous run had triggered,
        // to avoid an endless stream of no-op rows.
        await createAlertEvent({
          id: uuid(),
          alertId: alert.id,
          websiteId: alert.websiteId,
          status: 'ok',
          payload: { title: result.title, body: result.body },
        });
      }

      await updateAlert(alert.id, {
        nextRunAt: new Date(now.getTime() + alert.intervalMinutes * MINUTE_MS),
        ...(result?.triggered && { lastTriggeredAt: now }),
      });
    } catch {
      errors += 1;

      // Still reschedule so a persistently failing alert cannot wedge the runner.
      await updateAlert(alert.id, {
        nextRunAt: new Date(now.getTime() + alert.intervalMinutes * MINUTE_MS),
      }).catch(() => undefined);
    }
  }

  return { processed, triggered, errors };
}
