import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { listWords, createWord, countPendingWords } from '$lib/server/dictionary';
import type { WordStatus, WordRow } from '$lib/server/dictionary';
import { logAudit } from '$lib/server/audit';
import { err } from '$lib/server/api-helpers';

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const search = url.searchParams.get('search') || undefined;
  const category = url.searchParams.has('category') ? url.searchParams.get('category')! : undefined;
  const status = (url.searchParams.get('status') as WordStatus) || undefined;
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  const isAdmin = locals.user.role === 'admin';

  // Admin can filter by any status; non-admin always sees approved
  const effectiveStatus = isAdmin && status ? status : 'approved';
  const result = listWords(db, { search, category, status: effectiveStatus, page, limit });

  // Admin: pending count. Non-admin: own pending + rejected suggestions.
  const pendingCount = isAdmin ? countPendingWords(db) : 0;
  let mySuggestions: WordRow[] = [];
  if (!isAdmin) {
    const userId = locals.user!.id;
    const pending = listWords(db, { status: 'pending', limit: 100 }).words.filter(w => w.created_by === userId);
    const rejected = listWords(db, { status: 'rejected', limit: 100 }).words.filter(w => w.created_by === userId);
    mySuggestions = [...pending, ...rejected];
  }

  return json({ ...result, pendingCount, mySuggestions });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { word, meaning, description, category } = body;

  if (!word?.trim() || !meaning?.trim()) {
    return err('word and meaning are required');
  }

  const isAdmin = locals.user.role === 'admin';
  const status: WordStatus = isAdmin ? 'approved' : 'pending';

  try {
    const row = createWord(db, { word, meaning, description, category, status }, locals.user.id);
    logAudit({
      action: isAdmin ? 'create_dictionary_word' : 'suggest_dictionary_word',
      category: 'system',
      userId: locals.user.id,
      username: locals.user.username,
      detail: { word: row.word, meaning: row.meaning, status },
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
