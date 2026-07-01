import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { validateDictShareToken, verifyDictSharePassword, listWords, listCategories } from '$lib/server/dictionary';
import { RateLimiter } from '$lib/server/auth/rate-limiter';

const dictPasswordLimiter = new RateLimiter({ maxAttempts: 10, windowMs: 15 * 60_000, maxMapSize: 1000 });
setInterval(() => dictPasswordLimiter.cleanup(), 5 * 60 * 1000);

const DICTIONARY_SHARE_MAX_WORDS = 10000;

function getDictionaryData(dictionaryId: string) {
  const { total } = listWords(db, { dictionaryId, limit: 0 });
  if (total > DICTIONARY_SHARE_MAX_WORDS) {
    return json({ error: `Dictionary share is limited to ${DICTIONARY_SHARE_MAX_WORDS} words` }, { status: 413 });
  }

  const { words } = listWords(db, { dictionaryId, limit: DICTIONARY_SHARE_MAX_WORDS });
  const categories = listCategories(db, dictionaryId);
  return json({ words, categories });
}

export const GET: RequestHandler = async ({ params }) => {
  const result = validateDictShareToken(db, params.token);
  if (!result) {
    return json({ error: 'Token expired or not found' }, { status: 403 });
  }

  if (result.hasPassword) {
    return json({ requiresPassword: true }, { status: 401 });
  }

  return getDictionaryData(result.dictionaryId);
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

  return getDictionaryData(result.dictionaryId);
};
