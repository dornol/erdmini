import type { RequestHandler } from './$types';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveApiKey } from '$lib/server/auth/api-key';
import { createMcpServer } from '$lib/server/mcp/server';
import db from '$lib/server/db';

function authenticate(request: Request) {
  const auth = request.headers.get('authorization');
  const apiKey = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!apiKey) {
    return { error: new Response(JSON.stringify({ error: 'Missing or invalid Authorization header. Expected: Bearer <api-key>' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }

  const keyInfo = resolveApiKey(db, apiKey);
  if (!keyInfo) {
    return { error: new Response(JSON.stringify({ error: 'Invalid or expired API key' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) };
  }

  return { keyInfo };
}

export const POST: RequestHandler = async ({ request }) => {
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

  // Ensure Accept header includes required content types for MCP SDK
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
    const headers = new Headers(request.headers);
    headers.set('accept', 'application/json, text/event-stream');
    request = new Request(request.url, {
      method: request.method,
      headers,
      body: null,
    });
  }

  // Stateless: create fresh transport + server per request
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpServer = createMcpServer(db, auth.keyInfo);
  await mcpServer.connect(transport);
  return transport.handleRequest(request, { parsedBody });
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
