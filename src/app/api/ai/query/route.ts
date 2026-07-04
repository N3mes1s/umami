import { z } from 'zod';
import { aiEnabled } from '@/lib/ai/client';
import { askAnalytics } from '@/lib/ai/query';
import { parseRequest } from '@/lib/request';
import { json, notFound, serverError, unauthorized } from '@/lib/response';
import { canViewAuthenticatedWebsite } from '@/permissions';

const schema = z.object({
  websiteId: z.uuid(),
  question: z.string().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(10)
    .optional(),
});

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  // Env-gated: without ANTHROPIC_API_KEY this endpoint does not exist.
  if (!aiEnabled()) {
    return notFound();
  }

  const { websiteId, question, history } = body;

  // Require an authenticated user or API key; share tokens must not drive the paid AI loop.
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  try {
    return json(await askAnalytics({ auth, websiteId, question, history }));
  } catch (e) {
    return serverError(e);
  }
}
