import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, ok, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';
import { deleteAlert, getAlert, getAlertEvents, updateAlert } from '@/queries/prisma/alert';
import { alertUpdateSchema, validateAlertParameters } from '../schema';

export async function GET(request: Request, { params }: { params: Promise<{ alertId: string }> }) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { alertId } = await params;

  const alert = await getAlert(alertId);

  if (!alert) {
    return notFound();
  }

  if (!(await canViewWebsite(auth, alert.websiteId))) {
    return unauthorized();
  }

  const events = await getAlertEvents(alertId, 50);

  return json({ ...alert, events });
}

export async function POST(request: Request, { params }: { params: Promise<{ alertId: string }> }) {
  const { auth, body, error } = await parseRequest(request, alertUpdateSchema);

  if (error) {
    return error();
  }

  const { alertId } = await params;

  const alert = await getAlert(alertId);

  if (!alert) {
    return notFound();
  }

  if (!(await canUpdateWebsite(auth, alert.websiteId))) {
    return unauthorized();
  }

  const { name, type, parameters, channels, enabled, intervalMinutes } = body;

  const nextType = (type ?? alert.type) as any;
  const nextParameters = (parameters ?? alert.parameters) as Record<string, any>;
  const parametersError = validateAlertParameters(nextType, nextParameters);

  if (parametersError) {
    return badRequest({ message: parametersError });
  }

  const result = await updateAlert(alertId, {
    ...(name !== undefined && { name }),
    ...(type !== undefined && { type }),
    ...(parameters !== undefined && { parameters }),
    ...(channels !== undefined && { channels }),
    ...(enabled !== undefined && { enabled }),
    ...(intervalMinutes !== undefined && { intervalMinutes }),
    // Reschedule so edits take effect on the next tick.
    nextRunAt: new Date(),
  });

  return json(result);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { alertId } = await params;

  const alert = await getAlert(alertId);

  if (!alert) {
    return notFound();
  }

  if (!(await canUpdateWebsite(auth, alert.websiteId))) {
    return unauthorized();
  }

  await deleteAlert(alertId);

  return ok();
}
