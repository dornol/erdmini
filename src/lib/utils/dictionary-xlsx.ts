import * as XLSX from 'xlsx';

export interface DictWordEntry {
  word: string;
  meaning: string;
  description?: string | null;
  category?: string | null;
}

export function exportDictionaryXlsx(words: DictWordEntry[], filename = 'word-dictionary.xlsx') {
  const rows = words.map((w) => ({
    Word: w.word,
    Meaning: w.meaning,
    Description: w.description ?? '',
    Category: w.category ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, // Word
    { wch: 30 }, // Meaning
    { wch: 40 }, // Description
    { wch: 15 }, // Category
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dictionary');
  XLSX.writeFile(wb, filename);
}

export function exportDictionaryTemplate() {
  const examples: DictWordEntry[] = [
    { word: 'seq', meaning: '일련번호', description: 'Sequence number', category: '접미어' },
    { word: 'nm', meaning: '명', description: 'Name', category: '접미어' },
    { word: 'dt', meaning: '일자', description: 'Date', category: '접미어' },
    { word: 'cd', meaning: '코드', description: 'Code', category: '접미어' },
    { word: 'yn', meaning: '여부', description: 'Yes/No flag', category: '접미어' },
    { word: 'goods', meaning: '상품', description: '', category: '업무용어' },
    { word: 'cust', meaning: '고객', description: '', category: '업무용어' },
  ];
  exportDictionaryXlsx(examples, 'word-dictionary-template.xlsx');
}

export function parseDictionaryXlsx(buffer: ArrayBuffer): DictWordEntry[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  const result: DictWordEntry[] = [];

  for (const row of rows) {
    // Support both English and Korean headers
    const word = String(row['Word'] ?? row['word'] ?? row['단어'] ?? '').trim();
    const meaning = String(row['Meaning'] ?? row['meaning'] ?? row['의미'] ?? '').trim();
    const description = String(row['Description'] ?? row['description'] ?? row['설명'] ?? '').trim() || null;
    const category = String(row['Category'] ?? row['category'] ?? row['카테고리'] ?? row['분류'] ?? '').trim() || null;

    if (word && meaning) {
      result.push({ word, meaning, description, category });
    }
  }

  return result;
}
