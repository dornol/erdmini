import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { updateWord, updateWordStatus, deleteWord } from '$lib/server/dictionary';
import type { WordStatus } from '$lib/server/dictionary';
import { logAudit } from '$lib/server/audit';
import { err } from '$lib/server/api-helpers';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  const body = await request.json();
  const { word, meaning, description, category, status } = body;

  try {
    // Status change (approve/reject)
    if (status && (status === 'approved' || status === 'rejected')) {
      updateWordStatus(db, params.id, status as WordStatus);
      logAudit({
        action: status === 'approved' ? 'approve_dictionary_word' : 'reject_dictionary_word',
        category: 'system',
        userId: locals.user!.id,
        username: locals.user!.username,
        detail: { wordId: params.id, status },
        source: 'web',
      });
    }

    // Field update
    if (word !== undefined || meaning !== undefined || description !== undefined || category !== undefined) {
      updateWord(db, params.id, { word, meaning, description, category });
      logAudit({
        action: 'update_dictionary_word',
        category: 'system',
        userId: locals.user!.id,
        username: locals.user!.username,
        detail: { wordId: params.id },
        source: 'web',
      });
    }

    return json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint')) {
      return err('Word already exists', 409);
    }
    throw e;
  }
};

export const DELETE: RequestHandler = ({ locals, params }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  deleteWord(db, params.id);
  logAudit({
    action: 'delete_dictionary_word',
    category: 'system',
    userId: locals.user!.id,
    username: locals.user!.username,
    detail: { wordId: params.id },
    source: 'web',
  });
  return json({ ok: true });
};
