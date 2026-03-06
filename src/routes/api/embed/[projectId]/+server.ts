import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { checkProjectAccess, requirePermission } from '$lib/server/auth/guards';
import { createEmbedToken, listEmbedTokens, deleteEmbedToken } from '$lib/server/embed';
import { logAudit } from '$lib/server/audit';

export const GET: RequestHandler = ({ params, locals }) => {
  const err = checkProjectAccess(db, locals, params.projectId, 'editor');
  if (err) return err;

  const tokens = listEmbedTokens(db, params.projectId);
  return json(tokens);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const err = checkProjectAccess(db, locals, params.projectId, 'editor');
  if (err) return err;

  const permErr = requirePermission(locals, 'canCreateEmbed');
  if (permErr) return permErr;

  const body = await request.json();
  const { password, expiresInDays } = body as { password?: string; expiresInDays?: number };
  const userId = locals.user?.id ?? 'singleton';

  const result = await createEmbedToken(db, params.projectId, userId, {
    password,
    expiresInDays: expiresInDays ?? undefined,
  });

  logAudit({
    userId: locals.user?.id,
    username: locals.user?.username,
    action: 'create_embed_token',
    category: 'project',
    resourceType: 'embed_token',
    resourceId: params.projectId,
    detail: { tokenId: result.id, hasPassword: !!password, expiresInDays },
    source: 'web',
  });

  return json(result, { status: 201 });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const err = checkProjectAccess(db, locals, params.projectId, 'editor');
  if (err) return err;

  const body = await request.json();
  const { tokenId } = body as { tokenId: string };

  deleteEmbedToken(db, tokenId);

  logAudit({
    userId: locals.user?.id,
    username: locals.user?.username,
    action: 'delete_embed_token',
    category: 'project',
    resourceType: 'embed_token',
    resourceId: params.projectId,
    detail: { tokenId },
    source: 'web',
  });

  return json({ ok: true });
};
