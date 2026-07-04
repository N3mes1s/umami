import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resolveDateRange } from '@/lib/mcp/dates';
import { McpToolError } from '@/lib/mcp/errors';

const NOW = new Date('2026-07-04T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveDateRange', () => {
  test('resolves 24h to the last 24 hours with hour unit', () => {
    const { startDate, endDate, unit } = resolveDateRange('24h');

    expect(endDate.getTime()).toBe(NOW.getTime());
    expect(endDate.getTime() - startDate.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(unit).toBe('hour');
  });

  test('resolves 7d to the last 7 days with day unit', () => {
    const { startDate, endDate, unit } = resolveDateRange('7d');

    expect(endDate.getTime() - startDate.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(unit).toBe('day');
  });

  test('resolves 30d and 90d with day unit', () => {
    expect(resolveDateRange('30d').unit).toBe('day');
    expect(resolveDateRange('90d').unit).toBe('day');
  });

  test('resolves today from start of day with hour unit', () => {
    const { startDate, endDate, unit } = resolveDateRange('today');

    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate < endDate).toBe(true);
    expect(unit).toBe('hour');
  });

  test('resolves week and month from period start', () => {
    const week = resolveDateRange('week');
    const month = resolveDateRange('month');

    expect(week.startDate <= week.endDate).toBe(true);
    expect(month.startDate.getDate()).toBe(1);
  });

  test('accepts absolute epoch-ms pairs', () => {
    const startAt = Date.UTC(2026, 5, 1);
    const endAt = Date.UTC(2026, 5, 2);
    const { startDate, endDate, unit } = resolveDateRange({ startAt, endAt });

    expect(startDate.getTime()).toBe(startAt);
    expect(endDate.getTime()).toBe(endAt);
    expect(unit).toBe('hour');
  });

  test('defaults absolute endAt to now', () => {
    const startAt = NOW.getTime() - 3 * 24 * 60 * 60 * 1000;
    const { endDate, unit } = resolveDateRange({ startAt });

    expect(endDate.getTime()).toBe(NOW.getTime());
    expect(unit).toBe('day');
  });

  test('chooses month unit beyond 90 days', () => {
    const startAt = Date.UTC(2025, 0, 1);
    const endAt = Date.UTC(2026, 0, 1);

    expect(resolveDateRange({ startAt, endAt }).unit).toBe('month');
  });

  test('chooses hour unit at exactly 48 hours and day just beyond', () => {
    const endAt = NOW.getTime();

    expect(resolveDateRange({ startAt: endAt - 48 * 60 * 60 * 1000, endAt }).unit).toBe('hour');
    expect(resolveDateRange({ startAt: endAt - 49 * 60 * 60 * 1000, endAt }).unit).toBe('day');
  });

  test('echoes the resolved range as a human string', () => {
    const { echo } = resolveDateRange({
      startAt: Date.UTC(2026, 5, 27),
      endAt: Date.UTC(2026, 6, 4, 12),
    });

    expect(echo).toBe('2026-06-27T00:00:00Z → 2026-07-04T12:00:00Z (unit: day)');
  });

  test('throws McpToolError for unknown relative strings', () => {
    expect(() => resolveDateRange('yesterday')).toThrow(McpToolError);
  });

  test('throws McpToolError for invalid or inverted absolute ranges', () => {
    expect(() => resolveDateRange({} as any)).toThrow(McpToolError);
    expect(() => resolveDateRange({ startAt: Number.NaN } as any)).toThrow(McpToolError);
    expect(() =>
      resolveDateRange({ startAt: Date.UTC(2026, 5, 2), endAt: Date.UTC(2026, 5, 1) }),
    ).toThrow(McpToolError);
  });
});
