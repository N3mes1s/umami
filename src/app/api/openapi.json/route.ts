import { getOpenApiSpec } from '@/lib/openapi';

export async function GET() {
  // Public route: the spec describes the API but leaks no data; every
  // documented endpoint still requires its own auth.
  return new Response(JSON.stringify(getOpenApiSpec()), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
