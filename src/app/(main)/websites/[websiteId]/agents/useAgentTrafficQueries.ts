// Fork (RFD 0007): data hooks for the AI Traffic report.
import { useApi } from '@/components/hooks/useApi';
import { useDateParameters } from '@/components/hooks/useDateParameters';
import type { AgentMetricsRow, AgentMetricType } from '@/queries/sql/agents/getAgentMetrics';
import type { AgentSeriesRow } from '@/queries/sql/agents/getAgentSeries';
import type { AgentTrafficStats } from '@/queries/sql/agents/getAgentStats';

export function useAgentStatsQuery(websiteId: string) {
  const { get, useQuery } = useApi();
  const { startAt, endAt } = useDateParameters();

  return useQuery<AgentTrafficStats>({
    queryKey: ['agents:stats', { websiteId, startAt, endAt }],
    queryFn: () => get(`/websites/${websiteId}/agents/stats`, { startAt, endAt }),
    enabled: !!websiteId,
  });
}

export function useAgentSeriesQuery(websiteId: string) {
  const { get, useQuery } = useApi();
  const { startAt, endAt, unit, timezone } = useDateParameters();

  return useQuery<AgentSeriesRow[]>({
    queryKey: ['agents:series', { websiteId, startAt, endAt, unit, timezone }],
    queryFn: () => get(`/websites/${websiteId}/agents/series`, { startAt, endAt, unit, timezone }),
    enabled: !!websiteId,
  });
}

export function useAgentMetricsQuery(websiteId: string, type: AgentMetricType, limit: number = 20) {
  const { get, useQuery } = useApi();
  const { startAt, endAt } = useDateParameters();

  return useQuery<AgentMetricsRow[]>({
    queryKey: ['agents:metrics', { websiteId, startAt, endAt, type, limit }],
    queryFn: () => get(`/websites/${websiteId}/agents/metrics`, { startAt, endAt, type, limit }),
    enabled: !!websiteId,
  });
}
