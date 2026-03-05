import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { hashPassword, verifyPassword } from './auth/password';

export function generateEmbedToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function createEmbedToken(
  db: Database.Database,
  projectId: string,
  userId: string,
  options?: { password?: string; expiresInDays?: number },
): Promise<{ id: string; token: string; expiresAt: string | null }> {
  const id = generateId();
  const token = generateEmbedToken();
  const passwordHash = options?.password ? await hashPassword(options.password) : null;
  const expiresAt =
    options?.expiresInDays != null
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  db.prepare(
    'INSERT INTO embed_tokens (id, project_id, token, password_hash, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, projectId, token, passwordHash, userId, expiresAt);

  return { id, token, expiresAt };
}

export function validateEmbedToken(
  db: Database.Database,
  token: string,
): { id: string; projectId: string; hasPassword: boolean } | null {
  const row = db
    .prepare('SELECT id, project_id, password_hash, expires_at FROM embed_tokens WHERE token = ?')
    .get(token) as
    | { id: string; project_id: string; password_hash: string | null; expires_at: string | null }
    | undefined;

  if (!row) return null;

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    hasPassword: !!row.password_hash,
  };
}

export async function verifyEmbedPassword(
  db: Database.Database,
  tokenId: string,
  password: string,
): Promise<boolean> {
  const row = db
    .prepare('SELECT password_hash FROM embed_tokens WHERE id = ?')
    .get(tokenId) as { password_hash: string | null } | undefined;

  if (!row?.password_hash) return false;
  return verifyPassword(row.password_hash, password);
}

export function listEmbedTokens(
  db: Database.Database,
  projectId: string,
): Array<{
  id: string;
  token: string;
  hasPassword: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}> {
  const rows = db
    .prepare(
      'SELECT id, token, password_hash, created_by, created_at, expires_at FROM embed_tokens WHERE project_id = ? ORDER BY created_at DESC',
    )
    .all(projectId) as Array<{
    id: string;
    token: string;
    password_hash: string | null;
    created_by: string;
    created_at: string;
    expires_at: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    hasPassword: !!r.password_hash,
    createdBy: r.created_by,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

export function deleteEmbedToken(db: Database.Database, tokenId: string): void {
  db.prepare('DELETE FROM embed_tokens WHERE id = ?').run(tokenId);
}

export function deleteProjectEmbedTokens(db: Database.Database, projectId: string): void {
  db.prepare('DELETE FROM embed_tokens WHERE project_id = ?').run(projectId);
}
