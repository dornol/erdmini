/** Preserve provider drafts on transport errors and non-JSON upstream failures. */
export async function saveProviderRequest(url: string, method: 'POST' | 'PUT', body: object): Promise<string | null> {
  try {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.ok) return null;
    const result = await response.json().catch(() => null);
    return typeof result?.error === 'string' && result.error ? result.error : 'Failed to save provider';
  } catch {
    return 'Failed to save provider';
  }
}
