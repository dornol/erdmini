import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { listWords, createWord, countPendingWords } from '$lib/server/dictionary';
import type { WordStatus, WordRow } from '$lib/server/dictionary';
import { logAudit } from '$lib/server/audit';
import { err } from '$lib/server/api-helpers';

const VALID_STATUSES: WordStatus[] = ['approved', 'pending', 'rejected'];

function parsePositiveInt(value: string | null, fallback: number, max: number): number | null {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

function parseNonNegativeInt(value: string | null, fallback: number, max: number): number | null {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  return Math.min(parsed, max);
}

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const search = url.searchParams.get('search') || undefined;
  const dictionaryId = url.searchParams.get('dictionaryId') || undefined;
  const category = url.searchParams.has('category') ? url.searchParams.get('category')! : undefined;
  const statusParam = url.searchParams.get('status');
  if (statusParam && !VALID_STATUSES.includes(statusParam as WordStatus)) {
    return err('Invalid status');
  }
  const status = statusParam as WordStatus | null;
  const page = parsePositiveInt(url.searchParams.get('page'), 1, Number.MAX_SAFE_INTEGER);
  const limit = parseNonNegativeInt(url.searchParams.get('limit'), 50, 200);
  if (page == null) return err('Invalid page');
  if (limit == null) return err('Invalid limit');

  const isAdmin = locals.user.role === 'admin';

  // Admin can filter by any status; non-admin always sees approved
  const effectiveStatus = isAdmin && status ? status : 'approved';
  const result = listWords(db, { dictionaryId, search, category, status: effectiveStatus, page, limit });

  // Admin: pending count. Non-admin: own pending + rejected suggestions.
  const pendingCount = isAdmin ? countPendingWords(db, dictionaryId) : 0;
  let mySuggestions: WordRow[] = [];
  if (!isAdmin) {
    const userId = locals.user!.id;
    const pending = listWords(db, { dictionaryId, status: 'pending', limit: 100 }).words.filter(w => w.created_by === userId);
    const rejected = listWords(db, { dictionaryId, status: 'rejected', limit: 100 }).words.filter(w => w.created_by === userId);
    mySuggestions = [...pending, ...rejected];
  }

  return json({ ...result, pendingCount, mySuggestions });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { dictionaryId, word, meaning, description, category } = body;

  if (!word?.trim() || !meaning?.trim()) {
    return err('word and meaning are required');
  }

  const isAdmin = locals.user.role === 'admin';
  const status: WordStatus = isAdmin ? 'approved' : 'pending';

  try {
    const row = createWord(db, { dictionaryId, word, meaning, description, category, status }, locals.user.id);
    logAudit({
      action: isAdmin ? 'create_dictionary_word' : 'suggest_dictionary_word',
      category: 'system',
      userId: locals.user.id,
      username: locals.user.username,
      detail: { dictionaryId: row.dictionary_id, word: row.word, meaning: row.meaning, status },
      source: 'web',
    });
    return json(row, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint')) {
      return err('Word already exists', 409);
    }
    throw e;
  }
};
