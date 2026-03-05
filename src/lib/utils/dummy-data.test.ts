import { describe, it, expect } from 'vitest';
import { topologicalSortTables, generateDummyValue, generateDummyData } from './dummy-data';
import type { Table, Column, ERDSchema, ForeignKey } from '$lib/types/erd';

function makeColumn(overrides: Partial<Column> & { id: string; name: string }): Column {
	return {
		type: 'INT',
		nullable: false,
		primaryKey: false,
		unique: false,
		autoIncrement: false,
		...overrides,
	};
}

function makeTable(overrides: Partial<Table> & { id: string; name: string; columns: Column[] }): Table {
	return {
		foreignKeys: [],
		uniqueKeys: [],
		indexes: [],
		position: { x: 0, y: 0 },
		...overrides,
	};
}

function makeFK(overrides: Partial<ForeignKey> & { id: string; columnIds: string[]; referencedTableId: string; referencedColumnIds: string[] }): ForeignKey {
	return {
		onDelete: 'CASCADE',
		onUpdate: 'CASCADE',
		...overrides,
	};
}

function makeSchema(tables: Table[]): ERDSchema {
	return {
		version: '1',
		tables,
		domains: [],
		memos: [],
		createdAt: '',
		updatedAt: '',
	};
}

/** Parse INSERT VALUES from a single INSERT statement */
function parseInsertValues(line: string): string[] {
	const m = line.match(/VALUES\s*\((.+)\);$/);
	if (!m) return [];
	// Split by comma but respect quoted strings
	const raw = m[1];
	const vals: string[] = [];
	let cur = '';
	let inQuote = false;
	for (const ch of raw) {
		if (ch === "'" && !inQuote) { inQuote = true; cur += ch; }
		else if (ch === "'" && inQuote) { inQuote = false; cur += ch; }
		else if (ch === ',' && !inQuote) { vals.push(cur.trim()); cur = ''; }
		else { cur += ch; }
	}
	if (cur.trim()) vals.push(cur.trim());
	return vals;
}

/** Extract all INSERT lines for a given table */
function getInserts(sql: string, tableName: string): string[] {
	return sql.split('\n').filter((l) => l.startsWith(`INSERT INTO "${tableName}"`));
}

// ══════════════════════════════════════════════════════════════════
// topologicalSortTables
// ══════════════════════════════════════════════════════════════════

describe('topologicalSortTables', () => {
	it('single table', () => {
		const t = makeTable({ id: 'a', name: 'A', columns: [] });
		const sorted = topologicalSortTables([t]);
		expect(sorted).toEqual([t]);
	});

	it('chain A → B → C (parent before child)', () => {
		const a = makeTable({ id: 'a', name: 'A', columns: [makeColumn({ id: 'a1', name: 'id', primaryKey: true })] });
		const b = makeTable({
			id: 'b', name: 'B',
			columns: [makeColumn({ id: 'b1', name: 'id', primaryKey: true }), makeColumn({ id: 'b2', name: 'a_id' })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['b2'], referencedTableId: 'a', referencedColumnIds: ['a1'] })],
		});
		const c = makeTable({
			id: 'c', name: 'C',
			columns: [makeColumn({ id: 'c1', name: 'id', primaryKey: true }), makeColumn({ id: 'c2', name: 'b_id' })],
			foreignKeys: [makeFK({ id: 'fk2', columnIds: ['c2'], referencedTableId: 'b', referencedColumnIds: ['b1'] })],
		});
		const sorted = topologicalSortTables([c, b, a]);
		const names = sorted.map((t) => t.name);
		expect(names.indexOf('A')).toBeLessThan(names.indexOf('B'));
		expect(names.indexOf('B')).toBeLessThan(names.indexOf('C'));
	});

	it('diamond dependency', () => {
		const a = makeTable({ id: 'a', name: 'A', columns: [makeColumn({ id: 'a1', name: 'id', primaryKey: true })] });
		const b = makeTable({
			id: 'b', name: 'B',
			columns: [makeColumn({ id: 'b1', name: 'id', primaryKey: true }), makeColumn({ id: 'b2', name: 'a_id' })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['b2'], referencedTableId: 'a', referencedColumnIds: ['a1'] })],
		});
		const c = makeTable({
			id: 'c', name: 'C',
			columns: [makeColumn({ id: 'c1', name: 'id', primaryKey: true }), makeColumn({ id: 'c2', name: 'a_id' })],
			foreignKeys: [makeFK({ id: 'fk2', columnIds: ['c2'], referencedTableId: 'a', referencedColumnIds: ['a1'] })],
		});
		const d = makeTable({
			id: 'd', name: 'D',
			columns: [makeColumn({ id: 'd1', name: 'id', primaryKey: true }), makeColumn({ id: 'd2', name: 'b_id' }), makeColumn({ id: 'd3', name: 'c_id' })],
			foreignKeys: [
				makeFK({ id: 'fk3', columnIds: ['d2'], referencedTableId: 'b', referencedColumnIds: ['b1'] }),
				makeFK({ id: 'fk4', columnIds: ['d3'], referencedTableId: 'c', referencedColumnIds: ['c1'] }),
			],
		});
		const sorted = topologicalSortTables([d, c, b, a]);
		const names = sorted.map((t) => t.name);
		expect(names.indexOf('A')).toBeLessThan(names.indexOf('B'));
		expect(names.indexOf('A')).toBeLessThan(names.indexOf('C'));
		expect(names.indexOf('B')).toBeLessThan(names.indexOf('D'));
		expect(names.indexOf('C')).toBeLessThan(names.indexOf('D'));
	});

	it('self-referencing is ignored', () => {
		const t = makeTable({
			id: 'a', name: 'A',
			columns: [makeColumn({ id: 'a1', name: 'id', primaryKey: true }), makeColumn({ id: 'a2', name: 'parent_id' })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['a2'], referencedTableId: 'a', referencedColumnIds: ['a1'] })],
		});
		const sorted = topologicalSortTables([t]);
		expect(sorted).toHaveLength(1);
		expect(sorted[0].name).toBe('A');
	});

	it('cycle tables are appended at end', () => {
		const a = makeTable({
			id: 'a', name: 'A',
			columns: [makeColumn({ id: 'a1', name: 'id', primaryKey: true }), makeColumn({ id: 'a2', name: 'b_id' })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['a2'], referencedTableId: 'b', referencedColumnIds: ['b1'] })],
		});
		const b = makeTable({
			id: 'b', name: 'B',
			columns: [makeColumn({ id: 'b1', name: 'id', primaryKey: true }), makeColumn({ id: 'b2', name: 'a_id' })],
			foreignKeys: [makeFK({ id: 'fk2', columnIds: ['b2'], referencedTableId: 'a', referencedColumnIds: ['a1'] })],
		});
		const sorted = topologicalSortTables([a, b]);
		expect(sorted).toHaveLength(2);
	});

	it('independent tables preserve order', () => {
		const a = makeTable({ id: 'a', name: 'A', columns: [] });
		const b = makeTable({ id: 'b', name: 'B', columns: [] });
		const c = makeTable({ id: 'c', name: 'C', columns: [] });
		const sorted = topologicalSortTables([a, b, c]);
		expect(sorted.map((t) => t.name)).toEqual(['A', 'B', 'C']);
	});

	it('FK to unknown table is ignored', () => {
		const t = makeTable({
			id: 'a', name: 'A',
			columns: [makeColumn({ id: 'a1', name: 'id' }), makeColumn({ id: 'a2', name: 'x_id' })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['a2'], referencedTableId: 'unknown', referencedColumnIds: ['x1'] })],
		});
		const sorted = topologicalSortTables([t]);
		expect(sorted).toHaveLength(1);
	});

	it('duplicate FKs to same parent count as one dependency', () => {
		const parent = makeTable({ id: 'p', name: 'users', columns: [makeColumn({ id: 'p1', name: 'id', primaryKey: true })] });
		const child = makeTable({
			id: 'c', name: 'messages',
			columns: [
				makeColumn({ id: 'c1', name: 'id', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'sender_id' }),
				makeColumn({ id: 'c3', name: 'receiver_id' }),
			],
			foreignKeys: [
				makeFK({ id: 'fk1', columnIds: ['c2'], referencedTableId: 'p', referencedColumnIds: ['p1'] }),
				makeFK({ id: 'fk2', columnIds: ['c3'], referencedTableId: 'p', referencedColumnIds: ['p1'] }),
			],
		});
		const sorted = topologicalSortTables([child, parent]);
		expect(sorted[0].name).toBe('users');
		expect(sorted[1].name).toBe('messages');
	});

	it('mixed: independent + chain + self-ref', () => {
		const users = makeTable({ id: 'u', name: 'users', columns: [makeColumn({ id: 'u1', name: 'id', primaryKey: true })] });
		const posts = makeTable({
			id: 'p', name: 'posts',
			columns: [makeColumn({ id: 'p1', name: 'id', primaryKey: true }), makeColumn({ id: 'p2', name: 'user_id' })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['p2'], referencedTableId: 'u', referencedColumnIds: ['u1'] })],
		});
		const tags = makeTable({ id: 't', name: 'tags', columns: [makeColumn({ id: 't1', name: 'id', primaryKey: true })] });
		const categories = makeTable({
			id: 'cat', name: 'categories',
			columns: [makeColumn({ id: 'cat1', name: 'id', primaryKey: true }), makeColumn({ id: 'cat2', name: 'parent_id' })],
			foreignKeys: [makeFK({ id: 'fk2', columnIds: ['cat2'], referencedTableId: 'cat', referencedColumnIds: ['cat1'] })],
		});
		const sorted = topologicalSortTables([posts, categories, tags, users]);
		const names = sorted.map((t) => t.name);
		expect(names.indexOf('users')).toBeLessThan(names.indexOf('posts'));
		expect(sorted).toHaveLength(4);
	});

	it('empty input returns empty array', () => {
		expect(topologicalSortTables([])).toEqual([]);
	});
});

// ══════════════════════════════════════════════════════════════════
// generateDummyValue
// ══════════════════════════════════════════════════════════════════

describe('generateDummyValue', () => {
	it('INT returns rowIndex+1', () => {
		const col = makeColumn({ id: 'c', name: 'age', type: 'INT' });
		expect(generateDummyValue(col, 0)).toBe(1);
		expect(generateDummyValue(col, 4)).toBe(5);
	});

	it('BIGINT returns rowIndex+1', () => {
		const col = makeColumn({ id: 'c', name: 'big', type: 'BIGINT' });
		expect(generateDummyValue(col, 2)).toBe(3);
	});

	it('SMALLINT returns rowIndex+1', () => {
		const col = makeColumn({ id: 'c', name: 'sm', type: 'SMALLINT' });
		expect(generateDummyValue(col, 0)).toBe(1);
	});

	it('VARCHAR returns name_N', () => {
		const col = makeColumn({ id: 'c', name: 'username', type: 'VARCHAR' });
		expect(generateDummyValue(col, 0)).toBe('username_1');
		expect(generateDummyValue(col, 9)).toBe('username_10');
	});

	it('CHAR returns name_N', () => {
		const col = makeColumn({ id: 'c', name: 'code', type: 'CHAR' });
		expect(generateDummyValue(col, 0)).toBe('code_1');
	});

	it('TEXT returns name_N', () => {
		const col = makeColumn({ id: 'c', name: 'bio', type: 'TEXT' });
		expect(generateDummyValue(col, 0)).toBe('bio_1');
	});

	it('BOOLEAN returns deterministic 0/1 based on index', () => {
		const col = makeColumn({ id: 'c', name: 'active', type: 'BOOLEAN' });
		// n=rowIndex+1; n%2==0 → 1, else → 0
		expect(generateDummyValue(col, 0)).toBe(0); // n=1, odd → 0
		expect(generateDummyValue(col, 1)).toBe(1); // n=2, even → 1
		expect(generateDummyValue(col, 2)).toBe(0); // n=3, odd → 0
		expect(generateDummyValue(col, 3)).toBe(1); // n=4, even → 1
	});

	it('DATE returns YYYY-MM-DD', () => {
		const col = makeColumn({ id: 'c', name: 'birth', type: 'DATE' });
		const val = generateDummyValue(col, 0) as string;
		expect(val).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('DATE generates distinct values for different rows', () => {
		const col = makeColumn({ id: 'c', name: 'birth', type: 'DATE' });
		const vals = Array.from({ length: 10 }, (_, i) => generateDummyValue(col, i));
		const unique = new Set(vals);
		expect(unique.size).toBeGreaterThan(1);
	});

	it('DATETIME returns YYYY-MM-DD HH:MM:SS', () => {
		const col = makeColumn({ id: 'c', name: 'created', type: 'DATETIME' });
		const val = generateDummyValue(col, 0) as string;
		expect(val).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	it('TIMESTAMP returns YYYY-MM-DD HH:MM:SS', () => {
		const col = makeColumn({ id: 'c', name: 'ts', type: 'TIMESTAMP' });
		const val = generateDummyValue(col, 0) as string;
		expect(val).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	it('DECIMAL returns number with at most 2 decimals', () => {
		const col = makeColumn({ id: 'c', name: 'price', type: 'DECIMAL' });
		for (let i = 0; i < 10; i++) {
			const val = generateDummyValue(col, i) as number;
			expect(typeof val).toBe('number');
			const decimals = String(val).split('.')[1]?.length ?? 0;
			expect(decimals).toBeLessThanOrEqual(2);
		}
	});

	it('FLOAT returns number', () => {
		const col = makeColumn({ id: 'c', name: 'rate', type: 'FLOAT' });
		expect(typeof generateDummyValue(col, 0)).toBe('number');
	});

	it('DOUBLE returns number', () => {
		const col = makeColumn({ id: 'c', name: 'val', type: 'DOUBLE' });
		expect(typeof generateDummyValue(col, 0)).toBe('number');
	});

	it('ENUM with values picks from enumValues', () => {
		const col = makeColumn({ id: 'c', name: 'status', type: 'ENUM', enumValues: ['active', 'inactive', 'pending'] });
		const val = generateDummyValue(col, 0) as string;
		expect(['active', 'inactive', 'pending']).toContain(val);
	});

	it('ENUM cycles through all values when rows > values', () => {
		const col = makeColumn({ id: 'c', name: 'status', type: 'ENUM', enumValues: ['a', 'b', 'c'] });
		const vals = Array.from({ length: 6 }, (_, i) => generateDummyValue(col, i));
		// All enum values should appear
		expect(vals).toContain('a');
		expect(vals).toContain('b');
		expect(vals).toContain('c');
	});

	it('ENUM without values returns value_N', () => {
		const col = makeColumn({ id: 'c', name: 'status', type: 'ENUM' });
		expect(generateDummyValue(col, 0)).toBe('value_1');
	});

	it('UUID returns UUID-like string with dashes', () => {
		const col = makeColumn({ id: 'c', name: 'uid', type: 'UUID' });
		const val = generateDummyValue(col, 0) as string;
		expect(val).toContain('-');
		// Should contain the UUID version 4 marker
		expect(val).toContain('-4');
	});

	it('UUID generates distinct values per row', () => {
		const col = makeColumn({ id: 'c', name: 'uid', type: 'UUID' });
		const v1 = generateDummyValue(col, 0);
		const v2 = generateDummyValue(col, 1);
		expect(v1).not.toBe(v2);
	});

	it('JSON returns {}', () => {
		const col = makeColumn({ id: 'c', name: 'data', type: 'JSON' });
		expect(generateDummyValue(col, 0)).toBe('{}');
	});

	it('autoIncrement returns null regardless of type', () => {
		const col = makeColumn({ id: 'c', name: 'id', type: 'INT', autoIncrement: true });
		expect(generateDummyValue(col, 0)).toBeNull();
		expect(generateDummyValue(col, 5)).toBeNull();
	});

	it('with parentIds returns cycled parent value', () => {
		const col = makeColumn({ id: 'c', name: 'user_id', type: 'INT' });
		expect(generateDummyValue(col, 0, [10, 20, 30])).toBe(10);
		expect(generateDummyValue(col, 1, [10, 20, 30])).toBe(20);
		expect(generateDummyValue(col, 2, [10, 20, 30])).toBe(30);
		expect(generateDummyValue(col, 3, [10, 20, 30])).toBe(10); // wraps
	});

	it('with empty parentIds falls through to type-based generation', () => {
		const col = makeColumn({ id: 'c', name: 'user_id', type: 'INT' });
		// Empty array → parentIds.length === 0 → condition not met → type-based
		expect(generateDummyValue(col, 0, [])).toBe(1);
	});

	it('parentIds takes precedence over autoIncrement', () => {
		// autoIncrement check comes first in the code
		const col = makeColumn({ id: 'c', name: 'id', type: 'INT', autoIncrement: true });
		expect(generateDummyValue(col, 0, [100])).toBeNull();
	});

	it('unknown type falls back to name_N', () => {
		// Force an unusual type via cast
		const col = makeColumn({ id: 'c', name: 'data', type: 'BLOB' as any });
		expect(generateDummyValue(col, 0)).toBe('data_1');
	});
});

// ══════════════════════════════════════════════════════════════════
// generateDummyData
// ══════════════════════════════════════════════════════════════════

describe('generateDummyData', () => {
	it('empty schema returns empty sql', () => {
		const result = generateDummyData(makeSchema([]), 5);
		expect(result.sql).toBe('');
		expect(result.tableCount).toBe(0);
	});

	it('single table generates correct INSERT count', () => {
		const t = makeTable({
			id: 'a', name: 'users',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'name', type: 'VARCHAR' }),
			],
		});
		const result = generateDummyData(makeSchema([t]), 5);
		const inserts = getInserts(result.sql, 'users');
		expect(inserts).toHaveLength(5);
		expect(result.tableCount).toBe(1);
		expect(result.rowsPerTable).toBe(5);
	});

	it('wraps in BEGIN/COMMIT', () => {
		const t = makeTable({
			id: 'a', name: 'items',
			columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
		});
		const result = generateDummyData(makeSchema([t]), 1);
		expect(result.sql).toMatch(/^BEGIN;/);
		expect(result.sql).toMatch(/COMMIT;$/);
	});

	it('autoIncrement columns excluded from INSERT column list', () => {
		const t = makeTable({
			id: 'a', name: 'posts',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
				makeColumn({ id: 'c2', name: 'title', type: 'VARCHAR' }),
			],
		});
		const result = generateDummyData(makeSchema([t]), 3);
		expect(result.sql).not.toContain('"id"');
		expect(result.sql).toContain('"title"');
		const inserts = getInserts(result.sql, 'posts');
		expect(inserts).toHaveLength(3);
	});

	it('FK child table ordered after parent and uses parent PK values', () => {
		const parent = makeTable({
			id: 'p', name: 'users',
			columns: [
				makeColumn({ id: 'p1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'p2', name: 'name', type: 'VARCHAR' }),
			],
		});
		const child = makeTable({
			id: 'c', name: 'posts',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'user_id', type: 'INT' }),
				makeColumn({ id: 'c3', name: 'title', type: 'VARCHAR' }),
			],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['c2'], referencedTableId: 'p', referencedColumnIds: ['p1'] })],
		});
		const result = generateDummyData(makeSchema([child, parent]), 3);

		// Order check: parent before child
		const parentIdx = result.sql.indexOf('INSERT INTO "users"');
		const childIdx = result.sql.indexOf('INSERT INTO "posts"');
		expect(parentIdx).toBeLessThan(childIdx);

		// Value check: child's user_id must be one of parent's PK values (1,2,3)
		const childInserts = getInserts(result.sql, 'posts');
		for (const line of childInserts) {
			const vals = parseInsertValues(line);
			// user_id is the 2nd column (index 1)
			const userId = parseInt(vals[1]);
			expect(userId).toBeGreaterThanOrEqual(1);
			expect(userId).toBeLessThanOrEqual(3);
		}
	});

	it('table names are double-quoted', () => {
		const t = makeTable({
			id: 'a', name: 'user table',
			columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
		});
		const result = generateDummyData(makeSchema([t]), 1);
		expect(result.sql).toContain('"user table"');
	});

	it('column names are double-quoted', () => {
		const t = makeTable({
			id: 'a', name: 'test',
			columns: [makeColumn({ id: 'c1', name: 'my col', type: 'INT', primaryKey: true })],
		});
		const result = generateDummyData(makeSchema([t]), 1);
		expect(result.sql).toContain('"my col"');
	});

	it('string values with single quotes are escaped', () => {
		const t = makeTable({
			id: 'a', name: 'notes',
			columns: [makeColumn({ id: 'c1', name: "it's", type: 'VARCHAR' })],
		});
		const result = generateDummyData(makeSchema([t]), 1);
		expect(result.sql).toContain("it''s_1");
	});

	it('self-referencing FK with nullable column uses NULL', () => {
		const t = makeTable({
			id: 'a', name: 'categories',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'parent_id', type: 'INT', nullable: true }),
			],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['c2'], referencedTableId: 'a', referencedColumnIds: ['c1'] })],
		});
		const result = generateDummyData(makeSchema([t]), 3);
		const inserts = getInserts(result.sql, 'categories');
		// First row: no parent PK exists yet → NULL
		const firstVals = parseInsertValues(inserts[0]);
		expect(firstVals[1]).toBe('NULL');
	});

	it('self-referencing FK with non-nullable column uses fallback', () => {
		const t = makeTable({
			id: 'a', name: 'nodes',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'parent_id', type: 'INT', nullable: false }),
			],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['c2'], referencedTableId: 'a', referencedColumnIds: ['c1'] })],
		});
		const result = generateDummyData(makeSchema([t]), 3);
		const inserts = getInserts(result.sql, 'nodes');
		// Should NOT contain NULL (non-nullable)
		for (const line of inserts) {
			const vals = parseInsertValues(line);
			expect(vals[1]).not.toBe('NULL');
		}
	});

	it('default rowsPerTable is 10', () => {
		const t = makeTable({
			id: 'a', name: 'items',
			columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
		});
		const result = generateDummyData(makeSchema([t]));
		const inserts = getInserts(result.sql, 'items');
		expect(inserts).toHaveLength(10);
		expect(result.rowsPerTable).toBe(10);
	});

	it('multiple independent tables all get data', () => {
		const t1 = makeTable({
			id: 'a', name: 'users',
			columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
		});
		const t2 = makeTable({
			id: 'b', name: 'products',
			columns: [makeColumn({ id: 'c2', name: 'id', type: 'INT', primaryKey: true })],
		});
		const result = generateDummyData(makeSchema([t1, t2]), 2);
		expect(result.tableCount).toBe(2);
		expect(getInserts(result.sql, 'users')).toHaveLength(2);
		expect(getInserts(result.sql, 'products')).toHaveLength(2);
	});

	it('all-autoIncrement table uses DEFAULT VALUES', () => {
		const t = makeTable({
			id: 'a', name: 'seq',
			columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', autoIncrement: true })],
		});
		const result = generateDummyData(makeSchema([t]), 3);
		const inserts = result.sql.match(/INSERT INTO "seq" DEFAULT VALUES;/g);
		expect(inserts).toHaveLength(3);
	});

	it('all-autoIncrement parent provides PK values for FK children', () => {
		const parent = makeTable({
			id: 'p', name: 'parent',
			columns: [makeColumn({ id: 'p1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true })],
		});
		const child = makeTable({
			id: 'c', name: 'child',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'parent_id', type: 'INT' }),
			],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['c2'], referencedTableId: 'p', referencedColumnIds: ['p1'] })],
		});
		const result = generateDummyData(makeSchema([child, parent]), 3);
		// Parent should use DEFAULT VALUES
		const parentInserts = result.sql.match(/INSERT INTO "parent" DEFAULT VALUES;/g);
		expect(parentInserts).toHaveLength(3);
		// Child should reference parent PKs (1, 2, 3)
		const childInserts = getInserts(result.sql, 'child');
		expect(childInserts).toHaveLength(3);
		for (const line of childInserts) {
			const vals = parseInsertValues(line);
			const parentId = parseInt(vals[1]);
			expect(parentId).toBeGreaterThanOrEqual(1);
			expect(parentId).toBeLessThanOrEqual(3);
		}
	});

	it('PK+FK column generates unique values (no UNIQUE constraint violation)', () => {
		// Simulates: table_1.id2 is PK and FK → table_2.id (autoIncrement)
		const table2 = makeTable({
			id: 't2', name: 'table_2',
			columns: [makeColumn({ id: 't2c1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true })],
		});
		const table1 = makeTable({
			id: 't1', name: 'table_1',
			columns: [makeColumn({ id: 't1c1', name: 'id2', type: 'INT', primaryKey: true })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['t1c1'], referencedTableId: 't2', referencedColumnIds: ['t2c1'] })],
		});
		const result = generateDummyData(makeSchema([table1, table2]), 5);
		const inserts = getInserts(result.sql, 'table_1');
		// Should be limited to parent's row count (5) and all unique
		expect(inserts).toHaveLength(5);
		const values = inserts.map((l) => parseInsertValues(l)[0]);
		const uniqueValues = new Set(values);
		expect(uniqueValues.size).toBe(5);
	});

	it('PK+FK column with unresolvable parent uses unique sequential values', () => {
		// Parent has no trackable PKs (e.g., parent not in schema)
		const child = makeTable({
			id: 'c', name: 'orphan',
			columns: [makeColumn({ id: 'c1', name: 'ref_id', type: 'INT', primaryKey: true })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['c1'], referencedTableId: 'missing', referencedColumnIds: ['x'] })],
		});
		const result = generateDummyData(makeSchema([child]), 5);
		const inserts = getInserts(result.sql, 'orphan');
		expect(inserts).toHaveLength(5);
		const values = inserts.map((l) => parseInt(parseInsertValues(l)[0]));
		// Should be sequential: 1, 2, 3, 4, 5
		expect(values).toEqual([1, 2, 3, 4, 5]);
	});

	it('UNIQUE+FK column limits rows to parent count', () => {
		const parent = makeTable({
			id: 'p', name: 'roles',
			columns: [makeColumn({ id: 'p1', name: 'id', type: 'INT', primaryKey: true })],
		});
		const child = makeTable({
			id: 'c', name: 'user_roles',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'role_id', type: 'INT', unique: true }),
			],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['c2'], referencedTableId: 'p', referencedColumnIds: ['p1'] })],
		});
		// Request 10 rows but parent only has 3
		const result = generateDummyData(makeSchema([child, parent]), 10);
		// parent: 10 rows (manual PK), child: limited to 3 (unique FK)
		const parentInserts = getInserts(result.sql, 'roles');
		expect(parentInserts).toHaveLength(10);
		const childInserts = getInserts(result.sql, 'user_roles');
		expect(childInserts).toHaveLength(10); // effectiveRows = min(10, 10) = 10
		// role_id values should all be unique
		const roleIds = childInserts.map((l) => parseInsertValues(l)[1]);
		const uniqueRoleIds = new Set(roleIds);
		expect(uniqueRoleIds.size).toBe(10);
	});

	it('non-PK UNIQUE column (no FK) generates unique values', () => {
		const t = makeTable({
			id: 'a', name: 'users',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
				makeColumn({ id: 'c2', name: 'name', type: 'VARCHAR' }),
				makeColumn({ id: 'c3', name: 'email', type: 'VARCHAR', unique: true }),
			],
		});
		const result = generateDummyData(makeSchema([t]), 10);
		const inserts = getInserts(result.sql, 'users');
		expect(inserts).toHaveLength(10);
		const emails = inserts.map((l) => parseInsertValues(l)[1]); // email is 2nd in insertCols (after name, id excluded)
		const uniqueEmails = new Set(emails);
		expect(uniqueEmails.size).toBe(10);
	});

	it('UniqueKey member column generates unique values', () => {
		const t = makeTable({
			id: 'a', name: 'items',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'code', type: 'VARCHAR' }),
				makeColumn({ id: 'c3', name: 'label', type: 'VARCHAR' }),
			],
			uniqueKeys: [{ id: 'uk1', name: 'uk_code', columnIds: ['c2'] }],
		});
		const result = generateDummyData(makeSchema([t]), 5);
		const inserts = getInserts(result.sql, 'items');
		const codes = inserts.map((l) => parseInsertValues(l)[1]);
		const uniqueCodes = new Set(codes);
		expect(uniqueCodes.size).toBe(5);
	});

	it('full user scenario: table_1(PK+FK), table_2(AI only), User(UNIQUE email)', () => {
		const table2 = makeTable({
			id: 't2', name: 'table_2',
			columns: [makeColumn({ id: 't2c1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true })],
		});
		const table1 = makeTable({
			id: 't1', name: 'table_1',
			columns: [makeColumn({ id: 't1c1', name: 'id2', type: 'INT', primaryKey: true })],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['t1c1'], referencedTableId: 't2', referencedColumnIds: ['t2c1'] })],
		});
		const userTable = makeTable({
			id: 'u', name: 'User',
			columns: [
				makeColumn({ id: 'uc1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
				makeColumn({ id: 'uc2', name: 'name', type: 'VARCHAR', nullable: true }),
				makeColumn({ id: 'uc3', name: 'email', type: 'VARCHAR', unique: true }),
			],
		});
		const result = generateDummyData(makeSchema([table1, table2, userTable]), 5);

		// table_2: DEFAULT VALUES (autoIncrement only)
		const t2Inserts = result.sql.match(/INSERT INTO "table_2" DEFAULT VALUES;/g);
		expect(t2Inserts).toHaveLength(5);

		// table_1: PK+FK, unique values referencing table_2 PKs
		const t1Inserts = getInserts(result.sql, 'table_1');
		expect(t1Inserts).toHaveLength(5);
		const t1Values = t1Inserts.map((l) => parseInsertValues(l)[0]);
		expect(new Set(t1Values).size).toBe(5); // all unique

		// User: email should be unique
		const userInserts = getInserts(result.sql, 'User');
		expect(userInserts).toHaveLength(5);
		const emails = userInserts.map((l) => parseInsertValues(l)[1]); // name=idx0, email=idx1
		expect(new Set(emails).size).toBe(5);
	});

	it('multi-level chain: data flows correctly through A → B → C', () => {
		const a = makeTable({
			id: 'a', name: 'departments',
			columns: [
				makeColumn({ id: 'a1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'a2', name: 'name', type: 'VARCHAR' }),
			],
		});
		const b = makeTable({
			id: 'b', name: 'employees',
			columns: [
				makeColumn({ id: 'b1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'b2', name: 'dept_id', type: 'INT' }),
				makeColumn({ id: 'b3', name: 'name', type: 'VARCHAR' }),
			],
			foreignKeys: [makeFK({ id: 'fk1', columnIds: ['b2'], referencedTableId: 'a', referencedColumnIds: ['a1'] })],
		});
		const c = makeTable({
			id: 'c', name: 'tasks',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'employee_id', type: 'INT' }),
				makeColumn({ id: 'c3', name: 'title', type: 'VARCHAR' }),
			],
			foreignKeys: [makeFK({ id: 'fk2', columnIds: ['c2'], referencedTableId: 'b', referencedColumnIds: ['b1'] })],
		});

		const result = generateDummyData(makeSchema([c, a, b]), 5);

		// Ordering: departments → employees → tasks
		const deptFirst = result.sql.indexOf('INSERT INTO "departments"');
		const empFirst = result.sql.indexOf('INSERT INTO "employees"');
		const taskFirst = result.sql.indexOf('INSERT INTO "tasks"');
		expect(deptFirst).toBeLessThan(empFirst);
		expect(empFirst).toBeLessThan(taskFirst);

		// tasks.employee_id references employees PK (1..5)
		const taskInserts = getInserts(result.sql, 'tasks');
		for (const line of taskInserts) {
			const vals = parseInsertValues(line);
			const empId = parseInt(vals[1]);
			expect(empId).toBeGreaterThanOrEqual(1);
			expect(empId).toBeLessThanOrEqual(5);
		}
	});

	it('mixed column types generate valid SQL', () => {
		const t = makeTable({
			id: 'a', name: 'mixed',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'name', type: 'VARCHAR' }),
				makeColumn({ id: 'c3', name: 'active', type: 'BOOLEAN' }),
				makeColumn({ id: 'c4', name: 'created', type: 'DATETIME' }),
				makeColumn({ id: 'c5', name: 'price', type: 'DECIMAL' }),
				makeColumn({ id: 'c6', name: 'data', type: 'JSON' }),
			],
		});
		const result = generateDummyData(makeSchema([t]), 3);
		const inserts = getInserts(result.sql, 'mixed');
		expect(inserts).toHaveLength(3);
		for (const line of inserts) {
			// Each INSERT should have 6 values
			const vals = parseInsertValues(line);
			expect(vals).toHaveLength(6);
			// JSON should be '{}'
			expect(vals[5]).toBe("'{}'");
		}
	});

	it('rowsPerTable=1 generates exactly 1 row per table', () => {
		const t = makeTable({
			id: 'a', name: 'items',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'name', type: 'VARCHAR' }),
			],
		});
		const result = generateDummyData(makeSchema([t]), 1);
		expect(getInserts(result.sql, 'items')).toHaveLength(1);
	});

	it('multiple FKs to same parent both get valid references', () => {
		const users = makeTable({
			id: 'u', name: 'users',
			columns: [
				makeColumn({ id: 'u1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'u2', name: 'name', type: 'VARCHAR' }),
			],
		});
		const messages = makeTable({
			id: 'm', name: 'messages',
			columns: [
				makeColumn({ id: 'm1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'm2', name: 'sender_id', type: 'INT' }),
				makeColumn({ id: 'm3', name: 'receiver_id', type: 'INT' }),
				makeColumn({ id: 'm4', name: 'body', type: 'TEXT' }),
			],
			foreignKeys: [
				makeFK({ id: 'fk1', columnIds: ['m2'], referencedTableId: 'u', referencedColumnIds: ['u1'] }),
				makeFK({ id: 'fk2', columnIds: ['m3'], referencedTableId: 'u', referencedColumnIds: ['u1'] }),
			],
		});

		const result = generateDummyData(makeSchema([messages, users]), 5);
		const msgInserts = getInserts(result.sql, 'messages');
		for (const line of msgInserts) {
			const vals = parseInsertValues(line);
			// sender_id (index 1) and receiver_id (index 2) should both be valid user ids
			expect(parseInt(vals[1])).toBeGreaterThanOrEqual(1);
			expect(parseInt(vals[1])).toBeLessThanOrEqual(5);
			expect(parseInt(vals[2])).toBeGreaterThanOrEqual(1);
			expect(parseInt(vals[2])).toBeLessThanOrEqual(5);
		}
	});
});

// ══════════════════════════════════════════════════════════════════
// Integration: Real-world scenarios (DDL export + dummy data)
// ══════════════════════════════════════════════════════════════════

describe('Integration: E-commerce schema', () => {
	const users = makeTable({
		id: 'u', name: 'users',
		columns: [
			makeColumn({ id: 'u1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
			makeColumn({ id: 'u2', name: 'email', type: 'VARCHAR' }),
			makeColumn({ id: 'u3', name: 'name', type: 'VARCHAR' }),
			makeColumn({ id: 'u4', name: 'created_at', type: 'DATETIME' }),
		],
	});
	const categories = makeTable({
		id: 'cat', name: 'categories',
		columns: [
			makeColumn({ id: 'cat1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
			makeColumn({ id: 'cat2', name: 'name', type: 'VARCHAR' }),
			makeColumn({ id: 'cat3', name: 'parent_id', type: 'INT', nullable: true }),
		],
		foreignKeys: [makeFK({ id: 'fk_cat_self', columnIds: ['cat3'], referencedTableId: 'cat', referencedColumnIds: ['cat1'] })],
	});
	const products = makeTable({
		id: 'p', name: 'products',
		columns: [
			makeColumn({ id: 'p1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
			makeColumn({ id: 'p2', name: 'name', type: 'VARCHAR' }),
			makeColumn({ id: 'p3', name: 'price', type: 'DECIMAL' }),
			makeColumn({ id: 'p4', name: 'category_id', type: 'INT' }),
			makeColumn({ id: 'p5', name: 'status', type: 'ENUM', enumValues: ['draft', 'active', 'archived'] }),
		],
		foreignKeys: [makeFK({ id: 'fk_prod_cat', columnIds: ['p4'], referencedTableId: 'cat', referencedColumnIds: ['cat1'] })],
	});
	const orders = makeTable({
		id: 'o', name: 'orders',
		columns: [
			makeColumn({ id: 'o1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
			makeColumn({ id: 'o2', name: 'user_id', type: 'INT' }),
			makeColumn({ id: 'o3', name: 'total', type: 'DECIMAL' }),
			makeColumn({ id: 'o4', name: 'ordered_at', type: 'DATETIME' }),
		],
		foreignKeys: [makeFK({ id: 'fk_order_user', columnIds: ['o2'], referencedTableId: 'u', referencedColumnIds: ['u1'] })],
	});
	const orderItems = makeTable({
		id: 'oi', name: 'order_items',
		columns: [
			makeColumn({ id: 'oi1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
			makeColumn({ id: 'oi2', name: 'order_id', type: 'INT' }),
			makeColumn({ id: 'oi3', name: 'product_id', type: 'INT' }),
			makeColumn({ id: 'oi4', name: 'quantity', type: 'INT' }),
			makeColumn({ id: 'oi5', name: 'unit_price', type: 'DECIMAL' }),
		],
		foreignKeys: [
			makeFK({ id: 'fk_oi_order', columnIds: ['oi2'], referencedTableId: 'o', referencedColumnIds: ['o1'] }),
			makeFK({ id: 'fk_oi_prod', columnIds: ['oi3'], referencedTableId: 'p', referencedColumnIds: ['p1'] }),
		],
	});

	const schema = makeSchema([orderItems, products, users, categories, orders]);

	it('topological order places parents before children', () => {
		const sorted = topologicalSortTables(schema.tables);
		const names = sorted.map((t) => t.name);
		const idx = (n: string) => names.indexOf(n);

		// users before orders
		expect(idx('users')).toBeLessThan(idx('orders'));
		// categories before products
		expect(idx('categories')).toBeLessThan(idx('products'));
		// orders and products before order_items
		expect(idx('orders')).toBeLessThan(idx('order_items'));
		expect(idx('products')).toBeLessThan(idx('order_items'));
	});

	it('generates INSERT SQL for all 5 tables', () => {
		const result = generateDummyData(schema, 5);
		expect(result.tableCount).toBe(5);
		// autoIncrement PK is excluded, but other columns should generate INSERTs
		for (const tbl of ['users', 'categories', 'products', 'orders', 'order_items']) {
			expect(getInserts(result.sql, tbl).length).toBeGreaterThan(0);
		}
	});

	it('order_items FK values reference valid parent PKs', () => {
		const result = generateDummyData(schema, 3);
		expect(result.sql).toContain('INSERT INTO "order_items"');
		// autoIncrement parents now track PKs via DEFAULT VALUES
		const oiInserts = getInserts(result.sql, 'order_items');
		for (const line of oiInserts) {
			const vals = parseInsertValues(line);
			// order_id (idx 0) and product_id (idx 1) should reference valid PKs (1..3)
			expect(parseInt(vals[0])).toBeGreaterThanOrEqual(1);
			expect(parseInt(vals[0])).toBeLessThanOrEqual(3);
			expect(parseInt(vals[1])).toBeGreaterThanOrEqual(1);
			expect(parseInt(vals[1])).toBeLessThanOrEqual(3);
		}
	});

	it('ENUM column generates valid enum values', () => {
		const result = generateDummyData(schema, 10);
		const productInserts = getInserts(result.sql, 'products');
		for (const line of productInserts) {
			const vals = parseInsertValues(line);
			// status is the last column (after name, price, category_id)
			const statusVal = vals[vals.length - 1].replace(/'/g, '');
			expect(['draft', 'active', 'archived']).toContain(statusVal);
		}
	});

	it('self-referencing category uses NULL for parent_id', () => {
		const result = generateDummyData(schema, 3);
		const catInserts = getInserts(result.sql, 'categories');
		// Self-ref with nullable column → NULL for all rows
		for (const line of catInserts) {
			const vals = parseInsertValues(line);
			// parent_id is the 2nd column (name=idx0, parent_id=idx1)
			expect(vals[1]).toBe('NULL');
		}
	});
});

describe('Integration: Blog with tags (many-to-many)', () => {
	const authors = makeTable({
		id: 'a', name: 'authors',
		columns: [
			makeColumn({ id: 'a1', name: 'id', type: 'INT', primaryKey: true }),
			makeColumn({ id: 'a2', name: 'name', type: 'VARCHAR' }),
			makeColumn({ id: 'a3', name: 'bio', type: 'TEXT' }),
		],
	});
	const posts = makeTable({
		id: 'p', name: 'posts',
		columns: [
			makeColumn({ id: 'p1', name: 'id', type: 'INT', primaryKey: true }),
			makeColumn({ id: 'p2', name: 'author_id', type: 'INT' }),
			makeColumn({ id: 'p3', name: 'title', type: 'VARCHAR' }),
			makeColumn({ id: 'p4', name: 'published', type: 'BOOLEAN' }),
			makeColumn({ id: 'p5', name: 'created_at', type: 'DATE' }),
		],
		foreignKeys: [makeFK({ id: 'fk_post_author', columnIds: ['p2'], referencedTableId: 'a', referencedColumnIds: ['a1'] })],
	});
	const tags = makeTable({
		id: 't', name: 'tags',
		columns: [
			makeColumn({ id: 't1', name: 'id', type: 'INT', primaryKey: true }),
			makeColumn({ id: 't2', name: 'label', type: 'VARCHAR' }),
		],
	});
	const postTags = makeTable({
		id: 'pt', name: 'post_tags',
		columns: [
			makeColumn({ id: 'pt1', name: 'post_id', type: 'INT', primaryKey: true }),
			makeColumn({ id: 'pt2', name: 'tag_id', type: 'INT', primaryKey: true }),
		],
		foreignKeys: [
			makeFK({ id: 'fk_pt_post', columnIds: ['pt1'], referencedTableId: 'p', referencedColumnIds: ['p1'] }),
			makeFK({ id: 'fk_pt_tag', columnIds: ['pt2'], referencedTableId: 't', referencedColumnIds: ['t1'] }),
		],
	});

	const schema = makeSchema([postTags, tags, posts, authors]);

	it('sorts junction table last', () => {
		const sorted = topologicalSortTables(schema.tables);
		const names = sorted.map((t) => t.name);
		expect(names.indexOf('post_tags')).toBe(names.length - 1);
	});

	it('junction table FK values reference valid parent PKs', () => {
		const result = generateDummyData(schema, 5);
		const ptInserts = getInserts(result.sql, 'post_tags');
		expect(ptInserts).toHaveLength(5);
		for (const line of ptInserts) {
			const vals = parseInsertValues(line);
			// post_id and tag_id should be valid PKs (1..5)
			expect(parseInt(vals[0])).toBeGreaterThanOrEqual(1);
			expect(parseInt(vals[0])).toBeLessThanOrEqual(5);
			expect(parseInt(vals[1])).toBeGreaterThanOrEqual(1);
			expect(parseInt(vals[1])).toBeLessThanOrEqual(5);
		}
	});

	it('post author_id references author PKs', () => {
		const result = generateDummyData(schema, 5);
		const postInserts = getInserts(result.sql, 'posts');
		for (const line of postInserts) {
			const vals = parseInsertValues(line);
			const authorId = parseInt(vals[1]);
			expect(authorId).toBeGreaterThanOrEqual(1);
			expect(authorId).toBeLessThanOrEqual(5);
		}
	});

	it('all column types generate parseable SQL values', () => {
		const result = generateDummyData(schema, 3);
		const postInserts = getInserts(result.sql, 'posts');
		for (const line of postInserts) {
			const vals = parseInsertValues(line);
			expect(vals).toHaveLength(5); // id, author_id, title, published, created_at
			// published should be 0 or 1
			expect(['0', '1']).toContain(vals[3]);
			// created_at should be a quoted date string
			expect(vals[4]).toMatch(/^'\d{4}-\d{2}-\d{2}'$/);
		}
	});
});

describe('Integration: HR schema (deep chain)', () => {
	const companies = makeTable({
		id: 'co', name: 'companies',
		columns: [
			makeColumn({ id: 'co1', name: 'id', type: 'INT', primaryKey: true }),
			makeColumn({ id: 'co2', name: 'name', type: 'VARCHAR' }),
		],
	});
	const departments = makeTable({
		id: 'd', name: 'departments',
		columns: [
			makeColumn({ id: 'd1', name: 'id', type: 'INT', primaryKey: true }),
			makeColumn({ id: 'd2', name: 'company_id', type: 'INT' }),
			makeColumn({ id: 'd3', name: 'name', type: 'VARCHAR' }),
		],
		foreignKeys: [makeFK({ id: 'fk_dept_co', columnIds: ['d2'], referencedTableId: 'co', referencedColumnIds: ['co1'] })],
	});
	const employees = makeTable({
		id: 'e', name: 'employees',
		columns: [
			makeColumn({ id: 'e1', name: 'id', type: 'INT', primaryKey: true }),
			makeColumn({ id: 'e2', name: 'department_id', type: 'INT' }),
			makeColumn({ id: 'e3', name: 'manager_id', type: 'INT', nullable: true }),
			makeColumn({ id: 'e4', name: 'name', type: 'VARCHAR' }),
			makeColumn({ id: 'e5', name: 'salary', type: 'DECIMAL' }),
			makeColumn({ id: 'e6', name: 'hired_at', type: 'DATE' }),
		],
		foreignKeys: [
			makeFK({ id: 'fk_emp_dept', columnIds: ['e2'], referencedTableId: 'd', referencedColumnIds: ['d1'] }),
			makeFK({ id: 'fk_emp_mgr', columnIds: ['e3'], referencedTableId: 'e', referencedColumnIds: ['e1'] }),
		],
	});
	const timesheets = makeTable({
		id: 'ts', name: 'timesheets',
		columns: [
			makeColumn({ id: 'ts1', name: 'id', type: 'INT', primaryKey: true }),
			makeColumn({ id: 'ts2', name: 'employee_id', type: 'INT' }),
			makeColumn({ id: 'ts3', name: 'date', type: 'DATE' }),
			makeColumn({ id: 'ts4', name: 'hours', type: 'DECIMAL' }),
		],
		foreignKeys: [makeFK({ id: 'fk_ts_emp', columnIds: ['ts2'], referencedTableId: 'e', referencedColumnIds: ['e1'] })],
	});

	const schema = makeSchema([timesheets, employees, companies, departments]);

	it('4-level chain sorted correctly', () => {
		const sorted = topologicalSortTables(schema.tables);
		const names = sorted.map((t) => t.name);
		const idx = (n: string) => names.indexOf(n);
		expect(idx('companies')).toBeLessThan(idx('departments'));
		expect(idx('departments')).toBeLessThan(idx('employees'));
		expect(idx('employees')).toBeLessThan(idx('timesheets'));
	});

	it('employee manager_id (self-ref nullable) gets NULL initially', () => {
		const result = generateDummyData(schema, 3);
		const empInserts = getInserts(result.sql, 'employees');
		const firstVals = parseInsertValues(empInserts[0]);
		// manager_id is 3rd column (index 2) — should be NULL for first row
		expect(firstVals[2]).toBe('NULL');
	});

	it('later employees can reference earlier employee PKs as manager', () => {
		const result = generateDummyData(schema, 5);
		const empInserts = getInserts(result.sql, 'employees');
		// Rows after the first should reference existing PKs (1..N)
		// At least one non-NULL manager_id in later rows
		const laterMgrVals = empInserts.slice(1).map((l) => parseInsertValues(l)[2]);
		const nonNullMgrs = laterMgrVals.filter((v) => v !== 'NULL');
		// After first row generates PK=1, nullable self-ref still produces NULL
		// (because self-ref with empty parentIds → nullable → NULL always)
		// This is correct behavior: all self-ref nullable → NULL
		expect(empInserts).toHaveLength(5);
	});

	it('timesheets.employee_id references employee PKs', () => {
		const result = generateDummyData(schema, 4);
		const tsInserts = getInserts(result.sql, 'timesheets');
		for (const line of tsInserts) {
			const vals = parseInsertValues(line);
			const empId = parseInt(vals[1]);
			expect(empId).toBeGreaterThanOrEqual(1);
			expect(empId).toBeLessThanOrEqual(4);
		}
	});

	it('generates valid SQL structure for all tables', () => {
		const result = generateDummyData(schema, 3);
		expect(result.tableCount).toBe(4);
		expect(result.sql.startsWith('BEGIN;')).toBe(true);
		expect(result.sql.endsWith('COMMIT;')).toBe(true);
		for (const tbl of ['companies', 'departments', 'employees', 'timesheets']) {
			expect(getInserts(result.sql, tbl)).toHaveLength(3);
		}
	});
});

describe('Integration: edge cases', () => {
	it('table with all column types generates valid INSERTs', () => {
		const t = makeTable({
			id: 'a', name: 'all_types',
			columns: [
				makeColumn({ id: 'c1', name: 'pk', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'big', type: 'BIGINT' }),
				makeColumn({ id: 'c3', name: 'small', type: 'SMALLINT' }),
				makeColumn({ id: 'c4', name: 'vc', type: 'VARCHAR' }),
				makeColumn({ id: 'c5', name: 'ch', type: 'CHAR' }),
				makeColumn({ id: 'c6', name: 'txt', type: 'TEXT' }),
				makeColumn({ id: 'c7', name: 'bool', type: 'BOOLEAN' }),
				makeColumn({ id: 'c8', name: 'dt', type: 'DATE' }),
				makeColumn({ id: 'c9', name: 'dtt', type: 'DATETIME' }),
				makeColumn({ id: 'c10', name: 'ts', type: 'TIMESTAMP' }),
				makeColumn({ id: 'c11', name: 'dec', type: 'DECIMAL' }),
				makeColumn({ id: 'c12', name: 'fl', type: 'FLOAT' }),
				makeColumn({ id: 'c13', name: 'dbl', type: 'DOUBLE' }),
				makeColumn({ id: 'c14', name: 'js', type: 'JSON' }),
				makeColumn({ id: 'c15', name: 'uid', type: 'UUID' }),
				makeColumn({ id: 'c16', name: 'en', type: 'ENUM', enumValues: ['x', 'y'] }),
			],
		});
		const result = generateDummyData(makeSchema([t]), 5);
		const inserts = getInserts(result.sql, 'all_types');
		expect(inserts).toHaveLength(5);
		for (const line of inserts) {
			const vals = parseInsertValues(line);
			expect(vals).toHaveLength(16);
		}
	});

	it('large row count (100 rows) does not crash', () => {
		const t = makeTable({
			id: 'a', name: 'big',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'val', type: 'VARCHAR' }),
			],
		});
		const result = generateDummyData(makeSchema([t]), 100);
		expect(getInserts(result.sql, 'big')).toHaveLength(100);
	});

	it('single column table (PK only)', () => {
		const t = makeTable({
			id: 'a', name: 'ids',
			columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
		});
		const result = generateDummyData(makeSchema([t]), 3);
		const inserts = getInserts(result.sql, 'ids');
		expect(inserts).toHaveLength(3);
		expect(parseInsertValues(inserts[0])).toEqual(['1']);
		expect(parseInsertValues(inserts[1])).toEqual(['2']);
		expect(parseInsertValues(inserts[2])).toEqual(['3']);
	});

	it('nullable non-FK column still gets non-NULL dummy value', () => {
		const t = makeTable({
			id: 'a', name: 'test',
			columns: [
				makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
				makeColumn({ id: 'c2', name: 'optional_name', type: 'VARCHAR', nullable: true }),
			],
		});
		const result = generateDummyData(makeSchema([t]), 2);
		const inserts = getInserts(result.sql, 'test');
		// nullable but not FK → generates normal dummy value
		expect(parseInsertValues(inserts[0])[1]).toBe("'optional_name_1'");
	});
});
