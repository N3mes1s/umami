import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

// Fork (RFD 0007): top-N breakdown of agent events by name, operator or page path.

const FUNCTION_NAME = 'getAgentMetrics';

export type AgentMetricType = 'name' | 'operator' | 'path';

const METRIC_COLUMNS: Record<AgentMetricType, string> = {
  name: 'name',
  operator: 'operator',
  path: 'url_path',
};

export interface AgentMetricsFilters {
  startDate: Date;
  endDate: Date;
}

export interface AgentMetricsRow {
  x: string;
  y: number;
}

export async function getAgentMetrics(
  ...args: [websiteId: string, filters: AgentMetricsFilters, type: AgentMetricType, limit?: number]
): Promise<AgentMetricsRow[]> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => {
      throw new Error('Not implemented for ClickHouse (fork is Postgres-first)');
    },
  });
}

async function relationalQuery(
  websiteId: string,
  filters: AgentMetricsFilters,
  type: AgentMetricType,
  limit: number = 20,
): Promise<AgentMetricsRow[]> {
  const column = METRIC_COLUMNS[type];

  if (!column) {
    throw new Error(`Invalid agent metric type: ${type}`);
  }

  const { startDate, endDate } = filters;
  const { rawQuery } = prisma;

  const rows = await rawQuery(
    `
    select
      agent_event.${column} as x,
      count(*) as y
    from agent_event
    where agent_event.website_id = {{websiteId::uuid}}
      and agent_event.created_at between {{startDate}} and {{endDate}}
      and agent_event.${column} is not null
    group by 1
    order by 2 desc
    limit ${Math.max(1, Math.floor(limit))}
    `,
    { websiteId, startDate, endDate },
    FUNCTION_NAME,
  );

  return rows.map((row: { x: string; y: bigint | number }) => ({ x: row.x, y: Number(row.y) }));
}
