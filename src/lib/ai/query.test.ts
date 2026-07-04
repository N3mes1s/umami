import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { askAnalytics, MAX_TOOL_ROUNDS } from '@/lib/ai/query';
import { getAnalyticsTools, MAX_TOOL_RESULT_CHARS, TRUNCATION_MARKER } from '@/lib/ai/tools';

const mocks = vi.hoisted(() => ({
  statsExecute: vi.fn(),
  bigExecute: vi.fn(),
}));

// Replace the MCP registry with fake tools so no query layer is pulled in.
vi.mock('@/lib/mcp/tools', async () => {
  const { z } = await import('zod');

  return {
    mcpTools: [
      {
        name: 'list_websites',
        description: 'List websites',
        inputSchema: z.object({}),
        execute: vi.fn(),
      },
      {
        name: 'get_website_stats',
        description: 'Get stats',
        inputSchema: z.object({
          websiteId: z.string(),
          range: z.string().default('7d'),
        }),
        execute: mocks.statsExecute,
      },
      {
        name: 'get_big_result',
        description: 'Returns a big result',
        inputSchema: z.object({ websiteId: z.string() }),
        execute: mocks.bigExecute,
      },
    ],
  };
});

const auth: any = { user: { id: 'user-1' } };

const textBlock = (text: string) => ({ type: 'text', text });
const thinkingBlock = () => ({ type: 'thinking', thinking: '', signature: 'sig' });
const toolUseBlock = (id: string, name: string, input: any) => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const endTurn = (...content: any[]) => ({ stop_reason: 'end_turn', content });
const toolTurn = (...content: any[]) => ({ stop_reason: 'tool_use', content });

function makeClient(responses: any[]) {
  const create = vi.fn(async (_params: any) => {
    const next = responses.shift();

    if (!next) {
      throw new Error('Fake client ran out of responses');
    }

    return next;
  });

  return { client: { messages: { create } } as unknown as Anthropic, create };
}

beforeEach(() => {
  mocks.statsExecute.mockReset();
  mocks.bigExecute.mockReset();
});

describe('getAnalyticsTools', () => {
  test('excludes list_websites and exposes JSON Schema tool definitions', () => {
    const { definitions } = getAnalyticsTools(auth, 'site-1');

    expect(definitions.map(({ name }) => name)).toEqual(['get_website_stats', 'get_big_result']);
    expect(definitions[0].input_schema.type).toBe('object');
    expect(definitions[0].input_schema.properties).toHaveProperty('websiteId');
  });

  test('forces websiteId on every execute call, ignoring model-supplied values', async () => {
    mocks.statsExecute.mockResolvedValue({ pageviews: 1 });

    const { execute } = getAnalyticsTools(auth, 'site-1');

    await execute('get_website_stats', { websiteId: 'other-site', range: '30d' });

    expect(mocks.statsExecute).toHaveBeenCalledTimes(1);
    expect(mocks.statsExecute.mock.calls[0][0]).toBe(auth);
    expect(mocks.statsExecute.mock.calls[0][1]).toEqual({ websiteId: 'site-1', range: '30d' });
  });

  test('rejects unknown tools', async () => {
    const { execute } = getAnalyticsTools(auth, 'site-1');

    await expect(execute('list_websites', {})).rejects.toThrow('Unknown tool: list_websites');
    await expect(execute('nope', {})).rejects.toThrow('Unknown tool: nope');
  });

  test('truncates oversized tool results with a marker', async () => {
    mocks.bigExecute.mockResolvedValue({ data: 'x'.repeat(MAX_TOOL_RESULT_CHARS * 3) });

    const { execute } = getAnalyticsTools(auth, 'site-1');
    const result = await execute('get_big_result', {});

    expect(result.length).toBe(MAX_TOOL_RESULT_CHARS);
    expect(result.endsWith(TRUNCATION_MARKER)).toBe(true);
  });
});

describe('askAnalytics', () => {
  test('tool_use round-trip appends assistant content and ONE user message with ALL tool results', async () => {
    mocks.statsExecute.mockResolvedValue({ pageviews: 10 });

    const first = toolTurn(
      thinkingBlock(),
      textBlock('Let me check.'),
      toolUseBlock('tu_1', 'get_website_stats', { websiteId: 'evil-site', range: '7d' }),
      toolUseBlock('tu_2', 'get_website_stats', { range: '30d' }),
    );
    const second = endTurn(textBlock('You had 10 pageviews over the last 7 days.'));
    const { client, create } = makeClient([first, second]);

    const result = await askAnalytics({
      auth,
      websiteId: 'site-1',
      question: 'How many pageviews?',
      client,
    });

    expect(create).toHaveBeenCalledTimes(2);

    const { messages } = create.mock.calls[1][0];

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', content: 'How many pageviews?' });
    // Assistant content is echoed back verbatim (thinking block included).
    expect(messages[1]).toEqual({ role: 'assistant', content: first.content });
    // A single user message carries ALL tool_result blocks.
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toHaveLength(2);
    expect(messages[2].content.map((block: any) => block.type)).toEqual([
      'tool_result',
      'tool_result',
    ]);
    expect(messages[2].content.map((block: any) => block.tool_use_id)).toEqual(['tu_1', 'tu_2']);

    // websiteId forcing: both executions were pinned to the requested website.
    expect(mocks.statsExecute).toHaveBeenCalledTimes(2);
    for (const call of mocks.statsExecute.mock.calls) {
      expect(call[1].websiteId).toBe('site-1');
    }

    expect(result.answer).toBe('You had 10 pageviews over the last 7 days.');
    expect(result.toolCalls).toEqual([
      { name: 'get_website_stats', args: { websiteId: 'evil-site', range: '7d' } },
      { name: 'get_website_stats', args: { range: '30d' } },
    ]);
  });

  test('failed tool executions are returned as is_error tool_results, not thrown', async () => {
    mocks.statsExecute.mockRejectedValue(new Error('database is down'));

    const first = toolTurn(toolUseBlock('tu_1', 'get_website_stats', {}));
    const second = endTurn(textBlock('The stats tool failed.'));
    const { client, create } = makeClient([first, second]);

    const result = await askAnalytics({ auth, websiteId: 'site-1', question: 'Stats?', client });

    const { messages } = create.mock.calls[1][0];
    const [toolResult] = messages[2].content;

    expect(toolResult).toEqual({
      type: 'tool_result',
      tool_use_id: 'tu_1',
      content: 'database is down',
      is_error: true,
    });
    expect(result.answer).toBe('The stats tool failed.');
  });

  test('stops after the 8-round cap even if the model keeps requesting tools', async () => {
    mocks.statsExecute.mockResolvedValue({ pageviews: 1 });

    const responses = Array.from({ length: MAX_TOOL_ROUNDS + 1 }, (_, i) =>
      toolTurn(textBlock(`round ${i}`), toolUseBlock(`tu_${i}`, 'get_website_stats', {})),
    );
    const { client, create } = makeClient(responses);

    const result = await askAnalytics({ auth, websiteId: 'site-1', question: 'Loop?', client });

    // Initial call + one per round.
    expect(create).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(mocks.statsExecute).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    // Text is still extracted from the final (capped) response.
    expect(result.answer).toBe(`round ${MAX_TOOL_ROUNDS}`);
    expect(result.toolCalls).toHaveLength(MAX_TOOL_ROUNDS);
  });

  test('extracts and joins text blocks from the final response', async () => {
    const { client } = makeClient([
      endTurn(thinkingBlock(), textBlock('First line.'), textBlock('Second line.')),
    ]);

    const result = await askAnalytics({ auth, websiteId: 'site-1', question: 'Hi', client });

    expect(result.answer).toBe('First line.\nSecond line.');
    expect(result.toolCalls).toEqual([]);
  });

  test('prepends capped history as plain messages', async () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`,
    }));
    const { client, create } = makeClient([endTurn(textBlock('ok'))]);

    await askAnalytics({ auth, websiteId: 'site-1', question: 'Now?', history, client });

    const { messages } = create.mock.calls[0][0];

    // 12 history entries capped at 10, plus the question.
    expect(messages).toHaveLength(11);
    expect(messages[0]).toEqual({ role: 'user', content: 'message 2' });
    expect(messages[9]).toEqual({ role: 'assistant', content: 'message 11' });
    expect(messages[10]).toEqual({ role: 'user', content: 'Now?' });
  });
});
