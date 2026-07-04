// RFD 0008 — alert CRUD (with SSRF guard), the jobs runner tick, real webhook
// delivery to a local receiver, and the re-delivery cooldown.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as alertsGet, POST as alertsPost } from '@/app/api/alerts/route';
import { POST as tickPost } from '@/app/api/jobs/tick/route';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import {
  createTestUser,
  createTestWebsite,
  jsonRequest,
  loginUser,
  seedHumanTraffic,
  startWebhookReceiver,
  TEST_PASSWORD,
  type TestUser,
  type WebhookReceiver,
} from './helpers';

const JOBS_KEY_HEADER = 'x-umami-jobs-key';

describe('alerts + jobs runner', () => {
  let user: TestUser;
  let token: string;
  let websiteId: string;
  let receiver: WebhookReceiver;
  const createdAlertIds: string[] = [];

  beforeAll(async () => {
    user = await createTestUser();
    token = await loginUser(user.username, TEST_PASSWORD);

    const website = await createTestWebsite(user.id);

    websiteId = website.id;

    // Traffic inside the threshold window so 'visitors gt 0' triggers.
    await seedHumanTraffic(websiteId, { count: 3, startAt: new Date(Date.now() - 10 * 60 * 1000) });

    receiver = await startWebhookReceiver();
  });

  afterAll(async () => {
    // Keep the shared database quiet for later runs: never leave enabled
    // alerts pointing at ports that will be dead tomorrow.
    if (createdAlertIds.length) {
      await prisma.client.alert.updateMany({
        where: { id: { in: createdAlertIds } },
        data: { enabled: false },
      });
    }

    await receiver.close();
    await prisma.client.$disconnect();
  });

  it('rejects a loopback webhook URL on create (SSRF guard)', async () => {
    const response = await alertsPost(
      jsonRequest('http://localhost/api/alerts', {
        bearer: token,
        body: {
          websiteId,
          name: 'Loopback alert',
          type: 'threshold',
          parameters: { metric: 'visitors', operator: 'gt', value: 0, windowMinutes: 600 },
          channels: [{ type: 'webhook', url: `http://127.0.0.1:${receiver.port}/hook` }],
          intervalMinutes: 5,
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('creates and lists an alert with a public webhook URL', async () => {
    const response = await alertsPost(
      jsonRequest('http://localhost/api/alerts', {
        bearer: token,
        body: {
          websiteId,
          name: 'Public alert',
          type: 'threshold',
          parameters: { metric: 'visitors', operator: 'gt', value: 0, windowMinutes: 600 },
          channels: [{ type: 'webhook', url: 'https://hooks.example.com/services/abc' }],
          intervalMinutes: 5,
          // Disabled so the tick below never actually calls example.com.
          enabled: false,
        },
      }),
    );

    expect(response.status).toBe(200);

    const created = await response.json();

    expect(created.id).toBeTruthy();
    expect(created.nextRunAt).toBeTruthy();
    createdAlertIds.push(created.id);

    const listResponse = await alertsGet(
      jsonRequest(`http://localhost/api/alerts?websiteId=${websiteId}`, {
        method: 'GET',
        bearer: token,
      }),
    );

    expect(listResponse.status).toBe(200);

    const list = await listResponse.json();

    expect(list.map((alert: any) => alert.id)).toContain(created.id);
  });

  it("rejects an alert create for another user's website", async () => {
    const stranger = await createTestUser();
    const strangerToken = await loginUser(stranger.username, TEST_PASSWORD);

    const response = await alertsPost(
      jsonRequest('http://localhost/api/alerts', {
        bearer: strangerToken,
        body: {
          websiteId,
          name: 'Not my website',
          type: 'threshold',
          parameters: { metric: 'visitors', operator: 'gt', value: 0, windowMinutes: 600 },
          channels: [{ type: 'webhook', url: 'https://hooks.example.com/services/xyz' }],
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  describe('jobs tick + webhook delivery', () => {
    let alertId: string;
    const alertName = `Visitors spike ${Date.now()}`;

    it('rejects a tick without the jobs key', async () => {
      const response = await tickPost(
        jsonRequest('http://localhost/api/jobs/tick', { method: 'POST' }),
      );

      expect(response.status).toBe(401);
    });

    it('rejects a tick with the wrong jobs key', async () => {
      const response = await tickPost(
        jsonRequest('http://localhost/api/jobs/tick', {
          method: 'POST',
          headers: { [JOBS_KEY_HEADER]: 'wrong-key' },
        }),
      );

      expect(response.status).toBe(401);
    });

    it('runs a due alert and delivers to the local webhook receiver', async () => {
      // isSafeWebhookUrl (correctly) refuses loopback literals, so the alert
      // row is inserted directly with a hostname alias of this machine; the
      // API-level rejection is covered above.
      if (!receiver.url) {
        throw new Error(
          'No non-loopback alias for this machine resolved (os.hostname()); cannot test delivery',
        );
      }

      alertId = uuid();
      createdAlertIds.push(alertId);

      await prisma.client.alert.create({
        data: {
          id: alertId,
          websiteId,
          userId: user.id,
          name: alertName,
          type: 'threshold',
          parameters: { metric: 'visitors', operator: 'gt', value: 0, windowMinutes: 600 },
          channels: [{ type: 'webhook', url: receiver.url }],
          enabled: true,
          intervalMinutes: 5,
          nextRunAt: new Date(Date.now() - 1000),
        },
      });

      const response = await tickPost(
        jsonRequest('http://localhost/api/jobs/tick', {
          method: 'POST',
          headers: { [JOBS_KEY_HEADER]: process.env.JOBS_KEY },
        }),
      );

      expect(response.status).toBe(200);

      const result = await response.json();

      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.triggered).toBeGreaterThanOrEqual(1);

      // Delivery is awaited inside the tick, so the receiver has it by now.
      const hits = receiver.requests.filter(request => request.body?.title === alertName);

      expect(hits).toHaveLength(1);
      expect(hits[0].body.body).toContain('visitors');
      expect(hits[0].headers['content-type']).toBe('application/json');

      const alertEvents = await prisma.client.alertEvent.findMany({ where: { alertId } });

      expect(alertEvents).toHaveLength(1);
      expect(alertEvents[0].status).toBe('triggered');

      const payload = alertEvents[0].payload as any;

      expect(payload.title).toBe(alertName);
      expect(payload.deliveries[0]).toMatchObject({ type: 'webhook', ok: true, status: 200 });

      // Rescheduled into the future with the trigger recorded.
      const alertRow = await prisma.client.alert.findUnique({ where: { id: alertId } });

      expect(alertRow.nextRunAt.getTime()).toBeGreaterThan(Date.now());
      expect(alertRow.lastTriggeredAt).not.toBeNull();
    });

    it('does not re-deliver on an immediate second tick (nextRunAt in the future)', async () => {
      const response = await tickPost(
        jsonRequest('http://localhost/api/jobs/tick', {
          method: 'POST',
          headers: { [JOBS_KEY_HEADER]: process.env.JOBS_KEY },
        }),
      );

      expect(response.status).toBe(200);

      const hits = receiver.requests.filter(request => request.body?.title === alertName);

      expect(hits).toHaveLength(1);
      expect(await prisma.client.alertEvent.count({ where: { alertId } })).toBe(1);
    });
  });
});
