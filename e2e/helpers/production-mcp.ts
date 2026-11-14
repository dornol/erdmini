import { expect, type APIRequestContext } from 'playwright/test';
import { MCP_TOOL_NAMES } from './mcp-catalog';

/** Exercise the actual production HTTP route; never import the server factory. */
export async function assertProductionMcp(request: APIRequestContext, url: string) {
  const created = await request.post(`${url}/api/admin/api-keys`, { data: { name: 'Production container contract' } });
  expect(created.status()).toBe(201);
  const key = await created.json() as { id: string; key: string };
  const headers = { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' };
  const payload = { jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} };
  try {
    const response = await request.post(`${url}/mcp`, { headers, data: payload });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ jsonrpc: '2.0', id: 7 }); expect(body.error).toBeUndefined();
    expect(body.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES]);
    expect(JSON.stringify(body)).not.toContain(key.key);
    const index = await request.get(`${url}/api/storage/index`).then(r => r.json());
    const schemaUrl = `${url}/api/storage/schemas/${index.activeProjectId}`;
    const before = await request.get(schemaUrl).then(r => r.json());
    const call = await request.post(`${url}/mcp`, { headers, data: { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'list_tables', arguments: { projectId: index.activeProjectId } } } });
    expect(call.status()).toBe(200);
    const result = await call.json(); expect(result.error).toBeUndefined(); expect(result.result.isError).not.toBe(true);
    for (const table of before.tables) expect(JSON.stringify(result.result.content)).toContain(table.name);
    expect(await request.get(schemaUrl).then(r => r.json())).toEqual(before);
  } finally { expect((await request.delete(`${url}/api/admin/api-keys/${key.id}`)).status()).toBe(200); }
  const revoked = await request.post(`${url}/mcp`, { headers, data: payload });
  expect(revoked.status()).toBe(403);
}
