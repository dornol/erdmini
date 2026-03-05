import type { Table, Column, ERDSchema } from '$lib/types/erd';

/**
 * Topological sort of tables by FK dependencies (Kahn's algorithm).
 * Parent tables come before children. Cycles are appended at the end.
 */
export function topologicalSortTables(tables: Table[]): Table[] {
	const tableMap = new Map<string, Table>();
	for (const t of tables) tableMap.set(t.id, t);

	// Build adjacency: for each FK, parent → child
	const inDegree = new Map<string, number>();
	const children = new Map<string, string[]>(); // parentId → [childIds]

	for (const t of tables) {
		inDegree.set(t.id, 0);
		children.set(t.id, []);
	}

	for (const t of tables) {
		const parentIds = new Set<string>();
		for (const fk of t.foreignKeys) {
			// Skip self-referencing and unknown tables
			if (fk.referencedTableId === t.id) continue;
			if (!tableMap.has(fk.referencedTableId)) continue;
			if (parentIds.has(fk.referencedTableId)) continue;
			parentIds.add(fk.referencedTableId);
			inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
			children.get(fk.referencedTableId)!.push(t.id);
		}
	}

	const queue: string[] = [];
	for (const [id, deg] of inDegree) {
		if (deg === 0) queue.push(id);
	}

	const sorted: Table[] = [];
	while (queue.length > 0) {
		const id = queue.shift()!;
		sorted.push(tableMap.get(id)!);
		for (const childId of children.get(id) ?? []) {
			const newDeg = (inDegree.get(childId) ?? 1) - 1;
			inDegree.set(childId, newDeg);
			if (newDeg === 0) queue.push(childId);
		}
	}

	// Append cycle members
	for (const t of tables) {
		if (!sorted.includes(t)) sorted.push(t);
	}

	return sorted;
}

export interface DummyDataResult {
	sql: string;
	tableCount: number;
	rowsPerTable: number;
}

/**
 * Generate a dummy value for a column based on its type.
 */
export function generateDummyValue(
	col: Column,
	rowIndex: number,
	parentIds?: (string | number)[],
): string | number | null {
	if (col.autoIncrement) return null; // skip — DB auto-generates

	// FK column with parent IDs
	if (parentIds && parentIds.length > 0) {
		const val = parentIds[rowIndex % parentIds.length];
		return val;
	}

	const type = col.type.toUpperCase();
	const n = rowIndex + 1;

	switch (type) {
		case 'INT':
		case 'BIGINT':
		case 'SMALLINT':
			return n;

		case 'VARCHAR':
		case 'CHAR':
		case 'TEXT':
			return `${col.name}_${n}`;

		case 'BOOLEAN':
			return n % 2 === 0 ? 1 : 0;

		case 'DATE': {
			const d = new Date(2025, 0, 1);
			d.setDate(d.getDate() + (n % 30));
			return d.toISOString().slice(0, 10);
		}

		case 'DATETIME':
		case 'TIMESTAMP': {
			const d = new Date(2025, 0, 1, n % 24, (n * 7) % 60, (n * 13) % 60);
			d.setDate(d.getDate() + (n % 30));
			const pad = (v: number) => String(v).padStart(2, '0');
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		}

		case 'DECIMAL':
		case 'FLOAT':
		case 'DOUBLE':
			return Number((n * 10 + (n * 3.14) % 10).toFixed(2));

		case 'ENUM':
			if (col.enumValues && col.enumValues.length > 0) {
				return col.enumValues[n % col.enumValues.length];
			}
			return `value_${n}`;

		case 'UUID':
			return `${hex8(n)}${hex4(n)}-${hex4(n + 1)}-4${hex3(n)}-a${hex3(n + 2)}-${hex12(n)}`;

		case 'JSON':
			return '{}';

		default:
			return `${col.name}_${n}`;
	}
}

function hex(n: number, len: number): string {
	return ((n * 2654435761) >>> 0).toString(16).padStart(len, '0').slice(0, len);
}
function hex8(n: number) { return hex(n, 8); }
function hex4(n: number) { return hex(n, 4); }
function hex3(n: number) { return hex(n, 3); }
function hex12(n: number) { return hex(n, 8) + hex(n + 5, 4); }

function escapeSqlValue(val: string | number | null): string {
	if (val === null) return 'NULL';
	if (typeof val === 'number') return String(val);
	return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Generate INSERT SQL for all tables with dummy data.
 * Tables are topologically sorted so parent rows exist before child FKs reference them.
 */
export function generateDummyData(schema: ERDSchema, rowsPerTable: number = 10): DummyDataResult {
	if (schema.tables.length === 0) {
		return { sql: '', tableCount: 0, rowsPerTable };
	}

	const sorted = topologicalSortTables(schema.tables);
	const tableMap = new Map<string, Table>();
	for (const t of schema.tables) tableMap.set(t.id, t);

	// Track generated PK values per table for FK references
	const pkValues = new Map<string, (string | number)[]>();

	const lines: string[] = ['BEGIN;'];

	for (const table of sorted) {
		// Determine which columns to include (skip autoIncrement)
		const insertCols = table.columns.filter((c) => !c.autoIncrement);
		if (insertCols.length === 0) continue;

		// Build FK column → parent PK values mapping
		const fkParentMap = new Map<string, (string | number)[]>();
		for (const fk of table.foreignKeys) {
			if (fk.referencedTableId === table.id) {
				// Self-referencing: use own table's generated PKs (will be empty for first rows)
				for (const colId of fk.columnIds) {
					fkParentMap.set(colId, []); // mark as self-ref
				}
				continue;
			}
			const parentPks = pkValues.get(fk.referencedTableId);
			if (parentPks && parentPks.length > 0) {
				for (const colId of fk.columnIds) {
					fkParentMap.set(colId, parentPks);
				}
			} else {
				// Cycle or missing parent — mark nullable as NULL
				for (const colId of fk.columnIds) {
					fkParentMap.set(colId, []);
				}
			}
		}

		const tablePkValues: (string | number)[] = [];

		lines.push('');

		for (let i = 0; i < rowsPerTable; i++) {
			const values: string[] = [];
			let pkVal: string | number | null = null;

			for (const col of insertCols) {
				const parentIds = fkParentMap.get(col.id);
				let val: string | number | null;

				if (parentIds !== undefined) {
					if (parentIds.length > 0) {
						val = parentIds[i % parentIds.length];
					} else {
						// Self-ref or cycle: nullable → NULL, non-nullable → reference own rows
						if (col.nullable) {
							val = null;
						} else {
							// Use previously generated PKs from this table
							if (tablePkValues.length > 0) {
								val = tablePkValues[i % tablePkValues.length];
							} else {
								val = i + 1; // fallback
							}
						}
					}
				} else {
					val = generateDummyValue(col, i);
				}

				if (col.primaryKey && val !== null) {
					pkVal = val;
				}

				values.push(escapeSqlValue(val));
			}

			if (pkVal !== null) {
				tablePkValues.push(pkVal);
			}

			const colNames = insertCols.map((c) => `"${c.name}"`).join(', ');
			lines.push(`INSERT INTO "${table.name}" (${colNames}) VALUES (${values.join(', ')});`);
		}

		if (tablePkValues.length > 0) {
			pkValues.set(table.id, tablePkValues);
		}
	}

	lines.push('');
	lines.push('COMMIT;');

	return {
		sql: lines.join('\n'),
		tableCount: sorted.length,
		rowsPerTable,
	};
}
