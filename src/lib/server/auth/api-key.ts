import { randomBytes, createHash } from 'crypto';
import type { ApiKeyRow, UserRow } from '$lib/types/auth';

const PREFIX = 'erd_';

export function generateApiKey(): { key: string; hash: string } {
  const raw = randomBytes(32).toString('hex'); // 64 hex chars
  const key = PREFIX + raw;
  return { key, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export interface ResolvedApiKey {
  userId: string;
  userRole: string;
  displayName: string;
  keyId: string;
}

export function resolveApiKey(
  db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } },
  rawKey: string,
): ResolvedApiKey | null {
  if (!rawKey || !rawKey.startsWith(PREFIX)) return null;

  const hash = hashApiKey(rawKey);
  const row = db.prepare(
    `SELECT ak.id AS key_id, ak.user_id, ak.expires_at,
            u.role, u.display_name
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = ?`
  ).get(hash) as { key_id: string; user_id: string; expires_at: string | null; role: string; display_name: string } | undefined;

  if (!row) return null;

  // Check expiry
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  // Update last_used_at
  db.prepare('UPDATE api_keys SET last_used_at = datetime(\'now\') WHERE id = ?').run(row.key_id);

  return {
    userId: row.user_id,
    userRole: row.role,
    displayName: row.display_name,
    keyId: row.key_id,
  };
}
