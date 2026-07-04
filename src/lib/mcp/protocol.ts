import { z } from 'zod';
import { McpToolError } from '@/lib/mcp/errors';
import type { McpTool } from '@/lib/mcp/tools';
import type { Auth } from '@/lib/types';

const PROTOCOL_VERSION = '2025-06-18';

export interface McpHttpResponse {
  status: number;
  json?: any;
}

function resultResponse(id: unknown, result: any): McpHttpResponse {
  return { status: 200, json: { jsonrpc: '2.0', id, result } };
}

function errorResponse(id: unknown, code: number, message: string): McpHttpResponse {
  return {
    status: code === -32600 ? 400 : 200,
    json: { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
  };
}

export async function handleMcpRequest(
  auth: Auth,
  body: unknown,
  tools?: McpTool[],
): Promise<McpHttpResponse> {
  if (Array.isArray(body)) {
    return errorResponse(
      null,
      -32600,
      'Batch requests are not supported by this stateless server; send one request per POST.',
    );
  }

  if (!body || typeof body !== 'object') {
    return errorResponse(null, -32600, 'Invalid JSON-RPC request: expected a JSON object.');
  }

  const { jsonrpc, method, id, params } = body as Record<string, any>;

  if (jsonrpc !== '2.0' || typeof method !== 'string') {
    return errorResponse(
      id,
      -32600,
      'Invalid JSON-RPC request: jsonrpc must be "2.0" and method must be a string.',
    );
  }

  // Notifications (no id) get no response body per JSON-RPC; MCP expects 202.
  if (method.startsWith('notifications/') || id === undefined) {
    return { status: 202 };
  }

  switch (method) {
    case 'initialize':
      return resultResponse(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'umami-mcp',
          version: process.env.currentVersion || '0.0.0',
        },
      });

    case 'ping':
      return resultResponse(id, {});

    case 'tools/list': {
      const registry = await getRegistry(tools);

      return resultResponse(id, {
        tools: registry.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: z.toJSONSchema(tool.inputSchema),
        })),
      });
    }

    case 'tools/call': {
      const registry = await getRegistry(tools);
      const name = params?.name;
      const tool = registry.find(t => t.name === name);

      if (!tool) {
        return errorResponse(id, -32602, `Unknown tool: ${name}`);
      }

      const parsed = tool.inputSchema.safeParse(params?.arguments ?? {});

      if (!parsed.success) {
        return errorResponse(
          id,
          -32602,
          `Invalid arguments for tool ${name}: ${parsed.error.message}`,
        );
      }

      try {
        const value = await tool.execute(auth, parsed.data);

        return resultResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        });
      } catch (error) {
        if (error instanceof McpToolError) {
          return resultResponse(id, {
            content: [{ type: 'text', text: error.message }],
            isError: true,
          });
        }

        return errorResponse(id, -32603, error instanceof Error ? error.message : 'Internal error');
      }
    }

    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}

// The default registry is loaded lazily so that tests (and anything else) can call
// handleMcpRequest with an injected registry without pulling in the query layer.
async function getRegistry(tools?: McpTool[]): Promise<McpTool[]> {
  if (tools) {
    return tools;
  }

  return (await import('@/lib/mcp/tools')).mcpTools;
}
