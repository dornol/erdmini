import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { validateDictShareToken, verifyDictSharePassword, listWords, listCategories } from '$lib/server/dictionary';
import { RateLimiter } from '$lib/server/auth/rate-limiter';

const dictPasswordLimiter = new RateLimiter({ maxAttempts: 10, windowMs: 15 * 60_000, maxMapSize: 1000 });
setInterval(() => dictPasswordLimiter.cleanup(), 5 * 60 * 1000);

function getDictionaryData() {
  const { words } = listWords(db, { limit: 100000 });
  const categories = listCategories(db);
  return { words, categories };
}

export const GET: RequestHandler = async ({ params }) => {
  const result = validateDictShareToken(db, params.token);
  if (!result) {
    return json({ error: 'Token expired or not found' }, { status: 403 });
  }

  if (result.hasPassword) {
    return json({ requiresPassword: true }, { status: 401 });
  }

  return json(getDictionaryData());
};

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
  const ip = getClientAddress();
  if (!dictPasswordLimiter.check(ip)) {
    return json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  const result = validateDictShareToken(db, params.token);
  if (!result) {
    return json({ error: 'Token expired or not found' }, { status: 403 });
  }

  if (!result.hasPassword) {
    return json({ error: 'This share does not require a password' }, { status: 400 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { password } = body;
  if (!password) {
    return json({ error: 'Password required', requiresPassword: true }, { status: 401 });
  }

  const valid = await verifyDictSharePassword(db, result.id, password);
  if (!valid) {
    return json({ error: 'Wrong password', requiresPassword: true }, { status: 401 });
  }

  return json(getDictionaryData());
};
