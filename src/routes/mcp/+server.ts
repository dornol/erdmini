import type { RequestHandler } from './$types';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveApiKey } from '$lib/server/auth/api-key';
import { createMcpServer } from '$lib/server/mcp/server';
import db from '$lib/server/db';

function authenticate(request: Request) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return { error: new Response(JSON.stringify({ error: 'Missing x-api-key header' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
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
