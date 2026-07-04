import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '@/lib/openapi';

const REPORT_PATHS = [
  '/api/reports/funnel',
  '/api/reports/retention',
  '/api/reports/journey',
  '/api/reports/goal',
  '/api/reports/attribution',
  '/api/reports/utm',
  '/api/reports/revenue',
];

const FORK_PATH_METHODS: [string, string[]][] = [
  ['/api/api-keys', ['get', 'post']],
  ['/api/api-keys/{keyId}', ['delete']],
  ['/api/collect', ['post']],
  ['/api/websites/{websiteId}/agents/stats', ['get']],
  ['/api/websites/{websiteId}/agents/series', ['get']],
  ['/api/websites/{websiteId}/agents/metrics', ['get']],
  ['/api/ai/query', ['post']],
  ['/api/alerts', ['get', 'post']],
  ['/api/alerts/{alertId}', ['get', 'post', 'delete']],
  ['/api/jobs/tick', ['post']],
  ['/api/mcp', ['post']],
];

describe('getOpenApiSpec', () => {
  const spec = getOpenApiSpec();

  it('declares OpenAPI 3.1', () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
  });

  it('documents only /api/ paths', () => {
    const paths = Object.keys(spec.paths);

    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) {
      expect(path.startsWith('/api/')).toBe(true);
    }
  });

  it('round-trips through JSON.stringify', () => {
    const roundTripped = JSON.parse(JSON.stringify(spec));

    expect(roundTripped).toEqual(spec);
  });

  it('defines the bearerAuth security scheme and requires it globally', () => {
    const scheme = spec.components.securitySchemes.bearerAuth;

    expect(scheme).toBeDefined();
    expect(scheme.type).toBe('http');
    expect(scheme.scheme).toBe('bearer');
    expect(spec.security).toEqual([{ bearerAuth: [] }]);
  });

  it.each(REPORT_PATHS)('%s has a POST operation with a requestBody', path => {
    const operation = spec.paths[path]?.post;

    expect(operation).toBeDefined();
    expect(operation.requestBody).toBeDefined();
    expect(operation.requestBody.content['application/json'].schema).toBeDefined();
  });

  it('embeds metric semantics in the description', () => {
    expect(spec.info.description).toContain('SALT_ROTATION');
    expect(spec.info.description).toContain('milliseconds');
    expect(spec.info.description).toContain('30-minute');
  });

  it.each(FORK_PATH_METHODS)('%s documents methods %j', (path, methods) => {
    const operations = spec.paths[path];

    expect(operations).toBeDefined();

    for (const method of methods) {
      expect(operations[method]).toBeDefined();
      expect(operations[method].operationId).toBeTruthy();
      expect(operations[method].responses).toBeDefined();
    }
  });

  it('contains no stub operations', () => {
    const text = JSON.stringify(spec);

    expect(text).not.toContain('STUB');
    expect(text).not.toContain('fork-stubs');
  });

  it('documents both collect response shapes (agent and human)', () => {
    const operation = spec.paths['/api/collect'].post;
    const body = operation.requestBody.content['application/json'].schema;

    expect(body.required).toEqual(['websiteId', 'url', 'userAgent']);

    const response = operation.responses['200'].content['application/json'].schema;

    expect(response.oneOf).toHaveLength(2);
    expect(response.oneOf[0].properties.classified).toBeDefined();
    expect(response.oneOf[1].properties.sessionId).toBeDefined();
    expect(response.oneOf[1].properties.visitId).toBeDefined();
  });

  it('documents the agent metrics type enum', () => {
    const parameters = spec.paths['/api/websites/{websiteId}/agents/metrics'].get.parameters;
    const typeParam = parameters.find((param: any) => param.name === 'type');

    expect(typeParam.schema.enum).toEqual(['name', 'operator', 'path']);
  });

  it('notes that /api/ai/query is gated on ANTHROPIC_API_KEY', () => {
    const operation = spec.paths['/api/ai/query'].post;

    expect(operation.description).toContain('ANTHROPIC_API_KEY');
    expect(operation.responses['404']).toBeDefined();
  });

  it('defines the jobsKey security scheme and applies it to /api/jobs/tick', () => {
    const scheme = spec.components.securitySchemes.jobsKey;

    expect(scheme).toBeDefined();
    expect(scheme.type).toBe('apiKey');
    expect(scheme.in).toBe('header');
    expect(scheme.name).toBe('x-umami-jobs-key');

    const operation = spec.paths['/api/jobs/tick'].post;

    expect(operation.security).toEqual([{ jobsKey: [] }, { bearerAuth: [] }]);
  });

  it('registers the fork component schemas', () => {
    expect(spec.components.schemas.ApiKey).toBeDefined();
    expect(spec.components.schemas.Alert).toBeDefined();
    expect(spec.components.schemas.AlertEvent).toBeDefined();
    expect(spec.components.schemas.AgentTrafficTotals).toBeDefined();
  });
});
