import { parseDomainDimension, DOMAIN_LENGTH_RANGE, DOMAIN_SCALE_RANGE } from './domain-dimensions';
import * as XLSX from 'xlsx';
import type { ColumnDomain, ColumnType } from '$lib/types/erd';
import { normalizeType } from '$lib/utils/ddl-import';
import { downloadXlsx } from './xlsx-download';

function boolToY(v: boolean): string {
  return v ? 'Y' : '';
}

function yToBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'y' || s === '1' || s === 'true';
}

function cellText(value: unknown, trim = false): string | undefined {
  if (value == null) return undefined;
  const text = trim ? String(value).trim() : String(value);
  return text || undefined;
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
    Description: d.description ?? '',
    Alias: d.alias ?? '',
    DataStandard: d.dataStandard ?? '',
    Example: d.example ?? '',
    ValidRange: d.validRange ?? '',
    Owner: d.owner ?? '',
    Tags: d.tags?.join(', ') ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Domains');
  downloadXlsx(wb, 'domains.xlsx');
}

export function exportDomainTemplate() {
  const example = [
    { Group: 'User', Name: 'user_id', Type: 'INT', Length: '', Scale: '', Nullable: '', PrimaryKey: 'Y', Unique: 'Y', AutoIncrement: 'Y', Default: '', Check: '', EnumValues: '', Comment: 'User PK', Description: '', Alias: '', DataStandard: '', Example: '1', ValidRange: '', Owner: '', Tags: '' },
    { Group: 'User', Name: 'username', Type: 'VARCHAR', Length: 50, Scale: '', Nullable: '', PrimaryKey: '', Unique: 'Y', AutoIncrement: '', Default: '', Check: '', EnumValues: '', Comment: '', Description: 'Login username', Alias: 'User Name', DataStandard: '', Example: 'john_doe', ValidRange: '1-50 chars', Owner: 'Auth Team', Tags: 'auth, identity' },
    { Group: '', Name: 'price', Type: 'DECIMAL', Length: 10, Scale: 2, Nullable: '', PrimaryKey: '', Unique: '', AutoIncrement: '', Default: '', Check: 'price >= 0', EnumValues: '', Comment: '', Description: '', Alias: '', DataStandard: '', Example: '29.99', ValidRange: '0-999999.99', Owner: '', Tags: '' },
    { Group: '', Name: 'status', Type: 'ENUM', Length: '', Scale: '', Nullable: 'Y', PrimaryKey: '', Unique: '', AutoIncrement: '', Default: '', Check: '', EnumValues: 'active, inactive, pending', Comment: '', Description: '', Alias: '', DataStandard: '', Example: 'active', ValidRange: '', Owner: '', Tags: '' },
  ];

  const ws = XLSX.utils.json_to_sheet(example);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Domains');
  downloadXlsx(wb, 'domains_template.xlsx');
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
    const length = parseDomainDimension(row.Length, DOMAIN_LENGTH_RANGE);
    const scale = parseDomainDimension(row.Scale, DOMAIN_SCALE_RANGE);

    const group = cellText(row.Group, true);

    const enumValuesRaw = cellText(row.EnumValues, true) ?? '';
    const enumValues = enumValuesRaw ? enumValuesRaw.split(',').map((v: string) => v.trim()).filter(Boolean) : undefined;

    const tagsRaw = cellText(row.Tags, true) ?? '';
    const tags = tagsRaw ? tagsRaw.split(',').map((v: string) => v.trim()).filter(Boolean) : undefined;

    results.push({
      name,
      group: group || undefined,
      type,
      length,
      scale,
      nullable: yToBool(row.Nullable),
      primaryKey: yToBool(row.PrimaryKey),
      unique: yToBool(row.Unique),
      autoIncrement: yToBool(row.AutoIncrement),
      defaultValue: cellText(row.Default),
      check: cellText(row.Check, true),
      enumValues,
      comment: cellText(row.Comment),
      description: cellText(row.Description, true),
      alias: cellText(row.Alias, true),
      dataStandard: cellText(row.DataStandard, true),
      example: cellText(row.Example, true),
      validRange: cellText(row.ValidRange, true),
      owner: cellText(row.Owner, true),
      tags,
    });
  }

  return results;
}
