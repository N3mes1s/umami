import { z } from 'zod';
import { uuid } from '@/lib/crypto';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';
import { createAlert, getWebsiteAlerts } from '@/queries/prisma/alert';
import { alertSchema, validateAlertParameters } from './schema';

export async function GET(request: Request) {
  const schema = z.object({
    websiteId: z.uuid(),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = query;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const alerts = await getWebsiteAlerts(websiteId);

  return json(alerts);
}

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, alertSchema);

  if (error) {
    return error();
  }

  const { websiteId, name, type, parameters, channels, enabled, intervalMinutes } = body;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const parametersError = validateAlertParameters(type, parameters);

  if (parametersError) {
    return badRequest({ message: parametersError });
  }

  const result = await createAlert({
    id: uuid(),
    websiteId,
    userId: auth.user.id,
    name,
    type,
    parameters,
    channels,
    enabled,
    intervalMinutes,
    nextRunAt: new Date(),
  });

  return json(result);
}
