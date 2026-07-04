import { describe, expect, test } from 'vitest';
import { buildPayload, isSafeWebhookUrl } from './notify';

describe('isSafeWebhookUrl', () => {
  test('allows public https urls', () => {
    expect(isSafeWebhookUrl('https://hooks.slack.com/services/T000/B000/XXXX')).toBe(true);
    expect(isSafeWebhookUrl('https://discord.com/api/webhooks/123/abc')).toBe(true);
    expect(isSafeWebhookUrl('http://example.com/hook')).toBe(true);
  });

  test('rejects non-http protocols and malformed urls', () => {
    expect(isSafeWebhookUrl('ftp://example.com/hook')).toBe(false);
    expect(isSafeWebhookUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeWebhookUrl('not a url')).toBe(false);
    expect(isSafeWebhookUrl('')).toBe(false);
  });

  test('rejects loopback addresses', () => {
    expect(isSafeWebhookUrl('http://localhost/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://localhost:3000/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://sub.localhost/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://127.0.0.1/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://127.1.2.3/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://[::1]/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://0.0.0.0/hook')).toBe(false);
  });

  test('rejects private ranges', () => {
    expect(isSafeWebhookUrl('http://10.0.0.5/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://192.168.1.1/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafeWebhookUrl('http://172.16.0.1/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://172.31.255.255/hook')).toBe(false);
  });

  test('allows public addresses adjacent to private ranges', () => {
    expect(isSafeWebhookUrl('http://172.15.0.1/hook')).toBe(true);
    expect(isSafeWebhookUrl('http://172.32.0.1/hook')).toBe(true);
    expect(isSafeWebhookUrl('http://11.0.0.1/hook')).toBe(true);
    expect(isSafeWebhookUrl('http://192.169.0.1/hook')).toBe(true);
  });

  test('blocks IPv6-mapped IPv4 loopback/link-local (SSRF)', () => {
    expect(isSafeWebhookUrl('http://[::ffff:127.0.0.1]/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://[::ffff:169.254.169.254]/meta')).toBe(false);
    expect(isSafeWebhookUrl('http://[::ffff:10.0.0.1]/hook')).toBe(false);
  });

  test('blocks numeric IPv4 encodings that normalize to loopback (SSRF)', () => {
    // new URL() normalizes these to 127.0.0.1 before the range check sees them.
    expect(isSafeWebhookUrl('http://2130706433/hook')).toBe(false);
    expect(isSafeWebhookUrl('http://0x7f000001/hook')).toBe(false);
  });

  test('blocks other reserved ranges', () => {
    expect(isSafeWebhookUrl('http://100.64.0.1/hook')).toBe(false); // carrier-grade NAT
    expect(isSafeWebhookUrl('http://[fc00::1]/hook')).toBe(false); // unique-local IPv6
    expect(isSafeWebhookUrl('http://[fe80::1]/hook')).toBe(false); // link-local IPv6
  });

  test('blocks internal service-discovery hostnames (SSRF into private network)', () => {
    expect(isSafeWebhookUrl('http://postgres.railway.internal:5432/')).toBe(false);
    expect(isSafeWebhookUrl('http://umami.railway.internal/api')).toBe(false);
    expect(isSafeWebhookUrl('http://anything.internal/x')).toBe(false);
    expect(isSafeWebhookUrl('http://printer.local/x')).toBe(false);
    expect(isSafeWebhookUrl('http://metadata.google.internal/computeMetadata/v1/')).toBe(false);
    expect(isSafeWebhookUrl('http://metadata/latest/meta-data/')).toBe(false);
  });

  test('still allows legitimate public hostnames', () => {
    expect(isSafeWebhookUrl('https://hooks.slack.com/services/x')).toBe(true);
    expect(isSafeWebhookUrl('https://example.com/webhook')).toBe(true);
    expect(isSafeWebhookUrl('https://internal.example.com/x')).toBe(true); // "internal" as a subdomain label, not the .internal TLD
  });
});

describe('buildPayload', () => {
  const message = {
    title: 'Traffic spike',
    body: 'visitors was 250 over the last 60 minutes (> 100)',
    fields: [
      { name: 'visitors', value: '250' },
      { name: 'Condition', value: '> 100' },
    ],
  };

  test('slack payload uses blocks with header, mrkdwn body and fields', () => {
    const payload = buildPayload('slack', message);

    expect(payload.blocks).toHaveLength(3);
    expect(payload.blocks[0]).toEqual({
      type: 'header',
      text: { type: 'plain_text', text: 'Traffic spike' },
    });
    expect(payload.blocks[1]).toEqual({
      type: 'section',
      text: { type: 'mrkdwn', text: message.body },
    });
    expect(payload.blocks[2].type).toBe('section');
    expect(payload.blocks[2].fields).toEqual([
      { type: 'mrkdwn', text: '*visitors*\n250' },
      { type: 'mrkdwn', text: '*Condition*\n> 100' },
    ]);
  });

  test('slack payload appends link when message.url is set', () => {
    const payload = buildPayload('slack', { ...message, url: 'https://example.com/site' });

    expect(payload.blocks[1].text.text).toContain('<https://example.com/site>');
  });

  test('slack payload omits fields block when there are no fields', () => {
    const payload = buildPayload('slack', { title: 't', body: 'b' });

    expect(payload.blocks).toHaveLength(2);
  });

  test('discord payload uses embeds', () => {
    const payload = buildPayload('discord', message);

    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].title).toBe('Traffic spike');
    expect(payload.embeds[0].description).toBe(message.body);
    expect(payload.embeds[0].fields).toEqual([
      { name: 'visitors', value: '250', inline: true },
      { name: 'Condition', value: '> 100', inline: true },
    ]);
    expect(payload.embeds[0].url).toBeUndefined();
  });

  test('discord payload sets embed url when message.url is set', () => {
    const payload = buildPayload('discord', { ...message, url: 'https://example.com/site' });

    expect(payload.embeds[0].url).toBe('https://example.com/site');
  });

  test('generic webhook payload is raw json with timestamp', () => {
    const payload = buildPayload('webhook', message);

    expect(payload.title).toBe('Traffic spike');
    expect(payload.body).toBe(message.body);
    expect(payload.fields).toEqual(message.fields);
    expect(typeof payload.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  test('generic webhook payload defaults fields to empty array', () => {
    const payload = buildPayload('webhook', { title: 't', body: 'b' });

    expect(payload.fields).toEqual([]);
  });
});
