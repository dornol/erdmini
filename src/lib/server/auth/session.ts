import { randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import type { AuthUser, SessionRow, UserRow } from '$lib/types/auth';
import { env } from '$env/dynamic/private';

const SESSION_MAX_AGE_DAYS = parseInt(env.SESSION_MAX_AGE_DAYS || '30', 10);

export function createSession(db: Database.Database, userId: string): SessionRow {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(id, userId, expiresAt);

  return { id, user_id: userId, expires_at: expiresAt, created_at: new Date().toISOString() };
}

export function validateSession(db: Database.Database, sessionId: string): { user: AuthUser; session: SessionRow } | null {
  const row = db.prepare(`
    SELECT s.id as session_id, s.user_id, s.expires_at, s.created_at as session_created_at,
           u.id as uid, u.username, u.display_name, u.email, u.role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(sessionId) as {
    session_id: string;
    user_id: string;
    expires_at: string;
    session_created_at: string;
    uid: string;
    username: string | null;
    display_name: string;
    email: string | null;
    role: string;
  } | undefined;

  if (!row) return null;

  // Check expiry
  if (new Date(row.expires_at) <= new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  return {
    user: {
      id: row.uid,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      role: row.role as 'admin' | 'user',
    },
    session: {
      id: row.session_id,
      user_id: row.user_id,
      expires_at: row.expires_at,
      created_at: row.session_created_at,
    },
  };
}

export function deleteSession(db: Database.Database, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteUserSessions(db: Database.Database, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}
