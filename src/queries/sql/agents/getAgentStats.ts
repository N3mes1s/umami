import { getCompareDate } from '@/lib/date';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

// Fork (RFD 0007): summary totals for the AI Traffic report.

const FUNCTION_NAME = 'getAgentStats';

export interface AgentTrafficTotals {
  events: number;
  crawlers: number;
  agents: number;
  search: number;
  other: number;
  distinctClients: number;
}

export interface AgentTrafficStats {
  current: AgentTrafficTotals;
  previous: AgentTrafficTotals;
}

export interface AgentDateFilters {
  startDate: Date;
  endDate: Date;
}

export async function getAgentStats(
  ...args: [websiteId: string, filters: AgentDateFilters]
): Promise<AgentTrafficStats> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => {
      throw new Error('Not implemented for ClickHouse (fork is Postgres-first)');
    },
  });
}

async function relationalQuery(
  websiteId: string,
  filters: AgentDateFilters,
): Promise<AgentTrafficStats> {
  const { startDate, endDate } = filters;
  const { startDate: prevStartDate, endDate: prevEndDate } = getCompareDate(
    'prev',
    startDate,
    endDate,
  );

  const [current, previous] = await Promise.all([
    getTotals(websiteId, startDate, endDate),
    getTotals(websiteId, prevStartDate, prevEndDate),
  ]);

  return { current, previous };
}

async function getTotals(
  websiteId: string,
  startDate: Date,
  endDate: Date,
): Promise<AgentTrafficTotals> {
  const { rawQuery } = prisma;

  const rows = await rawQuery(
    `
    select
      count(*) as events,
      count(*) filter (where category = 'ai_crawler') as crawlers,
      count(*) filter (where category = 'ai_agent') as agents,
      count(*) filter (where category = 'ai_search') as search,
      count(distinct ip_hash) as distinct_clients
    from agent_event
    where agent_event.website_id = {{websiteId::uuid}}
      and agent_event.created_at between {{startDate}} and {{endDate}}
    `,
    { websiteId, startDate, endDate },
    FUNCTION_NAME,
  );

  const row = rows?.[0] ?? {};
  const events = Number(row.events ?? 0);
  const crawlers = Number(row.crawlers ?? 0);
  const agents = Number(row.agents ?? 0);
  const search = Number(row.search ?? 0);

  return {
    events,
    crawlers,
    agents,
    search,
    other: events - crawlers - agents - search,
    distinctClients: Number(row.distinct_clients ?? 0),
  };
}
