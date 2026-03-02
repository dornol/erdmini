import { randomUUID } from 'crypto';
import type { RequestHandler } from './$types';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveApiKey } from '$lib/server/auth/api-key';
import { createMcpServer } from '$lib/server/mcp/server';
import db from '$lib/server/db';

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport;
  server: ReturnType<typeof createMcpServer>;
}

const sessions = new Map<string, McpSession>();

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

  // Parse body before passing to transport (SvelteKit may consume the stream)
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionId = request.headers.get('mcp-session-id');

  // Route to existing session
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    return session.transport.handleRequest(request, { parsedBody });
  }

  // Stale session ID → tell client to reinitialize
  if (sessionId) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Session not found. Please reinitialize.' },
      id: null,
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // New session (no session ID — must be initialize request)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { transport, server: mcpServer });
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
    },
  });
  const mcpServer = createMcpServer(db, auth.keyInfo);
  await mcpServer.connect(transport);
  return transport.handleRequest(request, { parsedBody });
};

export const GET: RequestHandler = async ({ request }) => {
  const auth = authenticate(request);
  if ('error' in auth) return auth.error;

  const sessionId = request.headers.get('mcp-session-id');
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!.transport.handleRequest(request);
  }

  return new Response(JSON.stringify({ error: 'Invalid or missing session' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const auth = authenticate(request);
  if ('error' in auth) return auth.error;

  const sessionId = request.headers.get('mcp-session-id');
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!.transport.handleRequest(request);
  }

  return new Response(JSON.stringify({ error: 'Invalid or missing session' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
