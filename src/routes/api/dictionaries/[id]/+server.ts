import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { deleteDictionary, setDefaultDictionary, updateDictionary } from '$lib/server/dictionary';
import { logAudit } from '$lib/server/audit';
import { err } from '$lib/server/api-helpers';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  const body = await request.json();
  const { name, description, isDefault } = body;

  try {
    let row = updateDictionary(db, params.id, { name, description });
    if (isDefault === true) {
      row = setDefaultDictionary(db, params.id);
    }

    logAudit({
      action: 'update_dictionary',
      category: 'system',
      userId: locals.user!.id,
      username: locals.user!.username,
      detail: { dictionaryId: params.id, name: row.name, isDefault: !!row.is_default },
      source: 'web',
    });
    return json(row);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint')) {
      return err('Dictionary already exists', 409);
    }
    if (e instanceof Error && e.message.includes('not found')) {
      return err(e.message, 404);
    }
    if (e instanceof Error && e.message.includes('name is required')) {
      return err(e.message);
    }
    throw e;
  }
};

export const DELETE: RequestHandler = ({ locals, params }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  try {
    deleteDictionary(db, params.id);
    logAudit({
      action: 'delete_dictionary',
      category: 'system',
      userId: locals.user!.id,
      username: locals.user!.username,
      detail: { dictionaryId: params.id },
      source: 'web',
    });
    return json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('not found')) {
      return err(e.message, 404);
    }
    if (e instanceof Error && (e.message.includes('in use') || e.message.includes('Default dictionary'))) {
      return err(e.message, 409);
    }
    throw e;
  }
};
