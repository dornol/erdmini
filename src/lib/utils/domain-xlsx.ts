import * as XLSX from 'xlsx';
import type { ColumnDomain, ColumnType } from '$lib/types/erd';
import { normalizeType } from '$lib/utils/ddl-import';

function boolToY(v: boolean): string {
  return v ? 'Y' : '';
}

function yToBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'y' || s === '1' || s === 'true';
}

export function exportDomainsToXlsx(domains: ColumnDomain[]) {
  const rows = domains.map((d) => ({
    Name: d.name,
    Type: d.type,
    Length: d.length ?? '',
    Nullable: boolToY(d.nullable),
    PrimaryKey: boolToY(d.primaryKey),
    Unique: boolToY(d.unique),
    AutoIncrement: boolToY(d.autoIncrement),
    Default: d.defaultValue ?? '',
    Comment: d.comment ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Domains');
  XLSX.writeFile(wb, 'domains.xlsx');
}

export function exportDomainTemplate() {
  const example = [
    { Name: 'user_id', Type: 'INT', Length: '', Nullable: '', PrimaryKey: 'Y', Unique: 'Y', AutoIncrement: 'Y', Default: '', Comment: 'User PK' },
    { Name: 'username', Type: 'VARCHAR', Length: 50, Nullable: '', PrimaryKey: '', Unique: 'Y', AutoIncrement: '', Default: '', Comment: '' },
    { Name: 'email', Type: 'VARCHAR', Length: 255, Nullable: 'Y', PrimaryKey: '', Unique: '', AutoIncrement: '', Default: '', Comment: '' },
  ];

  const ws = XLSX.utils.json_to_sheet(example);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Domains');
  XLSX.writeFile(wb, 'domains_template.xlsx');
}

export async function importDomainsFromXlsx(
  file: File,
): Promise<Omit<ColumnDomain, 'id'>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = XLSX.utils.sheet_to_json(ws);

  const results: Omit<ColumnDomain, 'id'>[] = [];
  for (const row of rows) {
    const name = String(row.Name ?? '').trim();
    if (!name) continue;

    const rawType = String(row.Type ?? 'VARCHAR').trim();
    const type: ColumnType = normalizeType(rawType);
    const length = row.Length !== undefined && row.Length !== '' ? Number(row.Length) : undefined;

    results.push({
      name,
      type,
      length: length && !isNaN(length) ? length : undefined,
      nullable: yToBool(row.Nullable),
      primaryKey: yToBool(row.PrimaryKey),
      unique: yToBool(row.Unique),
      autoIncrement: yToBool(row.AutoIncrement),
      defaultValue: row.Default ? String(row.Default) : undefined,
      comment: row.Comment ? String(row.Comment) : undefined,
    });
  }

  return results;
}
