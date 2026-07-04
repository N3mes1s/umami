// RFD 0001 — login, /api/me, API key lifecycle (create → list → use → revoke).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELETE as apiKeyDelete } from '@/app/api/api-keys/[keyId]/route';
import { GET as apiKeysGet, POST as apiKeysPost } from '@/app/api/api-keys/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { GET as meGet } from '@/app/api/me/route';
import { API_KEY_PREFIX } from '@/lib/api-key';
import prisma from '@/lib/prisma';
import { createTestUser, jsonRequest, TEST_PASSWORD, type TestUser } from './helpers';

describe('auth + API keys', () => {
  let user: TestUser;
  let token: string;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('rejects a wrong password', async () => {
    const response = await loginPost(
      jsonRequest('http://localhost/api/auth/login', {
        body: { username: user.username, password: 'wrong-password' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('logs in a seeded user and returns a token', async () => {
    const response = await loginPost(
      jsonRequest('http://localhost/api/auth/login', {
        body: { username: user.username, password: TEST_PASSWORD },
      }),
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.token).toBeTruthy();
    expect(data.user.id).toBe(user.id);

    token = data.token;
  });

  it('GET /api/me works with the JWT and fails without it', async () => {
    const ok = await meGet(
      jsonRequest('http://localhost/api/me', { method: 'GET', bearer: token }),
    );

    expect(ok.status).toBe(200);

    const data = await ok.json();

    expect(data.user.id).toBe(user.id);

    const anonymous = await meGet(jsonRequest('http://localhost/api/me', { method: 'GET' }));

    expect(anonymous.status).toBe(401);
  });

  describe('API key lifecycle', () => {
    let plaintextKey: string;
    let keyId: string;

    it('creates a key and returns the plaintext exactly once', async () => {
      const response = await apiKeysPost(
        jsonRequest('http://localhost/api/api-keys', {
          body: { name: 'integration test key' },
          bearer: token,
        }),
      );

      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.key).toMatch(new RegExp(`^${API_KEY_PREFIX}[0-9a-f]{40}$`));
      expect(data.keyPrefix).toBe(data.key.slice(0, API_KEY_PREFIX.length + 4));
      expect(data.id).toBeTruthy();

      plaintextKey = data.key;
      keyId = data.id;

      // Only the hash is persisted.
      const row = await prisma.client.apiKey.findUnique({ where: { id: keyId } });

      expect(row.keyHash).not.toContain(plaintextKey);
      expect(row.keyHash).toHaveLength(128);
    });

    it('lists keys with prefix only, never hash or plaintext', async () => {
      const response = await apiKeysGet(
        jsonRequest('http://localhost/api/api-keys', { method: 'GET', bearer: token }),
      );

      expect(response.status).toBe(200);

      const list = await response.json();
      const entry = list.find((item: any) => item.id === keyId);

      expect(entry).toBeTruthy();
      expect(entry.keyPrefix).toBe(plaintextKey.slice(0, API_KEY_PREFIX.length + 4));
      expect(entry).not.toHaveProperty('key');
      expect(entry).not.toHaveProperty('keyHash');
    });

    it('accepts the key as a Bearer credential on /api/me', async () => {
      const response = await meGet(
        jsonRequest('http://localhost/api/me', { method: 'GET', bearer: plaintextKey }),
      );

      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.user.id).toBe(user.id);
      expect(data.apiKey.id).toBe(keyId);
    });

    it('revokes the key and the key stops working immediately (no Redis cache)', async () => {
      const response = await apiKeyDelete(
        jsonRequest(`http://localhost/api/api-keys/${keyId}`, { method: 'DELETE', bearer: token }),
        { params: Promise.resolve({ keyId }) },
      );

      expect(response.status).toBe(200);

      const row = await prisma.client.apiKey.findUnique({ where: { id: keyId } });

      expect(row.deletedAt).not.toBeNull();

      const rejected = await meGet(
        jsonRequest('http://localhost/api/me', { method: 'GET', bearer: plaintextKey }),
      );

      expect(rejected.status).toBe(401);
    });
  });
});
