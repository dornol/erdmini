const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateId(): string {
  const arr = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(arr, v => ID_CHARS[v % ID_CHARS.length]).join('');
}

export function now(): string {
  return new Date().toISOString();
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣ぁ-んァ-ヶ一-龥_\-. ]/g, '_').replace(/\s+/g, '_');
}
