// RFD 0002 + RFD 0006 — /api/send agent capture and the authenticated
// /api/collect server-side collection endpoint.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as collectPost } from '@/app/api/collect/route';
import { POST as sendPost } from '@/app/api/send/route';
import prisma from '@/lib/prisma';
import { createTestUser, createTestWebsite, issueApiKey, jsonRequest } from './helpers';

const GPTBOT_UA =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot';
const CLAUDEBOT_UA =
  'Mozilla/5.0 AppleWebKit/537.36 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('/api/send (public) + /api/collect (RFD 0006)', () => {
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
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  describe('/api/send', () => {
    it('classifies a GPTBot hit into agent_event instead of dropping it', async () => {
      const response = await sendPost(
        jsonRequest('http://localhost/api/send', {
          body: {
            type: 'event',
            payload: { website: websiteId, url: '/docs/quickstart', hostname: 'example.com' },
          },
          headers: {
            'user-agent': GPTBOT_UA,
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ beep: 'boop' });

      const rows = await prisma.client.agentEvent.findMany({ where: { websiteId } });

      expect(rows).toHaveLength(1);
      expect(rows[0].category).toBe('ai_crawler');
      expect(rows[0].name).toBe('GPTBot');
      expect(rows[0].operator).toBe('OpenAI');
      expect(rows[0].urlPath).toBe('/docs/quickstart');

      // No session/event leaked into the human pipeline.
      expect(await prisma.client.websiteEvent.count({ where: { websiteId } })).toBe(0);
    });

    it('sends a human Chrome hit through the normal session/event pipeline', async () => {
      const response = await sendPost(
        jsonRequest('http://localhost/api/send', {
          body: {
            type: 'event',
            payload: { website: websiteId, url: '/pricing', hostname: 'example.com' },
          },
          headers: {
            'user-agent': CHROME_UA,
            'x-forwarded-for': '203.0.113.10',
          },
        }),
      );

      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.sessionId).toBeTruthy();
      expect(data.visitId).toBeTruthy();
      expect(data.cache).toBeTruthy();

      const session = await prisma.client.session.findUnique({ where: { id: data.sessionId } });

      expect(session).toBeTruthy();
      expect(session.websiteId).toBe(websiteId);

      const events = await prisma.client.websiteEvent.findMany({ where: { websiteId } });

      expect(events).toHaveLength(1);
      expect(events[0].urlPath).toBe('/pricing');
      expect(events[0].sessionId).toBe(data.sessionId);

      // Still only the GPTBot agent event from the previous test.
      expect(await prisma.client.agentEvent.count({ where: { websiteId } })).toBe(1);
    });
  });

  describe('/api/collect', () => {
    const collect = (body: Record<string, unknown>, bearer?: string) =>
      collectPost(jsonRequest('http://localhost/api/collect', { body, bearer }));

    it('rejects unauthenticated requests', async () => {
      const response = await collect({
        websiteId,
        url: '/llms.txt',
        userAgent: CLAUDEBOT_UA,
      });

      expect(response.status).toBe(401);
    });

    it('rejects an API key without access to the website', async () => {
      const response = await collect(
        { websiteId, url: '/llms.txt', userAgent: CLAUDEBOT_UA },
        strangerKey,
      );

      expect(response.status).toBe(401);
    });

    it('records a ClaudeBot hit as an agent_event', async () => {
      const response = await collect(
        {
          websiteId,
          url: '/llms.txt',
          hostname: 'example.com',
          userAgent: CLAUDEBOT_UA,
        },
        ownerKey,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, classified: 'ai_crawler' });

      const row = await prisma.client.agentEvent.findFirst({
        where: { websiteId, name: 'ClaudeBot' },
      });

      expect(row).toBeTruthy();
      expect(row.category).toBe('ai_crawler');
      expect(row.operator).toBe('Anthropic');
      expect(row.urlPath).toBe('/llms.txt');
    });

    it('records a human hit as a website_event with the correct url_path', async () => {
      const response = await collect(
        {
          websiteId,
          url: '/docs/api',
          hostname: 'example.com',
          userAgent: CHROME_UA,
          ip: '203.0.113.8',
        },
        ownerKey,
      );

      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.sessionId).toBeTruthy();

      const event = await prisma.client.websiteEvent.findFirst({
        where: { websiteId, urlPath: '/docs/api' },
      });

      expect(event).toBeTruthy();
      expect(event.sessionId).toBe(data.sessionId);
      expect(event.hostname).toBe('example.com');
    });

    it('rejects an invalid ip', async () => {
      const response = await collect(
        { websiteId, url: '/x', userAgent: CHROME_UA, ip: 'not-an-ip' },
        ownerKey,
      );

      expect(response.status).toBe(400);
    });

    it('rejects a timestamp older than 30 days', async () => {
      const response = await collect(
        {
          websiteId,
          url: '/x',
          userAgent: CHROME_UA,
          timestamp: Math.floor((Date.now() - 31 * 24 * 60 * 60 * 1000) / 1000),
        },
        ownerKey,
      );

      expect(response.status).toBe(400);
    });
  });

  // Regression coverage for the ip_hash length bug: hash() is 128-char sha512
  // hex but agent_event.ip_hash is varchar(64); recordAgentEvent now truncates
  // to 64 chars before insert.
  describe('agent hits with a client IP', () => {
    it('send: persists an agent_event with a salted ip hash', async () => {
      const response = await sendPost(
        jsonRequest('http://localhost/api/send', {
          body: {
            type: 'event',
            payload: { website: websiteId, url: '/bug/ip-hash-send', hostname: 'example.com' },
          },
          headers: {
            'user-agent': GPTBOT_UA,
            'x-forwarded-for': '203.0.113.9',
          },
        }),
      );

      expect(response.status).toBe(200);

      const row = await prisma.client.agentEvent.findFirst({
        where: { websiteId, urlPath: '/bug/ip-hash-send' },
      });

      expect(row).toBeTruthy();
      expect(row.ipHash).toBeTruthy();
    });

    it('collect: accepts an agent hit that includes an ip', async () => {
      const response = await collectPost(
        jsonRequest('http://localhost/api/collect', {
          body: {
            websiteId,
            url: '/bug/ip-hash-collect',
            hostname: 'example.com',
            userAgent: CLAUDEBOT_UA,
            ip: '203.0.113.7',
          },
          bearer: ownerKey,
        }),
      );

      expect(response.status).toBe(200);

      const row = await prisma.client.agentEvent.findFirst({
        where: { websiteId, urlPath: '/bug/ip-hash-collect' },
      });

      expect(row).toBeTruthy();
      expect(row.ipHash).toBeTruthy();
    });
  });
});
