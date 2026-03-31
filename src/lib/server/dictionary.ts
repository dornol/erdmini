import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { hashPassword, verifyPassword } from './auth/password';
import { generateId } from '$lib/utils/common';

// ─── Types ───────────────────────────────────────────────────────────

export type WordStatus = 'approved' | 'pending' | 'rejected';

export interface WordRow {
  id: string;
  word: string;
  meaning: string;
  description: string | null;
  category: string | null;
  status: WordStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DictShareTokenRow {
  id: string;
  token: string;
  hasPassword: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}

// ─── Word CRUD ───────────────────────────────────────────────────────

export function listWords(
  db: Database.Database,
  opts?: { search?: string; category?: string; status?: WordStatus; page?: number; limit?: number },
): { words: WordRow[]; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Default: approved only
  const status = opts?.status ?? 'approved';
  conditions.push('status = ?');
  params.push(status);

  if (opts?.search) {
    conditions.push('(word LIKE ? OR meaning LIKE ?)');
    const like = `%${opts.search}%`;
    params.push(like, like);
  }
  if (opts?.category !== undefined) {
    if (opts.category === '') {
      conditions.push('(category IS NULL OR category = \'\')');
    } else {
      conditions.push('category = ?');
      params.push(opts.category);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM word_dictionary ${where}`).get(...params) as { cnt: number }).cnt;

  const limit = opts?.limit ?? 50;
  const page = opts?.page ?? 1;
  const offset = (page - 1) * limit;

  const words = db
    .prepare(`SELECT * FROM word_dictionary ${where} ORDER BY category, word COLLATE NOCASE ASC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as WordRow[];

  return { words, total };
}

export function countPendingWords(db: Database.Database): number {
  return (db.prepare("SELECT COUNT(*) as cnt FROM word_dictionary WHERE status = 'pending'").get() as { cnt: number }).cnt;
}

export function createWord(
  db: Database.Database,
  data: { word: string; meaning: string; description?: string; category?: string; status?: WordStatus },
  userId: string,
): WordRow {
  const word = data.word.trim();
  const meaning = data.meaning.trim();
  const description = data.description?.trim() || null;
  const category = data.category?.trim() || null;
  const status = data.status ?? 'approved';

  // If a rejected word exists with the same name, re-activate it as pending/approved
  const existing = db.prepare('SELECT id, status FROM word_dictionary WHERE word = ? COLLATE NOCASE').get(word) as { id: string; status: string } | undefined;
  if (existing && existing.status === 'rejected') {
    db.prepare(
      "UPDATE word_dictionary SET meaning = ?, description = ?, category = ?, status = ?, created_by = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(meaning, description, category, status, userId, existing.id);
    return db.prepare('SELECT * FROM word_dictionary WHERE id = ?').get(existing.id) as WordRow;
  }

  const id = generateId();
  db.prepare(
    'INSERT INTO word_dictionary (id, word, meaning, description, category, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, word, meaning, description, category, status, userId);

  return db.prepare('SELECT * FROM word_dictionary WHERE id = ?').get(id) as WordRow;
}

export function updateWord(
  db: Database.Database,
  id: string,
  patch: { word?: string; meaning?: string; description?: string | null; category?: string | null },
): void {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.word !== undefined) { sets.push('word = ?'); params.push(patch.word.trim()); }
  if (patch.meaning !== undefined) { sets.push('meaning = ?'); params.push(patch.meaning.trim()); }
  if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description?.trim() || null); }
  if (patch.category !== undefined) { sets.push('category = ?'); params.push(patch.category?.trim() || null); }

  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE word_dictionary SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function updateWordStatus(db: Database.Database, id: string, status: WordStatus): void {
  db.prepare("UPDATE word_dictionary SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

export function deleteWord(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM word_dictionary WHERE id = ?').run(id);
}

export function listCategories(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT DISTINCT category FROM word_dictionary WHERE category IS NOT NULL AND category != '' ORDER BY category COLLATE NOCASE")
    .all() as { category: string }[];
  return rows.map((r) => r.category);
}

export function importWords(
  db: Database.Database,
  words: { word: string; meaning: string; description?: string; category?: string }[],
  userId: string,
): { created: number; updated: number; errors: string[] } {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  const insertStmt = db.prepare(
    'INSERT INTO word_dictionary (id, word, meaning, description, category, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const updateStmt = db.prepare(
    "UPDATE word_dictionary SET meaning = ?, description = ?, category = ?, updated_at = datetime('now') WHERE word = ? COLLATE NOCASE",
  );
  const findStmt = db.prepare('SELECT id FROM word_dictionary WHERE word = ? COLLATE NOCASE');

  const tx = db.transaction(() => {
    for (const w of words) {
      if (!w.word?.trim() || !w.meaning?.trim()) {
        errors.push(`Skipped empty entry: ${JSON.stringify(w)}`);
        continue;
      }
      const existing = findStmt.get(w.word.trim()) as { id: string } | undefined;
      if (existing) {
        updateStmt.run(w.meaning.trim(), w.description?.trim() || null, w.category?.trim() || null, w.word.trim());
        updated++;
      } else {
        insertStmt.run(generateId(), w.word.trim(), w.meaning.trim(), w.description?.trim() || null, w.category?.trim() || null, userId);
        created++;
      }
    }
  });
  tx();

  return { created, updated, errors };
}

// ─── Share Tokens ────────────────────────────────────────────────────

export async function createDictShareToken(
  db: Database.Database,
  userId: string,
  options?: { password?: string; expiresInDays?: number },
): Promise<{ id: string; token: string; expiresAt: string | null }> {
  const id = generateId();
  const token = crypto.randomBytes(32).toString('hex');
  const passwordHash = options?.password ? await hashPassword(options.password) : null;
  const expiresAt =
    options?.expiresInDays != null
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  db.prepare(
    'INSERT INTO dictionary_share_tokens (id, token, password_hash, created_by, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, token, passwordHash, userId, expiresAt);

  return { id, token, expiresAt };
}

export function validateDictShareToken(
  db: Database.Database,
  token: string,
): { id: string; hasPassword: boolean } | null {
  const row = db
    .prepare('SELECT id, password_hash, expires_at FROM dictionary_share_tokens WHERE token = ?')
    .get(token) as { id: string; password_hash: string | null; expires_at: string | null } | undefined;

  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  return { id: row.id, hasPassword: !!row.password_hash };
}

export async function verifyDictSharePassword(
  db: Database.Database,
  tokenId: string,
  password: string,
): Promise<boolean> {
  const row = db
    .prepare('SELECT password_hash FROM dictionary_share_tokens WHERE id = ?')
    .get(tokenId) as { password_hash: string | null } | undefined;

  if (!row?.password_hash) return false;
  return verifyPassword(row.password_hash, password);
}

export function listDictShareTokens(db: Database.Database): DictShareTokenRow[] {
  const rows = db
    .prepare('SELECT id, token, password_hash, created_by, created_at, expires_at FROM dictionary_share_tokens ORDER BY created_at DESC')
    .all() as Array<{
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

export function deleteDictShareToken(db: Database.Database, tokenId: string): void {
  db.prepare('DELETE FROM dictionary_share_tokens WHERE id = ?').run(tokenId);
}
