import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

export async function getAlert(alertId: string) {
  return prisma.client.alert.findFirst({
    where: { id: alertId, deletedAt: null },
  });
}

export async function getWebsiteAlerts(websiteId: string) {
  return prisma.client.alert.findMany({
    where: { websiteId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createAlert(data: Prisma.AlertUncheckedCreateInput) {
  return prisma.client.alert.create({ data });
}

export async function updateAlert(alertId: string, data: Prisma.AlertUncheckedUpdateInput) {
  return prisma.client.alert.update({
    where: { id: alertId },
    data,
  });
}

export async function deleteAlert(alertId: string) {
  return prisma.client.alert.update({
    where: { id: alertId },
    data: { deletedAt: new Date() },
  });
}

export async function getDueAlerts(limit: number) {
  return prisma.client.alert.findMany({
    where: {
      enabled: true,
      deletedAt: null,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
    },
    orderBy: { nextRunAt: 'asc' },
    take: limit,
  });
}

export async function createAlertEvent(data: Prisma.AlertEventUncheckedCreateInput) {
  return prisma.client.alertEvent.create({ data });
}

export async function getAlertEvents(alertId: string, limit: number = 50) {
  return prisma.client.alertEvent.findMany({
    where: { alertId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Distinct agent names observed for a website since a given time.
 * Used by the 'new-agent' alert type (RFD 0008).
 */
export async function getRecentAgentNames(websiteId: string, since: Date): Promise<string[]> {
  const rows = await prisma.client.agentEvent.findMany({
    where: { websiteId, name: { not: null }, createdAt: { gte: since } },
    select: { name: true },
    distinct: ['name'],
  });

  return rows.map(({ name }) => name).filter(name => !!name);
}

/**
 * Whether an agent name was ever seen for a website before a given time.
 * Used to decide if a name observed in the current window is genuinely new.
 */
export async function hasSeenAgentName(
  websiteId: string,
  name: string,
  before: Date,
): Promise<boolean> {
  const event = await prisma.client.agentEvent.findFirst({
    where: { websiteId, name, createdAt: { lt: before } },
    select: { id: true },
  });

  return !!event;
}
