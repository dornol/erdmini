import { describe, it, expect, beforeEach } from 'vitest';
import { exportSvg } from './svg-export';
import { makeColumn, makeTable, makeMemo, makeSchema, resetIdCounter } from './test-helpers';

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

  // Memo tests
  describe('memo rendering', () => {
    it('renders SVG for memo-only schema (no tables)', () => {
      const schema = makeSchema([]);
      schema.memos = [makeMemo({ content: 'Hello', position: { x: 50, y: 50 } })];
      const result = exportSvg(schema, 'modern');
      expect(result).toContain('<svg');
      expect(result).toContain('</svg>');
    });

    it('returns empty for schema with no tables and no memos', () => {
      const result = exportSvg(makeSchema([]), 'modern');
      expect(result).toBe('');
    });

    it('includes memo content text', () => {
      const schema = makeSchema([]);
      schema.memos = [makeMemo({ content: 'Design notes here', position: { x: 0, y: 0 } })];
      const result = exportSvg(schema, 'modern');
      expect(result).toContain('Design notes here');
    });

    it('renders memo with yellow color by default', () => {
      const schema = makeSchema([]);
      schema.memos = [makeMemo({ position: { x: 0, y: 0 } })];
      const result = exportSvg(schema, 'modern');
      expect(result).toContain('#fef9c3'); // yellow bg
      expect(result).toContain('#facc15'); // yellow header
    });

    it('renders memo with specified color', () => {
      const schema = makeSchema([]);
      schema.memos = [makeMemo({ color: 'blue', position: { x: 0, y: 0 } })];
      const result = exportSvg(schema, 'modern');
      expect(result).toContain('#dbeafe'); // blue bg
      expect(result).toContain('#60a5fa'); // blue header
    });

    it('renders multiple memos', () => {
      const schema = makeSchema([]);
      schema.memos = [
        makeMemo({ content: 'Memo A', color: 'green', position: { x: 0, y: 0 } }),
        makeMemo({ content: 'Memo B', color: 'pink', position: { x: 300, y: 0 } }),
      ];
      const result = exportSvg(schema, 'modern');
      expect(result).toContain('Memo A');
      expect(result).toContain('Memo B');
      expect(result).toContain('#dcfce7'); // green bg
      expect(result).toContain('#fce7f3'); // pink bg
    });

    it('renders memos alongside tables', () => {
      const schema = singleTableSchema();
      schema.memos = [makeMemo({ content: 'Table notes', position: { x: 400, y: 100 } })];
      const result = exportSvg(schema, 'modern');
      expect(result).toContain('users');
      expect(result).toContain('Table notes');
    });

    it('handles empty memo content gracefully', () => {
      const schema = makeSchema([]);
      schema.memos = [makeMemo({ content: '', position: { x: 0, y: 0 } })];
      const result = exportSvg(schema, 'modern');
      expect(result).toContain('<svg');
      // Should not throw even with empty content
    });

    it('escapes special characters in memo content', () => {
      const schema = makeSchema([]);
      schema.memos = [makeMemo({ content: '<script>alert("xss")</script>', position: { x: 0, y: 0 } })];
      const result = exportSvg(schema, 'modern');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('includes memo bounds in SVG viewBox calculation', () => {
      const schema = makeSchema([]);
      schema.memos = [makeMemo({ position: { x: 500, y: 500 }, width: 200, height: 150 })];
      const result = exportSvg(schema, 'modern');
      // SVG should have enough size to encompass the memo at 500,500 + 200x150
      expect(result).toContain('<svg');
      const widthMatch = result.match(/width="(\d+)"/);
      const heightMatch = result.match(/height="(\d+)"/);
      expect(Number(widthMatch?.[1])).toBeGreaterThanOrEqual(200 + 80); // 200 + 2*PAD
      expect(Number(heightMatch?.[1])).toBeGreaterThanOrEqual(150 + 80);
    });

    it('handles multiline memo content', () => {
      const schema = makeSchema([]);
      schema.memos = [makeMemo({ content: 'Line 1\nLine 2\nLine 3', position: { x: 0, y: 0 }, height: 200 })];
      const result = exportSvg(schema, 'modern');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });
  });
});
