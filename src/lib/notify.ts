/**
 * Outbound notification delivery for alerts (RFD 0008).
 *
 * Plain fetch, 5s timeout, one retry on network error / 5xx. Never throws.
 */

export interface NotifyChannel {
  type: 'slack' | 'discord' | 'webhook';
  url: string;
}

export interface NotifyMessage {
  title: string;
  body: string;
  url?: string;
  fields?: Array<{ name: string; value: string }>;
}

export interface NotifyResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const FETCH_TIMEOUT_MS = 5000;

/**
 * Basic SSRF hygiene: only http(s), and reject obvious private/loopback
 * address literals. Documented limitation: a public hostname that resolves
 * to a private address (DNS rebinding) is NOT caught here — that would
 * require resolving and pinning the address at request time.
 */
export function isSafeWebhookUrl(url: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // Strip IPv6 brackets; lowercase for comparison.
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }

  return true;
}

/**
 * Pure payload shaping per channel type. Exported for unit tests.
 */
export function buildPayload(
  type: NotifyChannel['type'],
  message: NotifyMessage,
): Record<string, any> {
  const { title, body, url, fields } = message;

  if (type === 'slack') {
    const blocks: Record<string, any>[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: title },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: url ? `${body}\n<${url}>` : body },
      },
    ];

    if (fields?.length) {
      blocks.push({
        type: 'section',
        fields: fields.map(({ name, value }) => ({
          type: 'mrkdwn',
          text: `*${name}*\n${value}`,
        })),
      });
    }

    return { blocks };
  }

  if (type === 'discord') {
    return {
      embeds: [
        {
          title,
          description: body,
          ...(url && { url }),
          ...(fields?.length && {
            fields: fields.map(({ name, value }) => ({ name, value, inline: true })),
          }),
        },
      ],
    };
  }

  // Generic webhook: raw JSON.
  return {
    title,
    body,
    ...(url && { url }),
    fields: fields ?? [],
    timestamp: new Date().toISOString(),
  };
}

async function attempt(url: string, payload: Record<string, any>): Promise<NotifyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, error: `HTTP ${response.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendNotification(
  channel: NotifyChannel,
  message: NotifyMessage,
): Promise<NotifyResult> {
  if (!isSafeWebhookUrl(channel.url)) {
    return { ok: false, error: 'Invalid or unsafe webhook URL' };
  }

  const payload = buildPayload(channel.type, message);

  const first = await attempt(channel.url, payload);

  // One retry on network error (no status) or 5xx; 4xx will not improve.
  if (!first.ok && (first.status === undefined || first.status >= 500)) {
    return attempt(channel.url, payload);
  }

  return first;
}
