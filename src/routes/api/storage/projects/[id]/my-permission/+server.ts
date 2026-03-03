import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { getProjectPermission } from '$lib/server/auth/permissions';

export const GET: RequestHandler = ({ params, locals }) => {
  if (!locals.user) {
    return json({ permission: null });
  }

  const permission = getProjectPermission(db, params.id, locals.user.id, locals.user.role);
  return json({ permission });
};
