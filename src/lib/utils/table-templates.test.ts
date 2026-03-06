import { describe, it, expect } from 'vitest';
import { TABLE_TEMPLATES } from './table-templates';
import type { TableTemplate } from './table-templates';

describe('TABLE_TEMPLATES', () => {
  it('has 5 templates', () => {
    expect(TABLE_TEMPLATES).toHaveLength(5);
  });

  it('all templates have unique ids', () => {
    const ids = TABLE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all templates have unique table names', () => {
    const names = TABLE_TEMPLATES.map((t) => t.tableName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all templates have at least one column', () => {
    for (const tpl of TABLE_TEMPLATES) {
      expect(tpl.columns.length, `${tpl.id} should have columns`).toBeGreaterThan(0);
    }
  });

  it('all templates have required fields on each column', () => {
    for (const tpl of TABLE_TEMPLATES) {
      for (const col of tpl.columns) {
        expect(col.name, `${tpl.id} column should have name`).toBeTruthy();
        expect(col.type, `${tpl.id}/${col.name} should have type`).toBeTruthy();
        expect(typeof col.nullable).toBe('boolean');
        expect(typeof col.primaryKey).toBe('boolean');
        expect(typeof col.unique).toBe('boolean');
        expect(typeof col.autoIncrement).toBe('boolean');
      }
    }
  });

  it('all templates have at least one primary key column', () => {
    for (const tpl of TABLE_TEMPLATES) {
      const hasPK = tpl.columns.some((c) => c.primaryKey);
      expect(hasPK, `${tpl.id} should have a PK`).toBe(true);
    }
  });

  it('columns have no id field (Omit<Column, "id">)', () => {
    for (const tpl of TABLE_TEMPLATES) {
      for (const col of tpl.columns) {
        expect((col as Record<string, unknown>).id, `${tpl.id}/${col.name} should not have id`).toBeUndefined();
      }
    }
  });

  describe('users template', () => {
    let tpl: TableTemplate;
    it('exists', () => {
      tpl = TABLE_TEMPLATES.find((t) => t.id === 'users')!;
      expect(tpl).toBeDefined();
    });

    it('has expected columns', () => {
      tpl = TABLE_TEMPLATES.find((t) => t.id === 'users')!;
      const names = tpl.columns.map((c) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('email');
      expect(names).toContain('password_hash');
      expect(names).toContain('created_at');
    });

    it('email is unique', () => {
      tpl = TABLE_TEMPLATES.find((t) => t.id === 'users')!;
      const email = tpl.columns.find((c) => c.name === 'email')!;
      expect(email.unique).toBe(true);
    });

    it('id is auto-increment PK', () => {
      tpl = TABLE_TEMPLATES.find((t) => t.id === 'users')!;
      const id = tpl.columns.find((c) => c.name === 'id')!;
      expect(id.primaryKey).toBe(true);
      expect(id.autoIncrement).toBe(true);
    });
  });

  describe('settings template', () => {
    it('uses key as PK (not auto-increment)', () => {
      const tpl = TABLE_TEMPLATES.find((t) => t.id === 'settings')!;
      const key = tpl.columns.find((c) => c.name === 'key')!;
      expect(key.primaryKey).toBe(true);
      expect(key.autoIncrement).toBe(false);
      expect(key.type).toBe('VARCHAR');
    });
  });

  describe('files template', () => {
    it('uses UUID as PK', () => {
      const tpl = TABLE_TEMPLATES.find((t) => t.id === 'files')!;
      const id = tpl.columns.find((c) => c.name === 'id')!;
      expect(id.type).toBe('UUID');
      expect(id.primaryKey).toBe(true);
    });
  });

  describe('tags template', () => {
    it('has unique name and slug', () => {
      const tpl = TABLE_TEMPLATES.find((t) => t.id === 'tags')!;
      expect(tpl.columns.find((c) => c.name === 'name')!.unique).toBe(true);
      expect(tpl.columns.find((c) => c.name === 'slug')!.unique).toBe(true);
    });
  });
});
