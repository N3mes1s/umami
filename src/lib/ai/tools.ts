/**
 * Adapter from the MCP tool registry (RFD 0005) to Anthropic tool-use (RFD 0009).
 *
 * One source of truth for MCP, chat and digests: the tool definitions and
 * execute functions come from src/lib/mcp/tools.ts. This adapter:
 * - excludes list_websites (the chat is pinned to a single website),
 * - forces args.websiteId to the requested website on every call, so
 *   prompt-injected tool arguments can never reach another site
 *   (belt-and-braces on top of the canViewWebsite check inside each tool),
 * - stringifies and char-caps every tool result before it reaches the model.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { mcpTools } from '@/lib/mcp/tools';
import type { Auth } from '@/lib/types';

export const MAX_TOOL_RESULT_CHARS = 8000;
export const TRUNCATION_MARKER = '...truncated';

export interface AnalyticsToolset {
  definitions: Anthropic.Tool[];
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
}

export function truncateToolResult(value: unknown): string {
  const text = JSON.stringify(value) ?? 'null';

  if (text.length <= MAX_TOOL_RESULT_CHARS) {
    return text;
  }

  return text.slice(0, MAX_TOOL_RESULT_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

export function getAnalyticsTools(auth: Auth, websiteId: string): AnalyticsToolset {
  const tools = mcpTools.filter(tool => tool.name !== 'list_websites');

  const definitions: Anthropic.Tool[] = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.inputSchema) as Anthropic.Tool.InputSchema,
  }));

  async function execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = tools.find(t => t.name === name);

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Pin every call to the requested website, whatever the model asked for.
    const parsed = tool.inputSchema.safeParse({ ...(args ?? {}), websiteId });

    if (!parsed.success) {
      throw new Error(`Invalid arguments for tool ${name}: ${parsed.error.message}`);
    }

    const result = await tool.execute(auth, { ...parsed.data, websiteId });

    return truncateToolResult(result);
  }

  return { definitions, execute };
}
