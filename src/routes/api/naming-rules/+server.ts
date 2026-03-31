import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNamingRules } from '$lib/server/site-settings';

/** Public read-only endpoint — any authenticated user can fetch active naming rules */
export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  return json(getNamingRules());
};
