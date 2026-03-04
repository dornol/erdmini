import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { deleteSession } from '$lib/server/auth/session';
import { logAudit } from '$lib/server/audit';

export const POST: RequestHandler = async ({ cookies, locals }) => {
  const user = (locals as any).user;
  const sessionId = cookies.get('erdmini_session');
  if (sessionId) {
    deleteSession(db, sessionId);
    cookies.delete('erdmini_session', { path: '/' });
  }

  if (user) {
    logAudit({ action: 'logout', category: 'auth', userId: user.id, username: user.username, source: 'web' });
  }

  return json({ ok: true });
};
