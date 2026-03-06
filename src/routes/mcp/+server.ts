import type { RequestHandler } from './$types';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveApiKey, type ResolvedApiKey } from '$lib/server/auth/api-key';
import { createMcpServer } from '$lib/server/mcp/server';
import db from '$lib/server/db';

function authenticate(request: Request): { error: Response } | { keyInfo: ResolvedApiKey } {
  const auth = request.headers.get('authorization');
  const apiKey = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!apiKey) {
    return { error: new Response(JSON.stringify({ error: 'Missing or invalid Authorization header. Expected: Bearer <api-key>' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }

  const keyInfo = resolveApiKey(db as any, apiKey);
  if (!keyInfo) {
    return { error: new Response(JSON.stringify({ error: 'Invalid or expired API key' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) };
  }

  return { keyInfo };
}

export const POST: RequestHandler = async ({ request }): Promise<Response> => {
  const auth = authenticate(request);
  if ('error' in auth) return auth.error;

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ensure Accept header includes required content types for MCP SDK validation
  const headers = new Headers(request.headers);
  const accept = headers.get('accept') || '';
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
    headers.set('accept', 'application/json, text/event-stream');
  }
  const correctedRequest = new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(parsedBody),
  });

  try {
    // Stateless: fresh transport + server per request, JSON response mode
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const mcpServer = createMcpServer(db, auth.keyInfo);
    await mcpServer.connect(transport);
    const response = await transport.handleRequest(correctedRequest, { parsedBody });
    return response ?? new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32603, message },
      id: null,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: RequestHandler = async () => {
  // SSE streaming not needed in stateless mode
  return new Response(JSON.stringify({ error: 'SSE not supported in stateless mode' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: RequestHandler = async () => {
  // No sessions to close in stateless mode
  return new Response(null, { status: 200 });
};
