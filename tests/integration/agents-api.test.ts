// RFD 0007 — AI & bot traffic report endpoints over seeded agent_event rows.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as metricsGet } from '@/app/api/websites/[websiteId]/agents/metrics/route';
import { GET as seriesGet } from '@/app/api/websites/[websiteId]/agents/series/route';
import { GET as statsGet } from '@/app/api/websites/[websiteId]/agents/stats/route';
import prisma from '@/lib/prisma';
import {
  createTestUser,
  createTestWebsite,
  issueApiKey,
  jsonRequest,
  seedAgentEvents,
} from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('agents report API', () => {
  let websiteId: string;
  let ownerKey: string;
  let strangerKey: string;
  let startAt: number;
  let endAt: number;

  const call = (
    handler: (
      request: Request,
      context: { params: Promise<{ websiteId: string }> },
    ) => Promise<Response>,
    path: string,
    query: string,
    bearer: string,
  ) =>
    handler(
      jsonRequest(`http://localhost/api/websites/${websiteId}/agents/${path}?${query}`, {
        method: 'GET',
        bearer,
      }),
      { params: Promise.resolve({ websiteId }) },
    );

  beforeAll(async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const website = await createTestWebsite(owner.id);

    websiteId = website.id;
    ownerKey = (await issueApiKey(owner.id)).key;
    strangerKey = (await issueApiKey(stranger.id)).key;

    const at = new Date(Date.now() - 60 * 60 * 1000);

    // 6 events: 3 ai_crawler, 2 ai_agent, 1 search_crawler ("other" bucket);
    // paths: /a x2, /b x3, /c x1; two distinct hashed clients.
    await seedAgentEvents(websiteId, [
      {
        category: 'ai_crawler',
        name: 'GPTBot',
        operator: 'OpenAI',
        urlPath: '/a',
        ipHash: 'h1'.padEnd(64, '0'),
        createdAt: at,
      },
      {
        category: 'ai_crawler',
        name: 'GPTBot',
        operator: 'OpenAI',
        urlPath: '/a',
        ipHash: 'h1'.padEnd(64, '0'),
        createdAt: at,
      },
      {
        category: 'ai_crawler',
        name: 'GPTBot',
        operator: 'OpenAI',
        urlPath: '/b',
        ipHash: 'h2'.padEnd(64, '0'),
        createdAt: at,
      },
      {
        category: 'ai_agent',
        name: 'ChatGPT-User',
        operator: 'OpenAI',
        urlPath: '/b',
        createdAt: at,
      },
      {
        category: 'ai_agent',
        name: 'Claude-User',
        operator: 'Anthropic',
        urlPath: '/b',
        createdAt: at,
      },
      {
        category: 'search_crawler',
        name: 'Googlebot',
        operator: 'Google',
        urlPath: '/c',
        createdAt: at,
      },
    ]);

    startAt = Date.now() - DAY_MS;
    endAt = Date.now();
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('stats returns current totals by category plus a previous period', async () => {
    const response = await call(statsGet, 'stats', `startAt=${startAt}&endAt=${endAt}`, ownerKey);

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.current).toEqual({
      events: 6,
      crawlers: 3,
      agents: 2,
      search: 0,
      other: 1,
      distinctClients: 2,
    });
    expect(data.previous.events).toBe(0);
  });

  it('metrics?type=path returns the seeded path breakdown', async () => {
    const response = await call(
      metricsGet,
      'metrics',
      `startAt=${startAt}&endAt=${endAt}&type=path`,
      ownerKey,
    );

    expect(response.status).toBe(200);

    const rows = await response.json();
    const byPath = Object.fromEntries(rows.map((row: any) => [row.x, Number(row.y)]));

    expect(byPath).toEqual({ '/a': 2, '/b': 3, '/c': 1 });
  });

  it('metrics defaults to agent-name breakdown', async () => {
    const response = await call(
      metricsGet,
      'metrics',
      `startAt=${startAt}&endAt=${endAt}`,
      ownerKey,
    );

    expect(response.status).toBe(200);

    const rows = await response.json();
    const byName = Object.fromEntries(rows.map((row: any) => [row.x, Number(row.y)]));

    expect(byName).toEqual({ GPTBot: 3, 'ChatGPT-User': 1, 'Claude-User': 1, Googlebot: 1 });
  });

  it('series returns per-category time buckets that sum to the seed count', async () => {
    const response = await call(
      seriesGet,
      'series',
      `startAt=${startAt}&endAt=${endAt}&unit=hour&timezone=UTC`,
      ownerKey,
    );

    expect(response.status).toBe(200);

    const rows = await response.json();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((sum: number, row: any) => sum + Number(row.count), 0)).toBe(6);

    const categories = new Set(rows.map((row: any) => row.category));

    expect(categories).toEqual(new Set(['ai_crawler', 'ai_agent', 'search_crawler']));
  });

  it('rejects a user without access to the website', async () => {
    for (const [handler, path] of [
      [statsGet, 'stats'],
      [seriesGet, 'series'],
      [metricsGet, 'metrics'],
    ] as const) {
      const response = await call(handler, path, `startAt=${startAt}&endAt=${endAt}`, strangerKey);

      expect(response.status).toBe(401);
    }
  });
});
