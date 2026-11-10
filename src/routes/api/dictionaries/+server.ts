import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { cloneDictionary, createDictionary, listDictionaries, listDictionariesWithUsage } from '$lib/server/dictionary';
import { logAudit } from '$lib/server/audit';
import { err } from '$lib/server/api-helpers';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (locals.user.role === 'admin') return json(listDictionariesWithUsage(db));
  return json(listDictionaries(db));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  const body = await request.json();
  const { name, description, cloneFromDictionaryId } = body;
  if (!name?.trim()) return err('name is required');

  try {
    const row = cloneFromDictionaryId
      ? cloneDictionary(db, cloneFromDictionaryId, { name, description }, locals.user!.id)
      : createDictionary(db, { name, description }, locals.user!.id);
    logAudit({
      action: cloneFromDictionaryId ? 'clone_dictionary' : 'create_dictionary',
      category: 'system',
      userId: locals.user!.id,
      username: locals.user!.username,
      detail: { dictionaryId: row.id, name: row.name, cloneFromDictionaryId },
      source: 'web',
    });
    return json(row, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint')) {
      return err('Dictionary already exists', 409);
    }
    if (e instanceof Error && e.message.includes('Source dictionary not found')) {
      return err(e.message, 404);
    }
    throw e;
  }
};
