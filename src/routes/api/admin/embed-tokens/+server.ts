import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/guards';
import { deleteEmbedToken } from '$lib/server/embed';
import { logAudit } from '$lib/server/audit';

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const tokens = db.prepare(`
    SELECT et.id, et.project_id, et.token, et.password_hash, et.created_by, et.created_at, et.expires_at,
           u.display_name AS creator_name, u.username AS creator_username
    FROM embed_tokens et
    LEFT JOIN users u ON u.id = et.created_by
    ORDER BY et.created_at DESC
  `).all() as Array<{
    id: string;
    project_id: string;
    token: string;
    password_hash: string | null;
    created_by: string;
    created_at: string;
    expires_at: string | null;
    creator_name: string | null;
    creator_username: string | null;
  }>;

  // Resolve project names
  const projectNames = new Map<string, string>();
  const indexRows = db.prepare('SELECT data FROM project_index').all() as { data: string }[];
  for (const row of indexRows) {
    try {
      const parsed = JSON.parse(row.data);
      for (const p of parsed.projects ?? []) {
        projectNames.set(p.id, p.name);
      }
    } catch { /* skip */ }
  }

  const result = tokens.map(t => ({
    id: t.id,
    projectId: t.project_id,
    projectName: projectNames.get(t.project_id) ?? t.project_id,
    token: t.token,
    hasPassword: !!t.password_hash,
    createdBy: t.creator_name ?? t.created_by,
    creatorUsername: t.creator_username,
    createdAt: t.created_at,
    expiresAt: t.expires_at,
  }));

  return json(result);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const { tokenId } = await request.json();
  if (!tokenId) return json({ error: 'tokenId required' }, { status: 400 });

  deleteEmbedToken(db, tokenId);

  logAudit({
    action: 'delete_embed_token',
    category: 'project',
    userId: locals.user!.id,
    username: locals.user!.username,
    resourceType: 'embed_token',
    resourceId: tokenId,
    source: 'web',
  });

  return json({ ok: true });
};
