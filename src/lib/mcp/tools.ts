import { z } from 'zod';
import { EVENT_COLUMNS, EVENT_TYPE, SESSION_COLUMNS } from '@/lib/constants';
import { getCompareDate } from '@/lib/date';
import { resolveDateRange } from '@/lib/mcp/dates';
import { McpToolError } from '@/lib/mcp/errors';
import type { Auth, QueryFilters } from '@/lib/types';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getUserWebsites } from '@/queries/prisma/website';
import { getAgentMetrics } from '@/queries/sql/agents/getAgentMetrics';
import { getAgentStats } from '@/queries/sql/agents/getAgentStats';
import { getEventMetrics } from '@/queries/sql/events/getEventMetrics';
import { getWebsiteEvents } from '@/queries/sql/events/getWebsiteEvents';
import { getActiveVisitors } from '@/queries/sql/getActiveVisitors';
import { getChannelMetrics } from '@/queries/sql/getChannelMetrics';
import { getWebsiteStats } from '@/queries/sql/getWebsiteStats';
import { getPageviewMetrics } from '@/queries/sql/pageviews/getPageviewMetrics';
import { getPageviewStats } from '@/queries/sql/pageviews/getPageviewStats';
import { type FunnelParameters, getFunnel } from '@/queries/sql/reports/getFunnel';
import { type GoalParameters, getGoal } from '@/queries/sql/reports/getGoal';
import { getJourney, type JourneyParameters } from '@/queries/sql/reports/getJourney';
import { getRetention, type RetentionParameters } from '@/queries/sql/reports/getRetention';
import { getSessionMetrics } from '@/queries/sql/sessions/getSessionMetrics';
import { getSessionStats } from '@/queries/sql/sessions/getSessionStats';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  execute: (auth: Auth, args: any) => Promise<any>;
}

const DEFAULT_ROW_CAP = 50;
const MAX_ROW_CAP = 100;

const METRIC_SEMANTICS =
  'Metric semantics: visitors = count of distinct salted session IDs (the salt rotates monthly by ' +
  'default, so ranges spanning a month boundary can double-count returning people); visits = ' +
  'sessions split into 30-minute inactivity windows; bounces = visits with a single pageview; ' +
  'durations are in seconds.';

const RANGE_SEMANTICS =
  "The range parameter accepts relative strings ('24h', '7d', '30d', '90d', 'today', 'week', " +
  "'month') or absolute epoch-millisecond bounds { startAt, endAt }. The resolved absolute range " +
  'is echoed back as range_echo in every response.';

const websiteIdSchema = z
  .string()
  .describe('Website ID (UUID). Use the list_websites tool to discover available websites.');

const rangeSchema = z
  .union([
    z.enum(['24h', '7d', '30d', '90d', 'today', 'week', 'month']),
    z.object({
      startAt: z.number().int().describe('Range start, epoch milliseconds'),
      endAt: z.number().int().optional().describe('Range end, epoch milliseconds (default: now)'),
    }),
  ])
  .default('7d')
  .describe(
    "Date range: a relative string ('24h', '7d', '30d', '90d', 'today', 'week', 'month') or " +
      'absolute epoch-millisecond bounds { startAt, endAt }.',
  );

const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_ROW_CAP)
  .default(DEFAULT_ROW_CAP)
  .describe(`Maximum number of rows to return (default ${DEFAULT_ROW_CAP}, max ${MAX_ROW_CAP})`);

async function checkWebsiteAccess(auth: Auth, websiteId: string) {
  // MCP is authenticated with a user session or API key; share tokens are
  // section-scoped and must not grant blanket access to these tools.
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    throw new McpToolError('Access denied to website');
  }
}

function toQueryFilters(range: string | { startAt?: number; endAt?: number }): {
  filters: QueryFilters;
  echo: string;
} {
  const { startDate, endDate, unit, echo } = resolveDateRange(range ?? '7d');

  return { filters: { startDate, endDate, timezone: 'UTC', unit }, echo };
}

function capRows<T>(rows: T[], limit: number = DEFAULT_ROW_CAP): { rows: T[]; truncated: boolean } {
  const max = Math.min(limit || DEFAULT_ROW_CAP, MAX_ROW_CAP);

  return { rows: rows.slice(0, max), truncated: rows.length > max };
}

function formatStats(stats: Record<string, any>) {
  return {
    pageviews: Number(stats?.pageviews ?? 0),
    visitors: Number(stats?.visitors ?? 0),
    visits: Number(stats?.visits ?? 0),
    bounces: Number(stats?.bounces ?? 0),
    total_time_seconds: Number(stats?.totaltime ?? 0),
  };
}

const listWebsites: McpTool = {
  name: 'list_websites',
  description:
    'List the websites the authenticated user can access (id, name, domain). Returns at most 100 ' +
    'websites. Use the returned id as websiteId for the other analytics tools.',
  inputSchema: z.object({}),
  async execute(auth) {
    if (!auth?.user?.id) {
      throw new McpToolError('Authentication required');
    }

    const { data, count } = await getUserWebsites(auth.user.id, { page: 1, pageSize: 100 });

    return {
      count,
      websites: data.map((website: any) => ({
        id: website.id,
        name: website.name,
        domain: website.domain,
        createdAt: website.createdAt,
      })),
    };
  },
};

const getWebsiteStatsTool: McpTool = {
  name: 'get_website_stats',
  description:
    'Get summary traffic stats for a website over a date range, plus the same stats for the ' +
    `equal-length previous period for comparison. ${METRIC_SEMANTICS} ${RANGE_SEMANTICS}`,
  inputSchema: z.object({
    websiteId: websiteIdSchema,
    range: rangeSchema,
  }),
  async execute(auth, args) {
    await checkWebsiteAccess(auth, args.websiteId);

    const { filters, echo } = toQueryFilters(args.range);
    const { startDate, endDate } = getCompareDate('prev', filters.startDate, filters.endDate);

    const [current, previous] = await Promise.all([
      getWebsiteStats(args.websiteId, filters),
      getWebsiteStats(args.websiteId, { ...filters, startDate, endDate }),
    ]);

    return {
      range_echo: echo,
      definitions: METRIC_SEMANTICS,
      current: formatStats(current),
      previous: formatStats(previous),
    };
  },
};

const getPageviewSeries: McpTool = {
  name: 'get_pageview_series',
  description:
    'Get pageview and session (visitor) time series for a website. The time unit (hour/day/month) ' +
    'is chosen automatically from the range length and echoed back. Each point is ' +
    `{ x: bucket start, y: count }. ${METRIC_SEMANTICS} ${RANGE_SEMANTICS}`,
  inputSchema: z.object({
    websiteId: websiteIdSchema,
    range: rangeSchema,
  }),
  async execute(auth, args) {
    await checkWebsiteAccess(auth, args.websiteId);

    const { filters, echo } = toQueryFilters(args.range);

    const [pageviews, sessions] = await Promise.all([
      getPageviewStats(args.websiteId, filters),
      getSessionStats(args.websiteId, filters),
    ]);

    const cappedPageviews = capRows(pageviews, MAX_ROW_CAP);
    const cappedSessions = capRows(sessions, MAX_ROW_CAP);

    return {
      range_echo: echo,
      unit: filters.unit,
      pageviews: cappedPageviews.rows,
      sessions: cappedSessions.rows,
      truncated: cappedPageviews.truncated || cappedSessions.truncated,
    };
  },
};

const METRIC_TYPES = [
  'url',
  'referrer',
  'browser',
  'os',
  'device',
  'country',
  'region',
  'city',
  'language',
  'event',
  'hostname',
  'tag',
  'channel',
] as const;

// The public tool type names map onto internal metric column names.
const METRIC_TYPE_ALIASES: Record<string, string> = {
  url: 'path',
};

const getMetrics: McpTool = {
  name: 'get_metrics',
  description:
    'Get a ranked breakdown of website traffic by a dimension: url (page path), referrer ' +
    '(referrer domain), browser, os, device, country, region, city, language, event (custom ' +
    'event names), hostname, tag, or channel (direct/search/social/email/...). Returns rows of ' +
    `{ x: dimension value, y: count }; y counts visitors for session dimensions and views/events ` +
    `for page/event dimensions. ${METRIC_SEMANTICS} ${RANGE_SEMANTICS}`,
  inputSchema: z.object({
    websiteId: websiteIdSchema,
    range: rangeSchema,
    type: z.enum(METRIC_TYPES).describe('The dimension to break traffic down by'),
    limit: limitSchema,
  }),
  async execute(auth, args) {
    await checkWebsiteAccess(auth, args.websiteId);

    const { filters, echo } = toQueryFilters(args.range);
    const limit = Math.min(args.limit ?? DEFAULT_ROW_CAP, MAX_ROW_CAP);
    const type = METRIC_TYPE_ALIASES[args.type] ?? args.type;

    let data: any[];

    if (SESSION_COLUMNS.includes(type)) {
      data = await getSessionMetrics(args.websiteId, { type, limit, offset: 0 }, filters);
    } else if (EVENT_COLUMNS.includes(type)) {
      if (type === 'event') {
        filters.eventType = EVENT_TYPE.customEvent;
        data = await getEventMetrics(
          args.websiteId,
          { type, limit: String(limit), offset: '0' },
          filters,
        );
      } else {
        data = await getPageviewMetrics(args.websiteId, { type, limit, offset: 0 }, filters);
      }
    } else if (type === 'channel') {
      data = await getChannelMetrics(args.websiteId, filters);
    } else {
      throw new McpToolError(`Invalid metric type: ${args.type}`);
    }

    const capped = capRows(data, limit);

    return {
      range_echo: echo,
      type: args.type,
      metrics: capped.rows,
      truncated: capped.truncated,
    };
  },
};

const EVENT_TYPE_NAMES: Record<number, string> = {
  [EVENT_TYPE.pageView]: 'pageview',
  [EVENT_TYPE.customEvent]: 'event',
};

const getEvents: McpTool = {
  name: 'get_events',
  description:
    'Get recent individual events (pageviews and custom events) for a website, newest first, ' +
    'with event names, page paths, referrer domains and visitor context (country, browser, ' +
    `device). ${RANGE_SEMANTICS}`,
  inputSchema: z.object({
    websiteId: websiteIdSchema,
    range: rangeSchema,
    limit: limitSchema,
  }),
  async execute(auth, args) {
    await checkWebsiteAccess(auth, args.websiteId);

    const { filters, echo } = toQueryFilters(args.range);
    const limit = Math.min(args.limit ?? DEFAULT_ROW_CAP, MAX_ROW_CAP);

    const { data, count } = await getWebsiteEvents(args.websiteId, {
      ...filters,
      page: 1,
      pageSize: limit,
    });

    return {
      range_echo: echo,
      total: Number(count),
      events: data.map((event: any) => ({
        createdAt: event.createdAt,
        type: EVENT_TYPE_NAMES[event.eventType] ?? String(event.eventType),
        eventName: event.eventName,
        urlPath: event.urlPath,
        referrerDomain: event.referrerDomain,
        country: event.country,
        browser: event.browser,
        device: event.device,
      })),
    };
  },
};

const getActiveVisitorsTool: McpTool = {
  name: 'get_active_visitors',
  description:
    'Get the number of visitors active on a website right now (distinct sessions with an event ' +
    'in the last 5 minutes).',
  inputSchema: z.object({
    websiteId: websiteIdSchema,
  }),
  async execute(auth, args) {
    await checkWebsiteAccess(auth, args.websiteId);

    const result = await getActiveVisitors(args.websiteId);

    return { visitors: Number(result?.visitors ?? 0), window_minutes: 5 };
  },
};

// The public step type names map onto the internal names getFunnel expects
// ('path' | 'event'), mirroring METRIC_TYPE_ALIASES.
const FUNNEL_STEP_TYPE_ALIASES: Record<string, string> = {
  url: 'path',
};

const funnelStepSchema = z.object({
  type: z.enum(['url', 'event']),
  value: z.string().min(1),
});

const funnelStepsSchema = z.array(funnelStepSchema).min(2);

const runReport: McpTool = {
  name: 'run_report',
  description:
    'Run an analytics report. Required "parameters" object per report type: ' +
    'funnel: { window: number (minutes allowed between steps), steps: [{ type: "url" | "event", ' +
    'value: string }, ...] } with at least 2 steps; ' +
    'retention: {} (no parameters; returns day-by-day return-visitor cohorts over the range); ' +
    'journey: { steps: number (3-7, default 5), startStep?: string, endStep?: string } (common ' +
    'navigation paths); ' +
    'goal: { type: "path" | "event", value: string } where value may use * as a wildcard prefix/' +
    `suffix. ${METRIC_SEMANTICS} ${RANGE_SEMANTICS}`,
  inputSchema: z.object({
    websiteId: websiteIdSchema,
    range: rangeSchema,
    type: z.enum(['funnel', 'retention', 'journey', 'goal']).describe('Report type'),
    parameters: z
      .record(z.string(), z.any())
      .default({})
      .describe('Report parameters; the required shape depends on type (see tool description)'),
  }),
  async execute(auth, args) {
    await checkWebsiteAccess(auth, args.websiteId);

    const { filters, echo } = toQueryFilters(args.range);
    const { startDate, endDate } = filters;
    const parameters = args.parameters ?? {};

    let data: any;
    let truncated = false;

    switch (args.type) {
      case 'funnel': {
        const { window } = parameters;

        const parsedSteps = funnelStepsSchema.safeParse(parameters.steps);

        if (!parsedSteps.success) {
          throw new McpToolError(
            'funnel requires parameters.steps: an array of at least 2 steps of ' +
              '{ type: "url" | "event", value: string }',
          );
        }

        if (typeof window !== 'number' || window <= 0) {
          throw new McpToolError(
            'funnel requires parameters.window: a positive number of minutes allowed between steps',
          );
        }

        const steps = parsedSteps.data.map(step => ({
          type: FUNNEL_STEP_TYPE_ALIASES[step.type] ?? step.type,
          value: step.value,
        }));

        data = await getFunnel(
          args.websiteId,
          { startDate, endDate, window, steps } as FunnelParameters,
          filters,
        );
        break;
      }
      case 'retention': {
        const result = capRows(
          await getRetention(
            args.websiteId,
            { startDate, endDate, timezone: 'UTC' } as RetentionParameters,
            filters,
          ),
          MAX_ROW_CAP,
        );

        data = result.rows;
        truncated = result.truncated;
        break;
      }
      case 'journey': {
        const steps = Math.min(Math.max(Number(parameters.steps) || 5, 3), 7);

        const result = capRows(
          await getJourney(
            args.websiteId,
            {
              startDate,
              endDate,
              steps,
              startStep: parameters.startStep,
              endStep: parameters.endStep,
            } as JourneyParameters,
            filters,
          ),
          MAX_ROW_CAP,
        );

        data = result.rows;
        truncated = result.truncated;
        break;
      }
      case 'goal': {
        const { type, value } = parameters;

        if ((type !== 'path' && type !== 'event') || typeof value !== 'string' || !value) {
          throw new McpToolError(
            'goal requires parameters.type ("path" | "event") and parameters.value (string, ' +
              '* wildcard allowed)',
          );
        }

        data = await getGoal(
          args.websiteId,
          { startDate, endDate, type, value } as GoalParameters,
          filters,
        );
        break;
      }
      default:
        throw new McpToolError(`Invalid report type: ${args.type}`);
    }

    return { range_echo: echo, type: args.type, result: data, truncated };
  },
};

// Fork (RFD 0007): AI & bot traffic report.
const getAgentTraffic: McpTool = {
  name: 'get_agent_traffic',
  description:
    'Get AI and bot traffic for a website (server-side classified agent events, separate from ' +
    'regular pageviews). Returns stats for the range and the equal-length previous period ' +
    '(events = all classified bot/agent events; crawlers = ai_crawler AI training/ingestion ' +
    'crawlers like GPTBot/ClaudeBot; agents = ai_agent user-directed AI browsing like ' +
    'ChatGPT-User/Claude-User; search = ai_search AI search indexers; other = search crawlers, ' +
    'SEO tools, monitoring and other bots; distinctClients = distinct hashed client IPs), plus a ' +
    'top breakdown by agent name, operator, or page path as rows of { x: value, y: event count } ' +
    `(up to 20 rows). ${RANGE_SEMANTICS}`,
  inputSchema: z.object({
    websiteId: websiteIdSchema,
    range: rangeSchema,
    breakdown: z
      .enum(['name', 'operator', 'path'])
      .optional()
      .describe('Dimension for the top breakdown: agent name (default), operator, or page path'),
  }),
  async execute(auth, args) {
    await checkWebsiteAccess(auth, args.websiteId);

    const { filters, echo } = toQueryFilters(args.range);
    const { startDate, endDate } = filters;
    const breakdown = args.breakdown ?? 'name';

    const [stats, top] = await Promise.all([
      getAgentStats(args.websiteId, { startDate, endDate }),
      getAgentMetrics(args.websiteId, { startDate, endDate }, breakdown),
    ]);

    return { range_echo: echo, breakdown, stats, top };
  },
};

export const mcpTools: McpTool[] = [
  listWebsites,
  getWebsiteStatsTool,
  getPageviewSeries,
  getMetrics,
  getEvents,
  getActiveVisitorsTool,
  runReport,
  getAgentTraffic, // Fork (RFD 0007)
];
