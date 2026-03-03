import { describe, it, expect, beforeEach } from 'vitest';
import { exportSvg } from './svg-export';
import { makeColumn, makeTable, makeSchema, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

function singleTableSchema() {
  return makeSchema([
    makeTable({
      name: 'users',
      columns: [
        makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ name: 'name', type: 'VARCHAR', nullable: false }),
        makeColumn({ name: 'email', type: 'VARCHAR', unique: true, nullable: true }),
      ],
      position: { x: 100, y: 100 },
    }),
  ]);
}

function schemaWithFK() {
  const userId = 'u_id';
  const orderUserId = 'o_user_id';

  return makeSchema([
    makeTable({
      id: 'tbl_users',
      name: 'users',
      columns: [
        makeColumn({ id: userId, name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ name: 'name', type: 'VARCHAR', nullable: false }),
      ],
      position: { x: 100, y: 100 },
    }),
    makeTable({
      id: 'tbl_orders',
      name: 'orders',
      columns: [
        makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ id: orderUserId, name: 'user_id', type: 'INT', nullable: false }),
      ],
      foreignKeys: [
        {
          id: 'fk_1',
          columnIds: [orderUserId],
          referencedTableId: 'tbl_users',
          referencedColumnIds: [userId],
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT',
        },
      ],
      position: { x: 400, y: 100 },
    }),
  ]);
}

describe('exportSvg', () => {
  it('returns empty string for empty schema', () => {
    const result = exportSvg(makeSchema([]), 'modern');
    expect(result).toBe('');
  });

  it('produces valid SVG root element', () => {
    const result = exportSvg(singleTableSchema(), 'modern');
    expect(result).toContain('<?xml version="1.0"');
    expect(result).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('</svg>');
  });

  it('includes table name in SVG', () => {
    const result = exportSvg(singleTableSchema(), 'modern');
    expect(result).toContain('users');
  });

  it('includes column names in SVG', () => {
    const result = exportSvg(singleTableSchema(), 'modern');
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).toContain('email');
  });

  it('includes PK badge', () => {
    const result = exportSvg(singleTableSchema(), 'modern');
    expect(result).toContain('>PK<');
  });

  it('generates SVG for all 4 themes', () => {
    const schema = singleTableSchema();
    for (const themeId of ['modern', 'classic', 'blueprint', 'minimal']) {
      const result = exportSvg(schema, themeId);
      expect(result, `Theme ${themeId} should produce SVG`).toContain('<svg');
    }
  });

  it('uses different background colors per theme', () => {
    const schema = singleTableSchema();
    const modern = exportSvg(schema, 'modern');
    const blueprint = exportSvg(schema, 'blueprint');
    // modern uses #f8fafc, blueprint uses #0c1a30
    expect(modern).toContain('#f8fafc');
    expect(blueprint).toContain('#0c1a30');
  });

  it('includes path elements when FK exists', () => {
    const result = exportSvg(schemaWithFK(), 'modern');
    expect(result).toContain('<path');
  });

  it('includes both table names when FK exists', () => {
    const result = exportSvg(schemaWithFK(), 'modern');
    expect(result).toContain('users');
    expect(result).toContain('orders');
  });

  it('falls back to modern theme for unknown themeId', () => {
    const result = exportSvg(singleTableSchema(), 'unknown_theme');
    expect(result).toContain('#f8fafc'); // modern background
  });

  it('handles table with comment', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
        position: { x: 0, y: 0 },
        comment: 'Test table',
      }),
    ]);
    const result = exportSvg(schema, 'modern');
    expect(result).toContain('Test table');
  });

  it('renders FK badge for FK columns', () => {
    const result = exportSvg(schemaWithFK(), 'modern');
    expect(result).toContain('>FK<');
  });
});
