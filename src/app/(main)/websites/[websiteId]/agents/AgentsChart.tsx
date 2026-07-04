// Fork (RFD 0007): stacked bar chart of agent events over time by category.
import { useCallback, useMemo } from 'react';
import { BarChart } from '@/components/charts/BarChart';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useDateRange, useLocale, useTimezone } from '@/components/hooks';
import { renderDateLabels } from '@/lib/charts';
import { CHART_COLORS } from '@/lib/constants';
import { generateTimeSeries } from '@/lib/date';
import { getAgentCategoryLabel, groupSeriesByCategory } from './categories';
import { useAgentSeriesQuery } from './useAgentTrafficQueries';

export function AgentsChart({ websiteId }: { websiteId: string }) {
  const { timezone } = useTimezone();
  const { dateRange } = useDateRange({ timezone });
  const { startDate, endDate, unit, value } = dateRange;
  const { locale, dateLocale } = useLocale();
  const { data, isLoading, isFetching, error } = useAgentSeriesQuery(websiteId);

  const chartData: any = useMemo(() => {
    if (!data) {
      return { datasets: [] };
    }

    return {
      __id: Date.now(),
      datasets: groupSeriesByCategory(data).map(({ category, data: series }, index) => ({
        type: 'bar',
        label: getAgentCategoryLabel(category),
        data: generateTimeSeries(series, startDate, endDate, unit, dateLocale),
        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
        borderColor: CHART_COLORS[index % CHART_COLORS.length],
        borderWidth: 1,
        barPercentage: 0.9,
        categoryPercentage: 0.9,
      })),
    };
  }, [data, startDate, endDate, unit, dateLocale]);

  const renderXLabel = useCallback(renderDateLabels(unit, locale), [unit, locale]);

  return (
    <LoadingPanel data={data} isLoading={isLoading} isFetching={isFetching} error={error}>
      <BarChart
        key={value}
        chartData={chartData}
        unit={unit}
        stacked={true}
        minDate={startDate}
        maxDate={endDate}
        renderXLabel={renderXLabel}
        height="400px"
      />
    </LoadingPanel>
  );
}
