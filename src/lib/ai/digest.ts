/**
 * LLM narrative digest (RFD 0009).
 *
 * Takes the plain-numbers digest from composeDigest (RFD 0008) and makes ONE
 * LLM call (no tools) to rewrite it as a short narrative. On ANY failure the
 * plain text is returned unchanged — alert delivery must never break because
 * the LLM is down.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { getAiModel, getAnthropicClient } from '@/lib/ai/client';

const MAX_TOKENS = 4096;

export async function composeNarrativeDigest(
  plainDigest: string,
  websiteId: string,
  periodMinutes: number,
  client?: Anthropic,
): Promise<string> {
  try {
    const anthropic = client ?? getAnthropicClient();

    const response = await anthropic.messages.create({
      model: getAiModel(),
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system:
        'You write short plain-text analytics digests for website owners. Rewrite the ' +
        'numbers you are given as a 6-10 line narrative focused on what changed and why it ' +
        'matters. Use only the numbers provided — never invent data. No markdown, no ' +
        'preamble; output the digest text only.',
      messages: [
        {
          role: 'user',
          content:
            `Website ${websiteId}, covering the last ${periodMinutes} minutes.\n\n` +
            `Stats:\n${plainDigest}`,
        },
      ],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();

    return text || plainDigest;
  } catch {
    return plainDigest;
  }
}
