/**
 * "Ask your analytics" agentic loop (RFD 0009).
 *
 * Runs a bounded tool-use loop against the Anthropic API using the MCP tool
 * registry (via src/lib/ai/tools.ts), pinned to one website. No conversation
 * persistence: the client keeps history and resends it.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getAiModel, getAnthropicClient } from '@/lib/ai/client';
import { getAnalyticsTools } from '@/lib/ai/tools';
import type { Auth } from '@/lib/types';

export const MAX_TOOL_ROUNDS = 8;
const MAX_HISTORY_MESSAGES = 10;
const MAX_TOKENS = 4096;

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskAnalyticsParams {
  auth: Auth;
  websiteId: string;
  question: string;
  history?: ChatHistoryMessage[];
  /** Injectable for tests; defaults to the shared lazy singleton. */
  client?: Anthropic;
}

export interface AskAnalyticsResult {
  answer: string;
  toolCalls: { name: string; args: Record<string, unknown> }[];
}

function buildSystemPrompt(websiteId: string): string {
  return [
    `You are an analytics assistant for website ${websiteId} (Umami web analytics).`,
    `Today's date is ${new Date().toISOString()} and all dates and times are in UTC.`,
    'Metric semantics: visitors = count of distinct salted session IDs (the salt rotates ' +
      'monthly, so ranges spanning a month boundary can double-count returning people); ' +
      'visits = sessions split into 30-minute inactivity windows; bounces = visits with a ' +
      'single pageview; durations are in seconds.',
    'Use the tools to answer with concrete numbers, and always state the date range the ' +
      'numbers cover.',
    'Never fabricate numbers. If a tool call fails or the data is unavailable, say so ' +
      'plainly instead of guessing.',
  ].join('\n');
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

export async function askAnalytics({
  auth,
  websiteId,
  question,
  history,
  client,
}: AskAnalyticsParams): Promise<AskAnalyticsResult> {
  const anthropic = client ?? getAnthropicClient();
  const { definitions, execute } = getAnalyticsTools(auth, websiteId);

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? [])
      .slice(-MAX_HISTORY_MESSAGES)
      .map(({ role, content }): Anthropic.MessageParam => ({ role, content })),
    { role: 'user', content: question },
  ];

  const request = {
    model: getAiModel(),
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' as const },
    system: buildSystemPrompt(websiteId),
    tools: definitions,
  };

  const toolCalls: AskAnalyticsResult['toolCalls'] = [];

  try {
    let response = await anthropic.messages.create({ ...request, messages });
    let rounds = 0;

    while (response.stop_reason === 'tool_use' && rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;

      // Echo the assistant turn back verbatim (thinking blocks included).
      messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      // Execute EVERY tool_use block and return ALL results in ONE user message.
      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const args = (block.input ?? {}) as Record<string, unknown>;

        toolCalls.push({ name: block.name, args });

        try {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: await execute(block.name, args),
          });
        } catch (error) {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: error instanceof Error ? error.message : 'Tool execution failed',
            is_error: true,
          });
        }
      }

      messages.push({ role: 'user', content: results });

      response = await anthropic.messages.create({ ...request, messages });
    }

    return { answer: extractText(response.content), toolCalls };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return {
        answer: 'The AI service is currently rate limited. Please try again later.',
        toolCalls,
      };
    }

    throw error;
  }
}
