/**
 * Anthropic client plumbing (RFD 0009).
 *
 * The fork must run perfectly LLM-less: every consumer gates on aiEnabled()
 * before touching the client.
 */
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getAiModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
}

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  return client;
}
