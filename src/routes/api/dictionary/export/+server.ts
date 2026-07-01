import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { listWords } from '$lib/server/dictionary';

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { words } = listWords(db, { dictionaryId: url.searchParams.get('dictionaryId') || undefined, limit: 100000 });
  return json(words);
};
