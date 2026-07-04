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
});
