// RFD 0004 — OpenAPI spec endpoint; RFD 0009 — AI query endpoint env gating.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as aiQueryPost } from '@/app/api/ai/query/route';
import { GET as openapiGet } from '@/app/api/openapi.json/route';
import prisma from '@/lib/prisma';
import { createTestUser, createTestWebsite, issueApiKey, jsonRequest } from './helpers';

describe('/api/openapi.json', () => {
  it('serves a parseable OpenAPI 3 document that documents /api/collect', async () => {
    const response = await openapiGet();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const spec = JSON.parse(await response.text());

    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths['/api/collect']).toBeDefined();
    expect(spec.paths['/api/collect'].post).toBeDefined();
  });
});

describe('/api/ai/query (no ANTHROPIC_API_KEY)', () => {
  let websiteId: string;
  let ownerKey: string;

  beforeAll(async () => {
    const owner = await createTestUser();
    const website = await createTestWebsite(owner.id);

    websiteId = website.id;
    ownerKey = (await issueApiKey(owner.id)).key;
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await aiQueryPost(
      jsonRequest('http://localhost/api/ai/query', {
        body: { websiteId, question: 'How is traffic this week?' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('returns 404 when the LLM is not configured', async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();

    const response = await aiQueryPost(
      jsonRequest('http://localhost/api/ai/query', {
        body: { websiteId, question: 'How is traffic this week?' },
        bearer: ownerKey,
      }),
    );

    expect(response.status).toBe(404);
  });
});
