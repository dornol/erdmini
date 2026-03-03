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
    Group: d.group ?? '',
    Name: d.name,
    Type: d.type,
    Length: d.length ?? '',
    Scale: d.scale ?? '',
    Nullable: boolToY(d.nullable),
    PrimaryKey: boolToY(d.primaryKey),
    Unique: boolToY(d.unique),
    AutoIncrement: boolToY(d.autoIncrement),
    Default: d.defaultValue ?? '',
    Check: d.check ?? '',
    EnumValues: d.enumValues?.join(', ') ?? '',
    Comment: d.comment ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Domains');
  XLSX.writeFile(wb, 'domains.xlsx');
}

export function exportDomainTemplate() {
  const example = [
    { Group: 'User', Name: 'user_id', Type: 'INT', Length: '', Scale: '', Nullable: '', PrimaryKey: 'Y', Unique: 'Y', AutoIncrement: 'Y', Default: '', Check: '', EnumValues: '', Comment: 'User PK' },
    { Group: 'User', Name: 'username', Type: 'VARCHAR', Length: 50, Scale: '', Nullable: '', PrimaryKey: '', Unique: 'Y', AutoIncrement: '', Default: '', Check: '', EnumValues: '', Comment: '' },
    { Group: '', Name: 'price', Type: 'DECIMAL', Length: 10, Scale: 2, Nullable: '', PrimaryKey: '', Unique: '', AutoIncrement: '', Default: '', Check: 'price >= 0', EnumValues: '', Comment: '' },
    { Group: '', Name: 'status', Type: 'ENUM', Length: '', Scale: '', Nullable: 'Y', PrimaryKey: '', Unique: '', AutoIncrement: '', Default: '', Check: '', EnumValues: 'active, inactive, pending', Comment: '' },
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
    const scale = row.Scale !== undefined && row.Scale !== '' ? Number(row.Scale) : undefined;

    const group = row.Group ? String(row.Group).trim() : undefined;

    const enumValuesRaw = row.EnumValues ? String(row.EnumValues).trim() : '';
    const enumValues = enumValuesRaw ? enumValuesRaw.split(',').map((v: string) => v.trim()).filter(Boolean) : undefined;

    results.push({
      name,
      group: group || undefined,
      type,
      length: length && !isNaN(length) ? length : undefined,
      scale: scale != null && !isNaN(scale) ? scale : undefined,
      nullable: yToBool(row.Nullable),
      primaryKey: yToBool(row.PrimaryKey),
      unique: yToBool(row.Unique),
      autoIncrement: yToBool(row.AutoIncrement),
      defaultValue: row.Default ? String(row.Default) : undefined,
      check: row.Check ? String(row.Check).trim() : undefined,
      enumValues,
      comment: row.Comment ? String(row.Comment) : undefined,
    });
  }

  return results;
}
