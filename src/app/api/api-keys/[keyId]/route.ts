import { z } from 'zod';
import { evictApiKeyCache } from '@/lib/api-key';
import { parseRequest } from '@/lib/request';
import { json, notFound } from '@/lib/response';
import { deleteApiKey, getUserApiKey } from '@/queries/prisma';

export async function DELETE(request: Request, { params }: { params: Promise<{ keyId: string }> }) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { keyId } = await params;

  if (!z.uuid().safeParse(keyId).success) {
    return notFound();
  }

  const apiKey = await getUserApiKey(auth.user.id, keyId);

  if (!apiKey) {
    return notFound();
  }

  await deleteApiKey(apiKey.id);
  await evictApiKeyCache(apiKey.keyHash);

  return json({ ok: true });
}
