// RFD 0005 — in-app MCP server over stateless Streamable HTTP JSON-RPC.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as mcpPost } from '@/app/api/mcp/route';
import prisma from '@/lib/prisma';
import {
  createTestUser,
  createTestWebsite,
  issueApiKey,
  jsonRequest,
  seedHumanTraffic,
} from './helpers';

const SEEDED_PAGEVIEWS = 5;

function rpc(body: Record<string, unknown>, bearer?: string) {
  return mcpPost(jsonRequest('http://localhost/api/mcp', { body, bearer }));
}

describe('/api/mcp', () => {
  let websiteId: string;
  let ownerKey: string;
  let strangerKey: string;

  beforeAll(async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const website = await createTestWebsite(owner.id);

    websiteId = website.id;
    ownerKey = (await issueApiKey(owner.id)).key;
    strangerKey = (await issueApiKey(stranger.id)).key;

    // Known events inside the '7d' range (single session, single visit).
    await seedHumanTraffic(websiteId, {
      count: SEEDED_PAGEVIEWS,
      startAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

    expect(response.status).toBe(401);
  });

  it('initialize returns protocolVersion and serverInfo', async () => {
    const response = await rpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      ownerKey,
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);
    expect(data.result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.result.serverInfo.name).toBe('umami-mcp');
    expect(data.result.capabilities.tools).toBeDefined();
  });

  it('tools/list includes get_website_stats and get_agent_traffic with JSON-schema inputs', async () => {
    const response = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ownerKey);

    expect(response.status).toBe(200);

    const data = await response.json();
    const tools = data.result.tools;
    const names = tools.map((tool: any) => tool.name);

    expect(names).toContain('get_website_stats');
    expect(names).toContain('get_agent_traffic');
    expect(names).toContain('list_websites');

    for (const name of ['get_website_stats', 'get_agent_traffic']) {
      const tool = tools.find((entry: any) => entry.name === name);

      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties.websiteId).toBeDefined();
    }
  });

  it('tools/call get_website_stats returns current/previous over the seeded events', async () => {
    const response = await rpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_website_stats', arguments: { websiteId, range: '7d' } },
      },
      ownerKey,
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.result.isError).toBeUndefined();
    expect(data.result.content[0].type).toBe('text');

    const payload = JSON.parse(data.result.content[0].text);

    expect(payload.range_echo).toBeTruthy();
    expect(payload.current.pageviews).toBe(SEEDED_PAGEVIEWS);
    expect(payload.current.visitors).toBe(1);
    expect(payload.current.visits).toBe(1);
    expect(payload.previous.pageviews).toBe(0);
  });

  it("tools/call against another user's website is an access-denied tool error", async () => {
    const response = await rpc(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_website_stats', arguments: { websiteId, range: '7d' } },
      },
      strangerKey,
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toMatch(/access denied/i);
  });

  it('unknown methods return -32601', async () => {
    const response = await rpc({ jsonrpc: '2.0', id: 5, method: 'resources/list' }, ownerKey);

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.error.code).toBe(-32601);
  });
});
