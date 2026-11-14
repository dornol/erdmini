import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveProviderRequest } from './provider-request';

afterEach(() => vi.unstubAllGlobals());
describe('provider requests preserve recoverable error messages', () => {
  it('sends the requested mutation and reports success without parsing a response body', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetcher);
    expect(await saveProviderRequest('/provider', 'PUT', { displayName: 'Edited', clientSecret: '' })).toBeNull();
    expect(fetcher).toHaveBeenCalledWith('/provider', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"displayName":"Edited","clientSecret":""}' });
  });
  it('preserves a readable JSON error so the UI can show the validation cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Duplicate issuer"}', { status: 409 })));
    expect(await saveProviderRequest('/provider', 'POST', {})).toBe('Duplicate issuer');
  });
  for (const body of ['<html>upstream-secret</html>', 'null', '{"error":{"secret":"upstream-secret"}}']) {
    it(`handles non-message response ${body} without throwing or exposing raw upstream data`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 503 })));
      expect(await saveProviderRequest('/provider', 'POST', { clientSecret: 'private-draft' })).toBe('Failed to save provider');
    });
  }
  it('converts transport rejection into a recoverable error without exposing the exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-draft')));
    expect(await saveProviderRequest('/provider', 'PUT', { clientSecret: 'private-draft' })).toBe('Failed to save provider');
  });
});
