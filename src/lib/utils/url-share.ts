import type { ERDSchema } from '$lib/types/erd';

/**
 * Compress schema JSON → deflate → base64url string
 * Payload: { n: projectName, s: schema } (short keys to minimize URL length)
 */
export async function schemaToShareString(schema: ERDSchema, projectName: string): Promise<string> {
  const json = JSON.stringify({ n: projectName, s: schema });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(json));
      controller.close();
    },
  }).pipeThrough(new CompressionStream('deflate'));

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // base64url encoding
  let b64 = btoa(String.fromCharCode(...merged));
  b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64;
}

/**
 * Decompress base64url string → inflate → { schema, projectName }
 * Backwards-compatible: if parsed JSON has .tables, it's the old raw ERDSchema format
 */
export async function shareStringToSchema(encoded: string): Promise<{ schema: ERDSchema; projectName: string | null }> {
  // base64url → base64
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('deflate'));

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const json = new TextDecoder().decode(merged);
  const parsed = JSON.parse(json);

  // Backwards compatibility: old format is raw ERDSchema (has .tables property)
  if (parsed.tables) {
    return { schema: parsed as ERDSchema, projectName: null };
  }

  // New format: { n: projectName, s: schema }
  return { schema: parsed.s as ERDSchema, projectName: parsed.n ?? null };
}

/**
 * Check if the current URL has a shared schema in the hash
 */
export function getShareDataFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (hash.startsWith('#s=')) {
    return hash.slice(3);
  }
  return null;
}

/**
 * Build share URL with the encoded schema
 */
export function buildShareUrl(encoded: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#s=${encoded}`;
}
