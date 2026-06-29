import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { createDictionary, listDictionaries } from '$lib/server/dictionary';
import { logAudit } from '$lib/server/audit';
import { err } from '$lib/server/api-helpers';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  return json(listDictionaries(db));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  const body = await request.json();
  const { name, description } = body;
  if (!name?.trim()) return err('name is required');

  try {
    const row = createDictionary(db, { name, description }, locals.user!.id);
    logAudit({
      action: 'create_dictionary',
      category: 'system',
      userId: locals.user!.id,
      username: locals.user!.username,
      detail: { dictionaryId: row.id, name: row.name },
      source: 'web',
    });
    return json(row, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint')) {
      return err('Dictionary already exists', 409);
    }
    throw e;
  }
};
