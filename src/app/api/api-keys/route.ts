import { z } from 'zod';
import { generateApiKey } from '@/lib/api-key';
import { uuid } from '@/lib/crypto';
import { parseRequest } from '@/lib/request';
import { json } from '@/lib/response';
import { createApiKey, getUserApiKeys } from '@/queries/prisma';

export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const data = await getUserApiKeys(auth.user.id);

  return json(data);
}

export async function POST(request: Request) {
  const schema = z.object({
    name: z.string().max(100),
    expiresAt: z.coerce.date().optional(),
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { name, expiresAt } = body;
  const { key, keyHash, keyPrefix } = generateApiKey();

  const result = await createApiKey({
    id: uuid(),
    userId: auth.user.id,
    name,
    keyHash,
    keyPrefix,
    expiresAt,
  });

  // The plaintext key is returned exactly once; only its hash is stored.
  return json({
    id: result.id,
    name: result.name,
    keyPrefix: result.keyPrefix,
    expiresAt: result.expiresAt,
    createdAt: result.createdAt,
    key,
  });
}
