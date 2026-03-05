import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { hasProjectAccess } from '$lib/server/auth/permissions';
import { createEmbedToken, listEmbedTokens, deleteEmbedToken } from '$lib/server/embed';
import { logAudit } from '$lib/server/audit';

function getUserInfo(locals: App.Locals) {
  return {
    id: locals.user?.id ?? 'singleton',
    role: locals.user?.role ?? 'user',
    isLocal: !locals.user,
  };
}

export const GET: RequestHandler = ({ params, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.projectId, user.id, user.role, 'editor')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const tokens = listEmbedTokens(db, params.projectId);
  return json(tokens);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.projectId, user.id, user.role, 'editor')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { password, expiresInDays } = body as { password?: string; expiresInDays?: number };

  const result = await createEmbedToken(db, params.projectId, user.id, {
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
  const user = getUserInfo(locals);
  if (!user.isLocal && !hasProjectAccess(db, params.projectId, user.id, user.role, 'editor')) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

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
