import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/guards';
import { getSiteSettings, updateSiteSettings } from '$lib/server/site-settings';
import { logAudit } from '$lib/server/audit';

export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  return json(getSiteSettings());
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const body = await request.json();
  const updated = updateSiteSettings(body);

  logAudit({
    action: 'update',
    category: 'system',
    userId: locals.user!.id,
    username: locals.user!.username,
    detail: { settings: updated },
    source: 'web',
  });

  return json(updated);
};
