import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDictionaryXlsx, type DictWordEntry } from './dictionary-xlsx';

function createXlsxBuffer(rows: Record<string, unknown>[], sheetName = 'Dictionary'): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return buf;
}

describe('parseDictionaryXlsx', () => {
  it('parses English headers (Word, Meaning, Description, Category)', () => {
    const buffer = createXlsxBuffer([
      { Word: 'seq', Meaning: '일련번호', Description: 'Sequence', Category: '접미어' },
      { Word: 'nm', Meaning: '명', Description: 'Name', Category: '접미어' },
    ]);
    const result = parseDictionaryXlsx(buffer);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ word: 'seq', meaning: '일련번호', description: 'Sequence', category: '접미어' });
    expect(result[1]).toEqual({ word: 'nm', meaning: '명', description: 'Name', category: '접미어' });
  });

  it('parses Korean headers (단어, 의미, 설명, 카테고리)', () => {
    const buffer = createXlsxBuffer([
      { '단어': 'goods', '의미': '상품', '설명': '', '카테고리': '업무용어' },
    ]);
    const result = parseDictionaryXlsx(buffer);
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('goods');
    expect(result[0].meaning).toBe('상품');
    expect(result[0].category).toBe('업무용어');
  });

  it('parses lowercase headers', () => {
    const buffer = createXlsxBuffer([
      { word: 'dt', meaning: '일자', description: 'Date', category: '접미어' },
    ]);
    const result = parseDictionaryXlsx(buffer);
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('dt');
  });

  it('skips rows with empty word', () => {
    const buffer = createXlsxBuffer([
      { Word: '', Meaning: 'should skip' },
      { Word: 'valid', Meaning: 'ok' },
    ]);
    const result = parseDictionaryXlsx(buffer);
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('valid');
  });

  it('skips rows with empty meaning', () => {
    const buffer = createXlsxBuffer([
      { Word: 'noMeaning', Meaning: '' },
      { Word: 'valid', Meaning: 'ok' },
    ]);
    const result = parseDictionaryXlsx(buffer);
    expect(result).toHaveLength(1);
  });

  it('handles null/missing description and category', () => {
    const buffer = createXlsxBuffer([
      { Word: 'test', Meaning: 'test meaning' },
    ]);
    const result = parseDictionaryXlsx(buffer);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBeNull();
    expect(result[0].category).toBeNull();
  });

  it('trims whitespace from all fields', () => {
    const buffer = createXlsxBuffer([
      { Word: '  seq  ', Meaning: '  일련번호  ', Description: '  desc  ', Category: '  cat  ' },
    ]);
    const result = parseDictionaryXlsx(buffer);
    expect(result[0].word).toBe('seq');
    expect(result[0].meaning).toBe('일련번호');
    expect(result[0].description).toBe('desc');
    expect(result[0].category).toBe('cat');
  });

  it('returns empty array for empty workbook', () => {
    const ws = XLSX.utils.aoa_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empty');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const result = parseDictionaryXlsx(buf);
    expect(result).toEqual([]);
  });

  it('handles large dataset', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      Word: `word_${i}`,
      Meaning: `meaning_${i}`,
      Category: i % 2 === 0 ? 'even' : 'odd',
    }));
    const buffer = createXlsxBuffer(rows);
    const result = parseDictionaryXlsx(buffer);
    expect(result).toHaveLength(500);
    expect(result[0].word).toBe('word_0');
    expect(result[499].word).toBe('word_499');
  });

  it('supports 분류 as category header alias', () => {
    const buffer = createXlsxBuffer([
      { '단어': 'cd', '의미': '코드', '분류': '접미어' },
    ]);
    const result = parseDictionaryXlsx(buffer);
    expect(result[0].category).toBe('접미어');
  });
});
