import { describe, it, expect, beforeEach } from 'vitest';
import { buildDictionaryData, exportDictionaryMarkdown, exportDictionaryHtml } from './domain-dictionary';
import { makeColumn, makeDomain, makeSchema, makeTable, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

describe('buildDictionaryData', () => {
  it('returns empty stats for empty schema', () => {
    const data = buildDictionaryData({ schema: makeSchema([]) });
    expect(data.stats.totalDomains).toBe(0);
    expect(data.stats.totalColumns).toBe(0);
    expect(data.stats.linkedColumns).toBe(0);
    expect(data.stats.coveragePercent).toBe(0);
    expect(data.groups).toHaveLength(0);
    expect(data.unlinkedColumns).toHaveLength(0);
  });

  it('computes correct stats', () => {
    const d1 = makeDomain({ id: 'd1', name: 'email_domain', type: 'VARCHAR', length: 255 });
    const col1 = makeColumn({ name: 'email', domainId: 'd1' });
    const col2 = makeColumn({ name: 'name' });
    const t1 = makeTable({ name: 'users', columns: [col1, col2] });
    const data = buildDictionaryData({ schema: makeSchema([t1], [d1]) });

    expect(data.stats.totalDomains).toBe(1);
    expect(data.stats.totalColumns).toBe(2);
    expect(data.stats.linkedColumns).toBe(1);
    expect(data.stats.coveragePercent).toBe(50);
  });

  it('groups domains by group field', () => {
    const d1 = makeDomain({ id: 'd1', name: 'id', group: 'Core' });
    const d2 = makeDomain({ id: 'd2', name: 'name', group: 'Core' });
    const d3 = makeDomain({ id: 'd3', name: 'status' });
    const data = buildDictionaryData({ schema: makeSchema([], [d1, d2, d3]) });

    expect(data.groups).toHaveLength(2);
    expect(data.groups[0].groupName).toBe('Core');
    expect(data.groups[0].entries).toHaveLength(2);
    expect(data.groups[1].groupName).toBe('Ungrouped');
    expect(data.groups[1].entries).toHaveLength(1);
  });

  it('collects unlinked columns', () => {
    const col1 = makeColumn({ name: 'age' });
    const col2 = makeColumn({ name: 'status' });
    const t1 = makeTable({ name: 'users', columns: [col1, col2] });
    const data = buildDictionaryData({ schema: makeSchema([t1]) });

    expect(data.unlinkedColumns).toHaveLength(2);
    expect(data.unlinkedColumns[0].tableName).toBe('users');
    expect(data.unlinkedColumns[0].columnName).toBe('age');
  });

  it('maps linked columns to domains', () => {
    const d1 = makeDomain({ id: 'd1', name: 'email_type' });
    const col1 = makeColumn({ name: 'email', domainId: 'd1' });
    const col2 = makeColumn({ name: 'work_email', domainId: 'd1' });
    const t1 = makeTable({ name: 'users', columns: [col1] });
    const t2 = makeTable({ name: 'contacts', columns: [col2] });
    const data = buildDictionaryData({ schema: makeSchema([t1, t2], [d1]) });

    const entry = data.groups[0].entries[0];
    expect(entry.linkedColumns).toHaveLength(2);
    expect(entry.linkedColumns[0]).toEqual({ tableName: 'users', columnName: 'email' });
    expect(entry.linkedColumns[1]).toEqual({ tableName: 'contacts', columnName: 'work_email' });
  });

  it('uses projectName from context', () => {
    const data = buildDictionaryData({ schema: makeSchema([]), projectName: 'MyDB' });
    expect(data.projectName).toBe('MyDB');
  });

  it('100% coverage when all columns linked', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom' });
    const col1 = makeColumn({ name: 'a', domainId: 'd1' });
    const col2 = makeColumn({ name: 'b', domainId: 'd1' });
    const t1 = makeTable({ name: 'tbl', columns: [col1, col2] });
    const data = buildDictionaryData({ schema: makeSchema([t1], [d1]) });
    expect(data.stats.coveragePercent).toBe(100);
  });

  it('0% coverage when no columns linked', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom' });
    const col1 = makeColumn({ name: 'a' });
    const t1 = makeTable({ name: 'tbl', columns: [col1] });
    const data = buildDictionaryData({ schema: makeSchema([t1], [d1]) });
    expect(data.stats.coveragePercent).toBe(0);
  });
});

describe('exportDictionaryMarkdown', () => {
  it('contains project name header', () => {
    const md = exportDictionaryMarkdown({ schema: makeSchema([]), projectName: 'TestDB' });
    expect(md).toContain('# TestDB — Domain Dictionary');
  });

  it('contains overview table', () => {
    const md = exportDictionaryMarkdown({ schema: makeSchema([]) });
    expect(md).toContain('## Overview');
    expect(md).toContain('Total Domains');
    expect(md).toContain('Coverage');
  });

  it('renders domain groups', () => {
    const d1 = makeDomain({ id: 'd1', name: 'user_id', group: 'Identity' });
    const md = exportDictionaryMarkdown({ schema: makeSchema([], [d1]) });
    expect(md).toContain('## Identity');
    expect(md).toContain('user_id');
  });

  it('renders domain type with length', () => {
    const d1 = makeDomain({ id: 'd1', name: 'price', type: 'DECIMAL', length: 10, scale: 2 });
    const md = exportDictionaryMarkdown({ schema: makeSchema([], [d1]) });
    expect(md).toContain('DECIMAL(10,2)');
  });

  it('renders linked columns', () => {
    const d1 = makeDomain({ id: 'd1', name: 'email' });
    const col = makeColumn({ name: 'email', domainId: 'd1' });
    const t = makeTable({ name: 'users', columns: [col] });
    const md = exportDictionaryMarkdown({ schema: makeSchema([t], [d1]) });
    expect(md).toContain('users.email');
  });

  it('renders unlinked columns section', () => {
    const col = makeColumn({ name: 'age' });
    const t = makeTable({ name: 'users', columns: [col] });
    const md = exportDictionaryMarkdown({ schema: makeSchema([t]) });
    expect(md).toContain('## Unlinked Columns');
    expect(md).toContain('users');
    expect(md).toContain('age');
  });

  it('empty schema produces valid markdown', () => {
    const md = exportDictionaryMarkdown({ schema: makeSchema([]) });
    expect(md).toContain('# ERD Project — Domain Dictionary');
    expect(md).toContain('| Total Domains | 0 |');
  });
});

describe('exportDictionaryHtml', () => {
  it('produces valid HTML structure', () => {
    const html = exportDictionaryHtml({ schema: makeSchema([]), projectName: 'TestDB' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>TestDB — Domain Dictionary</title>');
    expect(html).toContain('</html>');
  });

  it('contains TOC with group links', () => {
    const d1 = makeDomain({ id: 'd1', name: 'dom', group: 'Auth' });
    const html = exportDictionaryHtml({ schema: makeSchema([], [d1]) });
    expect(html).toContain('class="toc"');
    expect(html).toContain('href="#auth"');
    expect(html).toContain('Auth');
  });

  it('contains stats section', () => {
    const html = exportDictionaryHtml({ schema: makeSchema([]) });
    expect(html).toContain('Domains: 0');
    expect(html).toContain('Coverage: 0%');
  });

  it('renders group tables', () => {
    const d1 = makeDomain({ id: 'd1', name: 'user_id', group: 'Core', description: 'User identifier' });
    const html = exportDictionaryHtml({ schema: makeSchema([], [d1]) });
    expect(html).toContain('user_id');
    expect(html).toContain('User identifier');
  });

  it('escapes HTML entities', () => {
    const d1 = makeDomain({ id: 'd1', name: 'test<script>', description: '<b>bold</b>' });
    const html = exportDictionaryHtml({ schema: makeSchema([], [d1]) });
    expect(html).toContain('test&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
});
