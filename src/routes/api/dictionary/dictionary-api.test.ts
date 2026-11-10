import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockListWords, mockCountPendingWords, mockCreateWord } = vi.hoisted(() => ({
  mockListWords: vi.fn(),
  mockCountPendingWords: vi.fn(),
  mockCreateWord: vi.fn(),
}));

vi.mock('$lib/server/db', () => ({
  default: {},
}));

vi.mock('$lib/server/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('$lib/server/dictionary', () => ({
  listWords: mockListWords,
  countPendingWords: mockCountPendingWords,
  createWord: mockCreateWord,
}));

import { GET as dictionaryGet } from './+server';
import { _DICTIONARY_EXPORT_MAX_WORDS, GET as dictionaryExportGet } from './export/+server';

const user = { id: 'u1', username: 'user1', role: 'user' };
const admin = { id: 'admin1', username: 'admin', role: 'admin' };

function getEvent(path: string, currentUser: typeof user | typeof admin | null = user) {
  return {
    locals: { user: currentUser },
    url: new URL(path, 'http://localhost'),
  } as never;
}

async function jsonBody(res: Response) {
  return await res.json() as { error?: string };
}

describe('/api/dictionary', () => {
  beforeEach(() => {
    mockListWords.mockReset();
    mockCountPendingWords.mockReset();
    mockCreateWord.mockReset();
    mockListWords.mockReturnValue({ words: [], total: 0 });
    mockCountPendingWords.mockReturnValue(0);
  });

  it('rejects invalid status values', async () => {
    const res = await dictionaryGet(getEvent('/api/dictionary?status=deleted', admin));

    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: 'Invalid status' });
    expect(mockListWords).not.toHaveBeenCalled();
  });

  it('rejects invalid page values', async () => {
    const res = await dictionaryGet(getEvent('/api/dictionary?page=0'));

    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: 'Invalid page' });
  });

  it('allows limit zero for count-only reads', async () => {
    const res = await dictionaryGet(getEvent('/api/dictionary?limit=0'));

    expect(res.status).toBe(200);
    expect(mockListWords).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 0 }));
  });

  it('caps list limit to 200', async () => {
    const res = await dictionaryGet(getEvent('/api/dictionary?limit=999'));

    expect(res.status).toBe(200);
    expect(mockListWords).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 200 }));
  });
});

describe('/api/dictionary/export', () => {
  beforeEach(() => {
    mockListWords.mockReset();
  });

  it('rejects exports above the configured word limit', async () => {
    mockListWords.mockReturnValueOnce({ words: [], total: _DICTIONARY_EXPORT_MAX_WORDS + 1 });

    const res = await dictionaryExportGet(getEvent('/api/dictionary/export?dictionaryId=dict1'));

    expect(res.status).toBe(413);
    expect(await jsonBody(res)).toEqual({
      error: `Dictionary export is limited to ${_DICTIONARY_EXPORT_MAX_WORDS} words`,
    });
    expect(mockListWords).toHaveBeenCalledTimes(1);
    expect(mockListWords).toHaveBeenCalledWith(expect.anything(), { dictionaryId: 'dict1', limit: 0 });
  });

  it('exports words when the dictionary is within the limit', async () => {
    const words = [{ id: 'w1', word: 'acct', meaning: 'Account' }];
    mockListWords
      .mockReturnValueOnce({ words: [], total: 1 })
      .mockReturnValueOnce({ words, total: 1 });

    const res = await dictionaryExportGet(getEvent('/api/dictionary/export?dictionaryId=dict1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(words);
    expect(mockListWords).toHaveBeenNthCalledWith(1, expect.anything(), { dictionaryId: 'dict1', limit: 0 });
    expect(mockListWords).toHaveBeenNthCalledWith(2, expect.anything(), {
      dictionaryId: 'dict1',
      limit: _DICTIONARY_EXPORT_MAX_WORDS,
    });
  });
});
