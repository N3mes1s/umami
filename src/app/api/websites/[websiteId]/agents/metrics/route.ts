import { z } from 'zod';
import { getRequestDateRange, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canViewWebsite } from '@/permissions';
import { getAgentMetrics } from '@/queries/sql/agents/getAgentMetrics';

// Fork (RFD 0007): top agent names, operators or fetched pages.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    startAt: z.coerce.number().int(),
    endAt: z.coerce.number().int(),
    type: z.enum(['name', 'operator', 'path']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const { startDate, endDate } = getRequestDateRange(query);
  const { type = 'name', limit = 20 } = query;

  return json(await getAgentMetrics(websiteId, { startDate, endDate }, type, limit));
}
