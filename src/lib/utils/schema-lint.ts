import type { ColumnType, ERDSchema } from '$lib/types/erd';
import type { EffectiveNamingRules, NamingConvention } from '$lib/types/naming-rules';
import { validateHierarchy } from '$lib/utils/domain-hierarchy';

// Naming convention matchers
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const CAMEL_CASE_RE = /^[a-z][a-zA-Z0-9]*$/;
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
const UPPER_SNAKE_CASE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export function matchesNamingConvention(name: string, convention: NamingConvention): boolean {
  switch (convention) {
    case 'snake_case': return SNAKE_CASE_RE.test(name);
    case 'camelCase': return CAMEL_CASE_RE.test(name);
    case 'PascalCase': return PASCAL_CASE_RE.test(name);
    case 'UPPER_SNAKE_CASE': return UPPER_SNAKE_CASE_RE.test(name);
    default: return true;
  }
}

/** Split a name into words based on convention */
export function splitNameToWords(name: string): string[] {
  // Handle snake_case / UPPER_SNAKE_CASE
  if (name.includes('_')) {
    return name.split('_').filter(Boolean).map(w => w.toLowerCase());
  }
  // Handle camelCase / PascalCase
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').split('_').filter(Boolean).map(w => w.toLowerCase());
}

const TYPE_COMPAT_GROUP: Record<string, string> = {
  INT: 'integer', BIGINT: 'integer', SMALLINT: 'integer',
  VARCHAR: 'string', CHAR: 'string', TEXT: 'string',
  DECIMAL: 'numeric', FLOAT: 'numeric', DOUBLE: 'numeric',
  DATE: 'temporal', DATETIME: 'temporal', TIMESTAMP: 'temporal',
};

function typeGroup(t: ColumnType): string {
  return TYPE_COMPAT_GROUP[t] ?? t;
}

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

export function lintSchema(schema: ERDSchema, namingRules?: EffectiveNamingRules, dictionaryWords?: Set<string>): LintIssue[] {
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

  // Rule 10: nullable-pk — PK column that is nullable
  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.primaryKey && col.nullable) {
        issues.push({
          id: nextId(),
          severity: 'warning',
          ruleId: 'nullable-pk',
          tableId: table.id,
          columnId: col.id,
          message: `${table.name}.${col.name}`,
        });
      }
    }
  }

  // Rule 11: fk-column-count-mismatch — FK columnIds and referencedColumnIds have different lengths
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      if (fk.columnIds.length !== fk.referencedColumnIds.length) {
        const refTable = tableById.get(fk.referencedTableId);
        issues.push({
          id: nextId(),
          severity: 'error',
          ruleId: 'fk-column-count-mismatch',
          tableId: table.id,
          message: `${table.name} → ${refTable?.name ?? '?'} (${fk.columnIds.length} vs ${fk.referencedColumnIds.length})`,
        });
      }
    }
  }

  // Rule 12: fk-references-non-unique — FK references columns that are not PK or unique
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const refTable = tableById.get(fk.referencedTableId);
      if (!refTable) continue;
      if (fk.referencedColumnIds.length === 0) continue;
      const refColById = new Map(refTable.columns.map((c) => [c.id, c]));

      // Check if referenced columns are all PK
      const allPk = fk.referencedColumnIds.every((id) => refColById.get(id)?.primaryKey);
      if (allPk) continue;

      // Check if referenced columns form a single-column unique
      if (fk.referencedColumnIds.length === 1) {
        const refCol = refColById.get(fk.referencedColumnIds[0]);
        if (refCol?.unique) continue;
      }

      // Check if referenced columns match a unique key
      const refColSet = new Set(fk.referencedColumnIds);
      const matchesUniqueKey = (refTable.uniqueKeys ?? []).some((uk) =>
        uk.columnIds.length === refColSet.size && uk.columnIds.every((id) => refColSet.has(id))
      );
      if (matchesUniqueKey) continue;

      const refColNames = fk.referencedColumnIds.map((id) => refColById.get(id)?.name ?? '?').join(', ');
      issues.push({
        id: nextId(),
        severity: 'warning',
        ruleId: 'fk-references-non-unique',
        tableId: table.id,
        message: `${table.name} → ${refTable.name}(${refColNames})`,
      });
    }
  }

  // Rule 13: fk-type-mismatch — FK column type incompatible with referenced column
  for (const table of schema.tables) {
    const colById = new Map(table.columns.map((c) => [c.id, c]));
    for (const fk of table.foreignKeys) {
      const refTable = tableById.get(fk.referencedTableId);
      if (!refTable) continue;
      const refColById = new Map(refTable.columns.map((c) => [c.id, c]));
      for (let i = 0; i < fk.columnIds.length; i++) {
        const srcCol = colById.get(fk.columnIds[i]);
        const refCol = refColById.get(fk.referencedColumnIds[i]);
        if (srcCol && refCol && typeGroup(srcCol.type) !== typeGroup(refCol.type)) {
          issues.push({
            id: nextId(),
            severity: 'warning',
            ruleId: 'fk-type-mismatch',
            tableId: table.id,
            columnId: srcCol.id,
            message: `${table.name}.${srcCol.name}(${srcCol.type}) → ${refTable.name}.${refCol.name}(${refCol.type})`,
          });
        }
      }
    }
  }

  // Naming convention rules (server mode, admin-configured)
  if (namingRules) {
    // Rule 14: naming-table-case — Table name violates case convention
    const tableCase = namingRules.tableCase;
    if (tableCase) {
      for (const table of schema.tables) {
        if (!matchesNamingConvention(table.name, tableCase.value as NamingConvention)) {
          issues.push({
            id: nextId(),
            severity: 'warning',
            ruleId: 'naming-table-case',
            tableId: table.id,
            message: `${table.name} (${tableCase.value})`,
          });
        }
      }
    }

    // Rule 15: naming-column-case — Column name violates case convention
    const columnCase = namingRules.columnCase;
    if (columnCase) {
      for (const table of schema.tables) {
        for (const col of table.columns) {
          if (!matchesNamingConvention(col.name, columnCase.value as NamingConvention)) {
            issues.push({
              id: nextId(),
              severity: 'warning',
              ruleId: 'naming-column-case',
              tableId: table.id,
              columnId: col.id,
              message: `${table.name}.${col.name} (${columnCase.value})`,
            });
          }
        }
      }
    }

    // Rule 16: naming-table-prefix — Table name missing required prefix
    const tablePrefix = namingRules.tablePrefix;
    if (tablePrefix && tablePrefix.value) {
      for (const table of schema.tables) {
        if (!table.name.startsWith(tablePrefix.value)) {
          issues.push({
            id: nextId(),
            severity: 'warning',
            ruleId: 'naming-table-prefix',
            tableId: table.id,
            message: `${table.name} (${tablePrefix.value}*)`,
          });
        }
      }
    }

    // Rule 17: naming-table-suffix — Table name missing required suffix
    const tableSuffix = namingRules.tableSuffix;
    if (tableSuffix && tableSuffix.value) {
      for (const table of schema.tables) {
        if (!table.name.endsWith(tableSuffix.value)) {
          issues.push({
            id: nextId(),
            severity: 'warning',
            ruleId: 'naming-table-suffix',
            tableId: table.id,
            message: `${table.name} (*${tableSuffix.value})`,
          });
        }
      }
    }

    // Rule 18: naming-column-prefix — Column name missing required prefix
    const columnPrefix = namingRules.columnPrefix;
    if (columnPrefix && columnPrefix.value) {
      for (const table of schema.tables) {
        for (const col of table.columns) {
          if (!col.name.startsWith(columnPrefix.value)) {
            issues.push({
              id: nextId(),
              severity: 'warning',
              ruleId: 'naming-column-prefix',
              tableId: table.id,
              columnId: col.id,
              message: `${table.name}.${col.name} (${columnPrefix.value}*)`,
            });
          }
        }
      }
    }

    // Rule 19: naming-column-suffix — Column name missing required suffix
    const columnSuffix = namingRules.columnSuffix;
    if (columnSuffix && columnSuffix.value) {
      for (const table of schema.tables) {
        for (const col of table.columns) {
          if (!col.name.endsWith(columnSuffix.value)) {
            issues.push({
              id: nextId(),
              severity: 'warning',
              ruleId: 'naming-column-suffix',
              tableId: table.id,
              columnId: col.id,
              message: `${table.name}.${col.name} (*${columnSuffix.value})`,
            });
          }
        }
      }
    }

    // Rule 20: naming-dictionary — Name contains words not in dictionary
    const dictCheck = namingRules.dictionaryCheck;
    if (dictCheck && dictionaryWords && dictionaryWords.size > 0) {
      const target = dictCheck.value as 'table' | 'column' | 'both';
      if (target === 'table' || target === 'both') {
        for (const table of schema.tables) {
          const words = splitNameToWords(table.name);
          const unknown = words.filter(w => !dictionaryWords.has(w));
          if (unknown.length > 0) {
            issues.push({
              id: nextId(),
              severity: 'info',
              ruleId: 'naming-dictionary',
              tableId: table.id,
              message: `${table.name}: ${unknown.join(', ')}`,
            });
          }
        }
      }
      if (target === 'column' || target === 'both') {
        for (const table of schema.tables) {
          for (const col of table.columns) {
            const words = splitNameToWords(col.name);
            const unknown = words.filter(w => !dictionaryWords.has(w));
            if (unknown.length > 0) {
              issues.push({
                id: nextId(),
                severity: 'info',
                ruleId: 'naming-dictionary',
                tableId: table.id,
                columnId: col.id,
                message: `${table.name}.${col.name}: ${unknown.join(', ')}`,
              });
            }
          }
        }
      }
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
