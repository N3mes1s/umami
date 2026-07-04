import crypto from 'node:crypto';
import debug from 'debug';
import { ROLES } from '@/lib/constants';
import { hash } from '@/lib/crypto';
import redis from '@/lib/redis';
import { getApiKeyByHash, touchApiKey } from '@/queries/prisma/apiKey';
import { getUser } from '@/queries/prisma/user';

const log = debug('umami:api-key');

export const API_KEY_PREFIX = 'umami_ak_';

// How stale lastUsedAt may get before we write it again (fire-and-forget).
const LAST_USED_THROTTLE_MS = 60_000;

export function generateApiKey() {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(20).toString('hex')}`;

  return {
    key,
    keyHash: hash(key),
    // Enough of the key to recognize it in a list, never enough to use.
    keyPrefix: key.slice(0, API_KEY_PREFIX.length + 4),
  };
}

export function isApiKey(token: string | undefined) {
  return !!token?.startsWith(API_KEY_PREFIX);
}

async function lookupApiKey(token: string) {
  const keyHash = hash(token);

  if (redis.enabled) {
    return redis.client.fetch(`api-key:${keyHash}`, () => getApiKeyByHash(keyHash), 300);
  }

  return getApiKeyByHash(keyHash);
}

export async function evictApiKeyCache(keyHash: string) {
  if (redis.enabled) {
    await redis.client.del(`api-key:${keyHash}`);
  }
}

// Returns the same shape as checkAuth so all downstream permission checks work.
export async function checkApiKeyAuth(token: string) {
  const apiKey = await lookupApiKey(token);

  if (!apiKey || apiKey.deletedAt) {
    log('API key not found');
    return null;
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    log('API key expired');
    return null;
  }

  const user: any = await getUser(apiKey.userId);

  if (!user) {
    log('API key user not found');
    return null;
  }

  const lastUsed = apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).getTime() : 0;

  if (Date.now() - lastUsed > LAST_USED_THROTTLE_MS) {
    touchApiKey(apiKey.id).catch(e => log(e));
  }

  user.isAdmin = user.role === ROLES.admin;

  return {
    token,
    authKey: null,
    shareToken: null,
    apiKey: { id: apiKey.id, name: apiKey.name },
    user,
  };
}
