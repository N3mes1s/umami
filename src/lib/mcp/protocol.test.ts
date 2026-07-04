import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { McpToolError } from '@/lib/mcp/errors';
import { handleMcpRequest } from '@/lib/mcp/protocol';

const auth: any = {
  user: { id: 'user-1', username: 'user', role: 'user', isAdmin: false },
};

const echoTool = {
  name: 'echo_tool',
  description: 'Echoes a message back',
  inputSchema: z.object({ message: z.string() }),
  execute: vi.fn(async (_auth: any, args: any) => ({ echoed: args.message })),
};

const failTool = {
  name: 'fail_tool',
  description: 'Always fails with a tool error',
  inputSchema: z.object({}),
  execute: async () => {
    throw new McpToolError('Access denied to website');
  },
};

const fakeTools: any[] = [echoTool, failTool];

function request(method: string, params?: any, id: any = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

describe('handleMcpRequest', () => {
  test('initialize returns protocol version, capabilities and server info', async () => {
    const { status, json } = await handleMcpRequest(auth, request('initialize'), fakeTools);

    expect(status).toBe(200);
    expect(json.id).toBe(1);
    expect(json.result.protocolVersion).toBe('2025-06-18');
    expect(json.result.capabilities).toEqual({ tools: {} });
    expect(json.result.serverInfo.name).toBe('umami-mcp');
    expect(typeof json.result.serverInfo.version).toBe('string');
  });

  test('notifications/initialized returns 202 with no body', async () => {
    const { status, json } = await handleMcpRequest(
      auth,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      fakeTools,
    );

    expect(status).toBe(202);
    expect(json).toBeUndefined();
  });

  test('ping returns an empty result', async () => {
    const { json } = await handleMcpRequest(auth, request('ping', undefined, 7), fakeTools);

    expect(json).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });

  test('tools/list returns names, descriptions and JSON schemas', async () => {
    const { status, json } = await handleMcpRequest(auth, request('tools/list'), fakeTools);

    expect(status).toBe(200);
    expect(json.result.tools).toHaveLength(2);

    const [echo] = json.result.tools;

    expect(echo.name).toBe('echo_tool');
    expect(echo.description).toBe('Echoes a message back');
    expect(echo.inputSchema.type).toBe('object');
    expect(echo.inputSchema.properties.message).toEqual({ type: 'string' });
    expect(echo.inputSchema.required).toEqual(['message']);
  });

  test('tools/call executes the tool and wraps the result as text content', async () => {
    const { status, json } = await handleMcpRequest(
      auth,
      request('tools/call', { name: 'echo_tool', arguments: { message: 'hi' } }, 42),
      fakeTools,
    );

    expect(status).toBe(200);
    expect(json.id).toBe(42);
    expect(json.result.isError).toBeUndefined();
    expect(json.result.content).toHaveLength(1);
    expect(json.result.content[0].type).toBe('text');
    expect(JSON.parse(json.result.content[0].text)).toEqual({ echoed: 'hi' });
    expect(echoTool.execute).toHaveBeenCalledWith(auth, { message: 'hi' });
  });

  test('tools/call returns -32602 with the zod message on invalid arguments', async () => {
    const { status, json } = await handleMcpRequest(
      auth,
      request('tools/call', { name: 'echo_tool', arguments: { message: 5 } }),
      fakeTools,
    );

    expect(status).toBe(200);
    expect(json.error.code).toBe(-32602);
    expect(json.error.message).toContain('echo_tool');
    expect(json.error.message).toContain('message');
    expect(json.result).toBeUndefined();
  });

  test('tools/call returns -32602 for an unknown tool', async () => {
    const { json } = await handleMcpRequest(
      auth,
      request('tools/call', { name: 'nope', arguments: {} }),
      fakeTools,
    );

    expect(json.error.code).toBe(-32602);
    expect(json.error.message).toContain('nope');
  });

  test('tools/call surfaces McpToolError as an isError result, not a protocol error', async () => {
    const { status, json } = await handleMcpRequest(
      auth,
      request('tools/call', { name: 'fail_tool', arguments: {} }),
      fakeTools,
    );

    expect(status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toBe('Access denied to website');
  });

  test('unknown method returns -32601', async () => {
    const { json } = await handleMcpRequest(auth, request('resources/list'), fakeTools);

    expect(json.error.code).toBe(-32601);
    expect(json.id).toBe(1);
  });

  test('batch arrays are rejected with -32600', async () => {
    const { status, json } = await handleMcpRequest(
      auth,
      [request('ping'), request('ping')],
      fakeTools,
    );

    expect(status).toBe(400);
    expect(json.error.code).toBe(-32600);
    expect(json.id).toBeNull();
  });

  test('malformed requests are rejected with -32600', async () => {
    const missingBody = await handleMcpRequest(auth, undefined, fakeTools);
    const badVersion = await handleMcpRequest(
      auth,
      { jsonrpc: '1.0', id: 1, method: 'ping' },
      fakeTools,
    );

    expect(missingBody.json.error.code).toBe(-32600);
    expect(badVersion.json.error.code).toBe(-32600);
  });
});
