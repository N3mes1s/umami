// Fork (RFD 0007): top agents and most-fetched pages tables.
import { Grid } from '@umami/react-zen';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { ListTable } from '@/components/metrics/ListTable';
import { AGENT_RULES } from '@/lib/agents';
import type { AgentMetricsRow, AgentMetricType } from '@/queries/sql/agents/getAgentMetrics';
import { useAgentMetricsQuery } from './useAgentTrafficQueries';

function getOperator(name: string): string | null {
  return AGENT_RULES.find(rule => rule.name === name)?.operator ?? null;
}

function toListData(data: AgentMetricsRow[] | undefined, renderLabel: (x: string) => string) {
  const total = data?.reduce((sum, { y }) => sum + Number(y), 0) ?? 0;

  return data?.map(({ x, y }) => ({
    label: renderLabel(x),
    count: Number(y),
    percent: total ? (Number(y) / total) * 100 : 0,
  }));
}

export function AgentsTables({ websiteId }: { websiteId: string }) {
  return (
    <Grid columns={{ base: '1fr', md: '1fr 1fr' }} gap>
      <AgentsMetricsTable
        websiteId={websiteId}
        type="name"
        title="Top agents"
        renderLabel={name => {
          const operator = getOperator(name);
          return operator ? `${name} — ${operator}` : name;
        }}
      />
      <AgentsMetricsTable
        websiteId={websiteId}
        type="path"
        title="Most-fetched pages"
        renderLabel={path => path}
      />
    </Grid>
  );
}

function AgentsMetricsTable({
  websiteId,
  type,
  title,
  renderLabel,
}: {
  websiteId: string;
  type: AgentMetricType;
  title: string;
  renderLabel: (x: string) => string;
}) {
  const { data, isLoading, isFetching, error } = useAgentMetricsQuery(websiteId, type);

  return (
    <Panel>
      <LoadingPanel
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        minHeight="300px"
      >
        <ListTable title={title} metric="Events" data={toListData(data, renderLabel)} />
      </LoadingPanel>
    </Panel>
  );
}
