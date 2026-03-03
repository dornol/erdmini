import type { ColumnDomain, ERDSchema } from '$lib/types/erd';

export interface DictionaryContext {
  schema: ERDSchema;
  projectName?: string;
}

export interface DomainDictionaryEntry {
  domain: ColumnDomain;
  linkedColumns: { tableName: string; columnName: string }[];
}

export interface DomainGroupData {
  groupName: string;
  entries: DomainDictionaryEntry[];
}

export interface UnlinkedColumnInfo {
  tableName: string;
  columnName: string;
  type: string;
}

export interface DictionaryData {
  projectName: string;
  groups: DomainGroupData[];
  unlinkedColumns: UnlinkedColumnInfo[];
  stats: {
    totalDomains: number;
    totalColumns: number;
    linkedColumns: number;
    coveragePercent: number;
    groupCount: number;
  };
}

export function buildDictionaryData(ctx: DictionaryContext): DictionaryData {
  const { schema, projectName = 'ERD Project' } = ctx;
  const domains = schema.domains ?? [];

  // Build linked columns map
  const linkedMap = new Map<string, { tableName: string; columnName: string }[]>();
  const linkedColumnIds = new Set<string>();

  let totalColumns = 0;
  const unlinkedColumns: UnlinkedColumnInfo[] = [];

  for (const table of schema.tables) {
    for (const col of table.columns) {
      totalColumns++;
      if (col.domainId) {
        linkedColumnIds.add(col.id);
        const list = linkedMap.get(col.domainId) ?? [];
        list.push({ tableName: table.name, columnName: col.name });
        linkedMap.set(col.domainId, list);
      } else {
        unlinkedColumns.push({
          tableName: table.name,
          columnName: col.name,
          type: col.type + (col.length ? `(${col.length})` : ''),
        });
      }
    }
  }

  // Group domains
  const groupMap = new Map<string, DomainDictionaryEntry[]>();
  const UNGROUPED = '';

  for (const domain of domains) {
    const key = domain.group || UNGROUPED;
    const entries = groupMap.get(key) ?? [];
    entries.push({
      domain,
      linkedColumns: linkedMap.get(domain.id) ?? [],
    });
    groupMap.set(key, entries);
  }

  const groups: DomainGroupData[] = [...groupMap.entries()]
    .sort((a, b) => {
      if (a[0] === UNGROUPED) return 1;
      if (b[0] === UNGROUPED) return -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([name, entries]) => ({
      groupName: name || 'Ungrouped',
      entries,
    }));

  const linkedColumns = linkedColumnIds.size;
  const coveragePercent = totalColumns > 0 ? Math.round((linkedColumns / totalColumns) * 100) : 0;

  return {
    projectName,
    groups,
    unlinkedColumns,
    stats: {
      totalDomains: domains.length,
      totalColumns,
      linkedColumns,
      coveragePercent,
      groupCount: groups.length,
    },
  };
}

function domainTypeStr(d: ColumnDomain): string {
  let s = d.type;
  if (d.length) s += `(${d.length}${d.scale != null ? `,${d.scale}` : ''})`;
  return s;
}

export function exportDictionaryMarkdown(ctx: DictionaryContext): string {
  const data = buildDictionaryData(ctx);
  const lines: string[] = [];

  lines.push(`# ${data.projectName} — Domain Dictionary`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Domains | ${data.stats.totalDomains} |`);
  lines.push(`| Total Columns | ${data.stats.totalColumns} |`);
  lines.push(`| Linked Columns | ${data.stats.linkedColumns} |`);
  lines.push(`| Coverage | ${data.stats.coveragePercent}% |`);
  lines.push('');

  for (const group of data.groups) {
    lines.push(`## ${group.groupName}`);
    lines.push('');
    lines.push('| Name | Type | Nullable | Description | Linked Columns |');
    lines.push('|------|------|----------|-------------|----------------|');

    for (const entry of group.entries) {
      const d = entry.domain;
      const nullable = d.nullable ? 'YES' : 'NO';
      const desc = d.description || d.comment || '';
      const linked = entry.linkedColumns.length > 0
        ? entry.linkedColumns.map(c => `${c.tableName}.${c.columnName}`).join(', ')
        : '—';
      lines.push(`| ${d.name} | ${domainTypeStr(d)} | ${nullable} | ${desc} | ${linked} |`);
    }
    lines.push('');
  }

  if (data.unlinkedColumns.length > 0) {
    lines.push('## Unlinked Columns');
    lines.push('');
    lines.push('| Table | Column | Type |');
    lines.push('|-------|--------|------|');
    for (const col of data.unlinkedColumns) {
      lines.push(`| ${col.tableName} | ${col.columnName} | ${col.type} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function exportDictionaryHtml(ctx: DictionaryContext): string {
  const data = buildDictionaryData(ctx);

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const parts: string[] = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="en"><head><meta charset="UTF-8">');
  parts.push(`<title>${esc(data.projectName)} — Domain Dictionary</title>`);
  parts.push('<style>');
  parts.push('body{font-family:system-ui,-apple-system,sans-serif;max-width:960px;margin:0 auto;padding:20px;color:#1e293b}');
  parts.push('h1{font-size:24px;border-bottom:2px solid #3b82f6;padding-bottom:8px}');
  parts.push('h2{font-size:18px;color:#475569;margin-top:24px}');
  parts.push('table{border-collapse:collapse;width:100%;margin:12px 0}');
  parts.push('th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;font-size:13px}');
  parts.push('th{background:#f1f5f9;font-weight:600;color:#64748b}');
  parts.push('tr:nth-child(even){background:#f8fafc}');
  parts.push('.stat{display:inline-block;background:#eff6ff;padding:4px 12px;border-radius:6px;margin:4px;font-size:13px}');
  parts.push('.toc{background:#f8fafc;padding:12px 16px;border-radius:8px;margin:16px 0}');
  parts.push('.toc a{color:#3b82f6;text-decoration:none;margin-right:12px;font-size:13px}');
  parts.push('.toc a:hover{text-decoration:underline}');
  parts.push('</style></head><body>');

  parts.push(`<h1>${esc(data.projectName)} — Domain Dictionary</h1>`);

  // TOC
  parts.push('<div class="toc"><strong>Contents:</strong> ');
  for (const group of data.groups) {
    const anchor = group.groupName.toLowerCase().replace(/\s+/g, '-');
    parts.push(`<a href="#${esc(anchor)}">${esc(group.groupName)}</a>`);
  }
  if (data.unlinkedColumns.length > 0) {
    parts.push('<a href="#unlinked">Unlinked Columns</a>');
  }
  parts.push('</div>');

  // Stats
  parts.push('<div>');
  parts.push(`<span class="stat">Domains: ${data.stats.totalDomains}</span>`);
  parts.push(`<span class="stat">Columns: ${data.stats.totalColumns}</span>`);
  parts.push(`<span class="stat">Linked: ${data.stats.linkedColumns}</span>`);
  parts.push(`<span class="stat">Coverage: ${data.stats.coveragePercent}%</span>`);
  parts.push('</div>');

  for (const group of data.groups) {
    const anchor = group.groupName.toLowerCase().replace(/\s+/g, '-');
    parts.push(`<h2 id="${esc(anchor)}">${esc(group.groupName)}</h2>`);
    parts.push('<table><thead><tr><th>Name</th><th>Type</th><th>Nullable</th><th>Description</th><th>Linked Columns</th></tr></thead><tbody>');
    for (const entry of group.entries) {
      const d = entry.domain;
      const desc = d.description || d.comment || '';
      const linked = entry.linkedColumns.length > 0
        ? entry.linkedColumns.map(c => `${c.tableName}.${c.columnName}`).join(', ')
        : '—';
      parts.push(`<tr><td>${esc(d.name)}</td><td>${esc(domainTypeStr(d))}</td><td>${d.nullable ? 'YES' : 'NO'}</td><td>${esc(desc)}</td><td>${esc(linked)}</td></tr>`);
    }
    parts.push('</tbody></table>');
  }

  if (data.unlinkedColumns.length > 0) {
    parts.push('<h2 id="unlinked">Unlinked Columns</h2>');
    parts.push('<table><thead><tr><th>Table</th><th>Column</th><th>Type</th></tr></thead><tbody>');
    for (const col of data.unlinkedColumns) {
      parts.push(`<tr><td>${esc(col.tableName)}</td><td>${esc(col.columnName)}</td><td>${esc(col.type)}</td></tr>`);
    }
    parts.push('</tbody></table>');
  }

  parts.push('</body></html>');
  return parts.join('\n');
}
