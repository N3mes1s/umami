import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

// Fork (RFD 0007): agent events over time, grouped by time bucket and category.

const FUNCTION_NAME = 'getAgentSeries';

export interface AgentSeriesFilters {
  startDate: Date;
  endDate: Date;
  unit?: string;
  timezone?: string;
}

export interface AgentSeriesRow {
  t: string;
  category: string;
  count: number;
}

export async function getAgentSeries(
  ...args: [websiteId: string, filters: AgentSeriesFilters]
): Promise<AgentSeriesRow[]> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => {
      throw new Error('Not implemented for ClickHouse (fork is Postgres-first)');
    },
  });
}

async function relationalQuery(
  websiteId: string,
  filters: AgentSeriesFilters,
): Promise<AgentSeriesRow[]> {
  const { startDate, endDate, timezone = 'utc', unit = 'day' } = filters;
  const { getDateSQL, rawQuery } = prisma;

  return rawQuery(
    `
    select
      ${getDateSQL('agent_event.created_at', unit, timezone)} t,
      agent_event.category as category,
      count(*) as count
    from agent_event
    where agent_event.website_id = {{websiteId::uuid}}
      and agent_event.created_at between {{startDate}} and {{endDate}}
    group by 1, 2
    order by 1
    `,
    { websiteId, startDate, endDate },
    FUNCTION_NAME,
  );
}
