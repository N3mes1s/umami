// Fork (RFD 0007): LLM referrals panel — existing referrer metrics filtered
// client-side to known AI-assistant domains (RFD 0003 labels).
import { useMemo } from 'react';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { useWebsiteMetricsQuery } from '@/components/hooks/queries/useWebsiteMetricsQuery';
import { ListTable } from '@/components/metrics/ListTable';
import { getAssistantLabel } from './categories';

export function LlmReferralsPanel({ websiteId }: { websiteId: string }) {
  const { data, isLoading, isFetching, error } = useWebsiteMetricsQuery(websiteId, {
    type: 'referrer',
    limit: 500,
  });

  const rows = useMemo(() => {
    const totals = new Map<string, number>();

    for (const { x, y } of data ?? []) {
      const label = getAssistantLabel(x);

      if (label) {
        totals.set(label, (totals.get(label) ?? 0) + Number(y));
      }
    }

    const list = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const total = list.reduce((sum, [, count]) => sum + count, 0);

    return list.map(([label, count]) => ({
      label,
      count,
      percent: total ? (count / total) * 100 : 0,
    }));
  }, [data]);

  return (
    <Panel
      title="LLM referrals"
      description="Visitors arriving from AI assistants (ChatGPT, Claude, Perplexity, ...)"
    >
      <LoadingPanel
        data={data}
        isEmpty={rows.length === 0}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        minHeight="200px"
      >
        <ListTable title="Assistant" metric="Visitors" data={rows} />
      </LoadingPanel>
    </Panel>
  );
}
