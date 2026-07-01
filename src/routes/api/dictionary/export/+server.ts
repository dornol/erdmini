import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { listWords } from '$lib/server/dictionary';
import { err } from '$lib/server/api-helpers';

export const _DICTIONARY_EXPORT_MAX_WORDS = 10000;

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const dictionaryId = url.searchParams.get('dictionaryId') || undefined;
  const { total } = listWords(db, { dictionaryId, limit: 0 });
  if (total > _DICTIONARY_EXPORT_MAX_WORDS) {
    return err(`Dictionary export is limited to ${_DICTIONARY_EXPORT_MAX_WORDS} words`, 413);
  }

  const { words } = listWords(db, { dictionaryId, limit: _DICTIONARY_EXPORT_MAX_WORDS });
  return json(words);
};
