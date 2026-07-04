import { handleMcpRequest } from '@/lib/mcp/protocol';
import { parseRequest } from '@/lib/request';

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { status, json: payload } = await handleMcpRequest(auth, body);

  return payload ? Response.json(payload, { status }) : new Response(null, { status });
}

export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
