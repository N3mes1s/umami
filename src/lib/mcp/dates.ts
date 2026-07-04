import {
  differenceInDays,
  differenceInHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subHours,
} from 'date-fns';
import { McpToolError } from '@/lib/mcp/errors';

export const RELATIVE_RANGES = ['24h', '7d', '30d', '90d', 'today', 'week', 'month'] as const;

export interface ResolvedDateRange {
  startDate: Date;
  endDate: Date;
  unit: string;
  echo: string;
}

export function resolveDateRange(
  range: string | { startAt?: number; endAt?: number },
): ResolvedDateRange {
  let startDate: Date;
  let endDate: Date;

  if (typeof range === 'string') {
    endDate = new Date();

    switch (range) {
      case '24h':
        startDate = subHours(endDate, 24);
        break;
      case '7d':
        startDate = subDays(endDate, 7);
        break;
      case '30d':
        startDate = subDays(endDate, 30);
        break;
      case '90d':
        startDate = subDays(endDate, 90);
        break;
      case 'today':
        startDate = startOfDay(endDate);
        break;
      case 'week':
        startDate = startOfWeek(endDate);
        break;
      case 'month':
        startDate = startOfMonth(endDate);
        break;
      default:
        throw new McpToolError(
          `Invalid range "${range}". Use one of ${RELATIVE_RANGES.join(', ')} or { startAt, endAt } in epoch milliseconds.`,
        );
    }
  } else if (range && typeof range === 'object' && typeof range.startAt === 'number') {
    startDate = new Date(range.startAt);
    endDate = typeof range.endAt === 'number' ? new Date(range.endAt) : new Date();
  } else {
    throw new McpToolError(
      `Invalid range. Use a relative string (${RELATIVE_RANGES.join(', ')}) or { startAt, endAt } in epoch milliseconds.`,
    );
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new McpToolError('Invalid range: startAt/endAt must be valid epoch milliseconds.');
  }

  if (startDate >= endDate) {
    throw new McpToolError('Invalid range: startAt must be before endAt.');
  }

  const unit = getUnit(startDate, endDate);

  return {
    startDate,
    endDate,
    unit,
    echo: `${formatDate(startDate)} → ${formatDate(endDate)} (unit: ${unit})`,
  };
}

function getUnit(startDate: Date, endDate: Date): string {
  if (differenceInHours(endDate, startDate) <= 48) {
    return 'hour';
  }

  if (differenceInDays(endDate, startDate) <= 90) {
    return 'day';
  }

  return 'month';
}

function formatDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
