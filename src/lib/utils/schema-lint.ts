import type { ERDSchema } from '$lib/types/erd';
import { validateHierarchy } from '$lib/utils/domain-hierarchy';

export interface LintIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  ruleId: string;
  tableId?: string;
  columnId?: string;
  message: string;
}

let _issueCounter = 0;
function nextId(): string {
  return `lint_${++_issueCounter}`;
}

export function lintSchema(schema: ERDSchema): LintIssue[] {
  _issueCounter = 0;
  const issues: LintIssue[] = [];
  const tableById = new Map(schema.tables.map((t) => [t.id, t]));

  // Rule 1: no-pk — Table has no primary key
  for (const table of schema.tables) {
    if (!table.columns.some((c) => c.primaryKey)) {
      issues.push({
        id: nextId(),
        severity: 'warning',
        ruleId: 'no-pk',
        tableId: table.id,
        message: `${table.name}`,
      });
    }
  }

  // Rule 2: fk-target-missing — FK references missing table/column
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const refTable = tableById.get(fk.referencedTableId);
      if (!refTable) {
        issues.push({
          id: nextId(),
          severity: 'error',
          ruleId: 'fk-target-missing',
          tableId: table.id,
          message: `${table.name} → ?`,
        });
        continue;
      }
      const refColIds = new Set(refTable.columns.map((c) => c.id));
      for (const colId of fk.referencedColumnIds) {
        if (!refColIds.has(colId)) {
          issues.push({
            id: nextId(),
            severity: 'error',
            ruleId: 'fk-target-missing',
            tableId: table.id,
            message: `${table.name} → ${refTable.name}`,
          });
          break;
        }
      }
    }
  }

  // Rule 3: set-null-not-nullable — FK SET NULL on NOT NULL column
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      if (fk.onDelete !== 'SET NULL' && fk.onUpdate !== 'SET NULL') continue;
      const colById = new Map(table.columns.map((c) => [c.id, c]));
      for (const colId of fk.columnIds) {
        const col = colById.get(colId);
        if (col && !col.nullable) {
          issues.push({
            id: nextId(),
            severity: 'warning',
            ruleId: 'set-null-not-nullable',
            tableId: table.id,
            columnId: colId,
            message: `${table.name}.${col.name}`,
          });
        }
      }
    }
  }

  // Rule 4: duplicate-column-name — Same table has duplicate column names
  for (const table of schema.tables) {
    const seen = new Set<string>();
    for (const col of table.columns) {
      const lower = col.name.toLowerCase();
      if (seen.has(lower)) {
        issues.push({
          id: nextId(),
          severity: 'error',
          ruleId: 'duplicate-column-name',
          tableId: table.id,
          columnId: col.id,
          message: `${table.name}.${col.name}`,
        });
      }
      seen.add(lower);
    }
  }

  // Rule 5: duplicate-table-name — Schema has duplicate table names
  const tableNameCount = new Map<string, string[]>();
  for (const table of schema.tables) {
    const lower = table.name.toLowerCase();
    const list = tableNameCount.get(lower) ?? [];
    list.push(table.id);
    tableNameCount.set(lower, list);
  }
  for (const [, ids] of tableNameCount) {
    if (ids.length > 1) {
      for (const id of ids) {
        const t = tableById.get(id)!;
        issues.push({
          id: nextId(),
          severity: 'error',
          ruleId: 'duplicate-table-name',
          tableId: id,
          message: `${t.name}`,
        });
      }
    }
  }

  // Rule 6: duplicate-index — Same columnIds in multiple indexes
  for (const table of schema.tables) {
    const seen = new Set<string>();
    for (const idx of table.indexes ?? []) {
      const key = [...idx.columnIds].sort().join(',');
      if (seen.has(key)) {
        issues.push({
          id: nextId(),
          severity: 'warning',
          ruleId: 'duplicate-index',
          tableId: table.id,
          message: `${table.name}`,
        });
      }
      seen.add(key);
    }
  }

  // Rule 7: circular-fk — FK reference cycle detection (DFS)
  const adj = new Map<string, Set<string>>();
  for (const table of schema.tables) {
    if (!adj.has(table.id)) adj.set(table.id, new Set());
    for (const fk of table.foreignKeys) {
      if (fk.referencedTableId !== table.id) {
        adj.get(table.id)!.add(fk.referencedTableId);
      }
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of adj.keys()) color.set(id, WHITE);

  const cycleNodes = new Set<string>();

  function dfs(u: string, path: string[]): boolean {
    color.set(u, GRAY);
    path.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) {
        // Found cycle — collect all nodes in cycle
        const cycleStart = path.indexOf(v);
        for (let i = cycleStart; i < path.length; i++) {
          cycleNodes.add(path[i]);
        }
        return true;
      }
      if (c === WHITE) {
        dfs(v, path);
      }
    }
    path.pop();
    color.set(u, BLACK);
    return false;
  }

  for (const id of adj.keys()) {
    if (color.get(id) === WHITE) {
      dfs(id, []);
    }
  }

  for (const id of cycleNodes) {
    const t = tableById.get(id);
    if (t) {
      issues.push({
        id: nextId(),
        severity: 'warning',
        ruleId: 'circular-fk',
        tableId: id,
        message: `${t.name}`,
      });
    }
  }

  // Rule 8: empty-table — Table has no columns
  for (const table of schema.tables) {
    if (table.columns.length === 0) {
      issues.push({
        id: nextId(),
        severity: 'info',
        ruleId: 'empty-table',
        tableId: table.id,
        message: `${table.name}`,
      });
    }
  }

  // Rule 9: domain-circular-hierarchy — Domain hierarchy has circular references
  if (schema.domains && schema.domains.length > 0) {
    const hierarchy = validateHierarchy(schema.domains);
    for (const cycle of hierarchy.cycles) {
      const domainNames = cycle.map(id => {
        const d = schema.domains.find(dom => dom.id === id);
        return d?.name ?? id;
      });
      issues.push({
        id: nextId(),
        severity: 'error',
        ruleId: 'domain-circular-hierarchy',
        message: domainNames.join(' → '),
      });
    }
  }

  return issues;
}
