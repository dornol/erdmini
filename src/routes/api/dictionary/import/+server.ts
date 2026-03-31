import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { importWords } from '$lib/server/dictionary';
import { logAudit } from '$lib/server/audit';
import { err } from '$lib/server/api-helpers';

export const POST: RequestHandler = async ({ locals, request }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  const body = await request.json();
  if (!Array.isArray(body)) {
    return err('Expected JSON array of { word, meaning, description?, category? }');
  }
  if (body.length > 5000) {
    return err('Maximum 5000 words per import');
  }

  const result = importWords(db, body, locals.user!.id);
  logAudit({
    action: 'import_dictionary_words',
    category: 'system',
    userId: locals.user!.id,
    username: locals.user!.username,
    detail: { created: result.created, updated: result.updated, errorCount: result.errors.length },
    source: 'web',
  });
  return json(result);
};
