import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

export async function getApiKeyByHash(keyHash: string) {
  return prisma.client.apiKey.findFirst({
    where: { keyHash, deletedAt: null },
  });
}

export async function getUserApiKeys(userId: string) {
  return prisma.client.apiKey.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUserApiKey(userId: string, apiKeyId: string) {
  return prisma.client.apiKey.findFirst({
    where: { id: apiKeyId, userId, deletedAt: null },
  });
}

export async function createApiKey(data: Prisma.ApiKeyUncheckedCreateInput) {
  return prisma.client.apiKey.create({ data });
}

export async function touchApiKey(apiKeyId: string) {
  return prisma.client.apiKey.update({
    where: { id: apiKeyId },
    data: { lastUsedAt: new Date() },
  });
}

export async function deleteApiKey(apiKeyId: string) {
  return prisma.client.apiKey.update({
    where: { id: apiKeyId },
    data: { deletedAt: new Date() },
  });
}
