import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { createDictShareToken, listDictShareTokens, deleteDictShareToken } from '$lib/server/dictionary';
import { logAudit } from '$lib/server/audit';
import { err } from '$lib/server/api-helpers';

export const GET: RequestHandler = ({ locals }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  const tokens = listDictShareTokens(db);
  return json(tokens);
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  const body = await request.json();
  const { password, expiresInDays } = body;

  if (expiresInDays !== undefined && (typeof expiresInDays !== 'number' || expiresInDays < 0)) {
    return err('Invalid expiresInDays');
  }

  const result = await createDictShareToken(db, locals.user!.id, { password, expiresInDays });
  logAudit({
    action: 'create_dictionary_share_token',
    category: 'system',
    userId: locals.user!.id,
    username: locals.user!.username,
    detail: { tokenId: result.id, hasPassword: !!password, expiresInDays },
    source: 'web',
  });
  return json(result, { status: 201 });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
  const adminErr = requireAdmin(locals);
  if (adminErr) return adminErr;

  const body = await request.json();
  const { tokenId } = body;
  if (!tokenId) return err('tokenId is required');

  deleteDictShareToken(db, tokenId);
  logAudit({
    action: 'delete_dictionary_share_token',
    category: 'system',
    userId: locals.user!.id,
    username: locals.user!.username,
    detail: { tokenId },
    source: 'web',
  });
  return json({ ok: true });
};
