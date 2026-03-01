export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function now(): string {
  return new Date().toISOString();
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣ぁ-んァ-ヶ一-龥_\-. ]/g, '_').replace(/\s+/g, '_');
}
