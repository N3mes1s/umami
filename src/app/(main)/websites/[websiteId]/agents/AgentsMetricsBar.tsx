// Fork (RFD 0007): metric cards for the AI Traffic report.
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useDateRange } from '@/components/hooks';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { formatLongNumber } from '@/lib/format';
import { useAgentStatsQuery } from './useAgentTrafficQueries';

export function AgentsMetricsBar({ websiteId }: { websiteId: string }) {
  const { isAllTime } = useDateRange();
  const { data, isLoading, isFetching, error } = useAgentStatsQuery(websiteId);

  const { current, previous } = data || {};

  const metrics = data
    ? [
        {
          label: 'AI events',
          value: current.events,
          change: current.events - previous.events,
        },
        {
          label: 'AI crawlers',
          value: current.crawlers,
          change: current.crawlers - previous.crawlers,
        },
        {
          label: 'AI agents',
          value: current.agents,
          change: current.agents - previous.agents,
        },
        {
          label: 'Distinct clients',
          value: current.distinctClients,
          change: current.distinctClients - previous.distinctClients,
        },
      ]
    : null;

  return (
    <LoadingPanel
      data={metrics}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error}
      minHeight="136px"
    >
      <MetricsBar>
        {metrics?.map(({ label, value, change }) => (
          <MetricCard
            key={label}
            label={label}
            value={value}
            change={change}
            formatValue={formatLongNumber}
            showChange={!isAllTime}
          />
        ))}
      </MetricsBar>
    </LoadingPanel>
  );
}
