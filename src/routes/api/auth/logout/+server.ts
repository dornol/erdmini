import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { deleteSession } from '$lib/server/auth/session';

export const POST: RequestHandler = async ({ cookies, locals }) => {
  const sessionId = cookies.get('erdmini_session');
  if (sessionId) {
    deleteSession(db, sessionId);
    cookies.delete('erdmini_session', { path: '/' });
  }

  return json({ ok: true });
};
