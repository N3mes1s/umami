import dns from 'node:dns/promises';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { generateApiKey } from '@/lib/api-key';
import { uuid } from '@/lib/crypto';
import { isSafeWebhookUrl } from '@/lib/notify';
import { hashPassword } from '@/lib/password';
import prisma from '@/lib/prisma';
import { createApiKey } from '@/queries/prisma/apiKey';

export const TEST_PASSWORD = 'integration-password-123!';

export interface TestUser {
  id: string;
  username: string;
  password: string;
}

export async function createTestUser(role: string = 'user'): Promise<TestUser> {
  const id = uuid();
  const username = `it-${id.slice(0, 8)}-${Date.now()}`;

  await prisma.client.user.create({
    data: {
      id,
      username,
      password: hashPassword(TEST_PASSWORD),
      role,
    },
  });

  return { id, username, password: TEST_PASSWORD };
}

export async function createTestWebsite(userId: string, name: string = 'Integration site') {
  const id = uuid();

  return prisma.client.website.create({
    data: {
      id,
      name,
      domain: `it-${id.slice(0, 8)}.example.com`,
      userId,
      createdBy: userId,
    },
  });
}

/** Insert an API key row directly (bypasses the route) and return the plaintext key. */
export async function issueApiKey(userId: string, name: string = 'integration-key') {
  const { key, keyHash, keyPrefix } = generateApiKey();

  const record = await createApiKey({
    id: uuid(),
    userId,
    name,
    keyHash,
    keyPrefix,
  });

  return { key, id: record.id, keyHash };
}

export interface JsonRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  bearer?: string;
}

export function jsonRequest(url: string, options: JsonRequestOptions = {}): Request {
  const { method = 'POST', body, headers = {}, bearer } = options;

  return new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(bearer && { authorization: `Bearer ${bearer}` }),
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

/** Log in through the real route and return the JWT. */
export async function loginUser(username: string, password: string): Promise<string> {
  const response = await loginPost(
    jsonRequest('http://localhost/api/auth/login', { body: { username, password } }),
  );

  if (response.status !== 200) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const data = await response.json();

  return data.token;
}

/** Seed a session plus pageview rows (website_event has an FK to session). */
export async function seedHumanTraffic(
  websiteId: string,
  options: { count?: number; startAt?: Date; urlPath?: string } = {},
) {
  const { count = 5, startAt = new Date(Date.now() - 60 * 60 * 1000), urlPath = '/' } = options;
  const sessionId = uuid();
  const visitId = uuid();

  await prisma.client.session.create({
    data: { id: sessionId, websiteId, browser: 'chrome', os: 'Linux', device: 'desktop' },
  });

  for (let i = 0; i < count; i++) {
    await prisma.client.websiteEvent.create({
      data: {
        id: uuid(),
        websiteId,
        sessionId,
        visitId,
        urlPath: i === 0 ? urlPath : `${urlPath === '/' ? '' : urlPath}/page-${i}`,
        eventType: 1,
        createdAt: new Date(startAt.getTime() + i * 60 * 1000),
      },
    });
  }

  return { sessionId, visitId };
}

export interface AgentEventSeed {
  category: string;
  name: string;
  operator?: string;
  urlPath: string;
  ipHash?: string;
  createdAt?: Date;
}

export async function seedAgentEvents(websiteId: string, rows: AgentEventSeed[]) {
  await prisma.client.agentEvent.createMany({
    data: rows.map(row => ({
      id: uuid(),
      websiteId,
      category: row.category,
      name: row.name,
      operator: row.operator ?? null,
      urlPath: row.urlPath,
      hostname: 'example.com',
      ipHash: row.ipHash ?? null,
      createdAt: row.createdAt ?? new Date(Date.now() - 60 * 60 * 1000),
    })),
  });
}

export interface CapturedWebhookRequest {
  headers: Record<string, string>;
  body: any;
  rawBody: string;
}

export interface WebhookReceiver {
  /** URL that passes isSafeWebhookUrl but resolves to this machine, or null. */
  url: string | null;
  port: number;
  requests: CapturedWebhookRequest[];
  close: () => Promise<void>;
}

/**
 * Local webhook receiver for testing real alert delivery.
 *
 * sendNotification refuses loopback literals (SSRF guard), so the receiver is
 * addressed via the machine's hostname (e.g. http://myhost:PORT/hook), which
 * passes the string-based isSafeWebhookUrl check yet resolves locally through
 * /etc/hosts or nss-myhostname. If no such alias resolves, `url` is null and
 * callers should skip delivery-content assertions.
 */
export async function startWebhookReceiver(): Promise<WebhookReceiver> {
  const requests: CapturedWebhookRequest[] = [];

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      let body: any;

      try {
        body = JSON.parse(rawBody);
      } catch {
        body = undefined;
      }

      requests.push({ headers: { ...(req.headers as Record<string, string>) }, body, rawBody });

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  let url: string | null = null;
  const hostname = os.hostname();

  if (isSafeWebhookUrl(`http://${hostname}:${port}/hook`)) {
    try {
      // Any address of this machine works: the server listens on 0.0.0.0.
      await dns.lookup(hostname);
      url = `http://${hostname}:${port}/hook`;
    } catch {
      url = null;
    }
  }

  return {
    url,
    port,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}
