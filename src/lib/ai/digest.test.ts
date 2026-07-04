import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, test, vi } from 'vitest';
import { composeNarrativeDigest } from '@/lib/ai/digest';

const PLAIN = 'Visitors: 5\nViews: 12\nVisits: 6\nBounce rate: 50%';

function makeClient(create: (...args: any[]) => any) {
  const spy = vi.fn(create);

  return { client: { messages: { create: spy } } as unknown as Anthropic, create: spy };
}

describe('composeNarrativeDigest', () => {
  test('falls back to the plain text when the LLM call throws', async () => {
    const { client } = makeClient(() => Promise.reject(new Error('anthropic is down')));

    await expect(composeNarrativeDigest(PLAIN, 'site-1', 1440, client)).resolves.toBe(PLAIN);
  });

  test('falls back to the plain text when the model returns no text', async () => {
    const { client } = makeClient(() => Promise.resolve({ stop_reason: 'end_turn', content: [] }));

    await expect(composeNarrativeDigest(PLAIN, 'site-1', 1440, client)).resolves.toBe(PLAIN);
  });

  test('returns the narrative and includes the plain digest in the single LLM call', async () => {
    const narrative = 'Traffic held steady: 5 visitors generated 12 views.';
    const { client, create } = makeClient(() =>
      Promise.resolve({ stop_reason: 'end_turn', content: [{ type: 'text', text: narrative }] }),
    );

    await expect(composeNarrativeDigest(PLAIN, 'site-1', 1440, client)).resolves.toBe(narrative);

    expect(create).toHaveBeenCalledTimes(1);

    const params = create.mock.calls[0][0];

    expect(params.tools).toBeUndefined();
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].content).toContain(PLAIN);
    expect(params.messages[0].content).toContain('1440 minutes');
  });
});
