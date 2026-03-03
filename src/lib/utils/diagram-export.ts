import type { ERDSchema, Table, Column } from '$lib/types/erd';

function mermaidType(col: Column): string {
  if (col.length) return `${col.type}(${col.length})`;
  return col.type;
}

function mermaidConstraints(col: Column, fkSourceIds: Set<string>): string {
  const parts: string[] = [];
  if (col.primaryKey) parts.push('PK');
  if (fkSourceIds.has(col.id)) parts.push('FK');
  if (col.unique && !col.primaryKey) parts.push('UK');
  return parts.join(',');
}

export function exportMermaid(schema: ERDSchema): string {
  const lines: string[] = ['erDiagram'];

  // Entity definitions
  for (const table of schema.tables) {
    const fkSourceIds = new Set(table.foreignKeys.flatMap((fk) => fk.columnIds));
    lines.push(`    ${table.name} {`);
    for (const col of table.columns) {
      const constraints = mermaidConstraints(col, fkSourceIds);
      const nullable = col.nullable ? '"nullable"' : '';
      const parts = [
        `        ${mermaidType(col)}`,
        col.name,
        constraints,
        nullable,
      ].filter(Boolean);
      lines.push(parts.join(' '));
    }
    lines.push('    }');
  }

  // Relationships from FK
  const tableById = new Map(schema.tables.map((t) => [t.id, t]));
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const refTable = tableById.get(fk.referencedTableId);
      if (!refTable) continue;
      // Check if FK column is nullable to determine cardinality
      const fkCol = table.columns.find((c) => fk.columnIds.includes(c.id));
      const rightSide = fkCol?.nullable ? 'o{' : '|{';
      lines.push(`    ${refTable.name} ||--${rightSide} ${table.name} : ""`);
    }
  }

  return lines.join('\n');
}

function pumlType(col: Column): string {
  if (col.length) return `${col.type}(${col.length})`;
  return col.type;
}

function pumlStereotypes(col: Column, fkSourceIds: Set<string>): string {
  const tags: string[] = [];
  if (col.primaryKey) tags.push('PK');
  if (fkSourceIds.has(col.id)) tags.push('FK');
  if (col.unique && !col.primaryKey) tags.push('UK');
  if (col.autoIncrement) tags.push('AI');
  if (tags.length === 0) return '';
  return ' <<' + tags.join(', ') + '>>';
}

export function exportPlantUML(schema: ERDSchema): string {
  const lines: string[] = ['@startuml'];
  lines.push('');

  const tableById = new Map(schema.tables.map((t) => [t.id, t]));

  for (const table of schema.tables) {
    const fkSourceIds = new Set(table.foreignKeys.flatMap((fk) => fk.columnIds));
    const pkCols = table.columns.filter((c) => c.primaryKey);
    const nonPkCols = table.columns.filter((c) => !c.primaryKey);

    lines.push(`entity "${table.name}" as ${sanitize(table.name)} {`);

    // PK columns first (marked with *)
    for (const col of pkCols) {
      const stereo = pumlStereotypes(col, fkSourceIds);
      lines.push(`    * ${col.name} : ${pumlType(col)}${stereo}`);
    }

    if (nonPkCols.length > 0) {
      lines.push('    --');
      for (const col of nonPkCols) {
        const stereo = pumlStereotypes(col, fkSourceIds);
        const prefix = col.nullable ? '  ' : '* ';
        lines.push(`    ${prefix}${col.name} : ${pumlType(col)}${stereo}`);
      }
    }

    lines.push('}');
    lines.push('');
  }

  // Relationships
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const refTable = tableById.get(fk.referencedTableId);
      if (!refTable) continue;
      const fkCol = table.columns.find((c) => fk.columnIds.includes(c.id));
      const rightSide = fkCol?.nullable ? 'o{' : '|{';
      lines.push(`${sanitize(refTable.name)} ||--${rightSide} ${sanitize(table.name)}`);
    }
  }

  lines.push('');
  lines.push('@enduml');
  return lines.join('\n');
}

/** Sanitize table name for PlantUML alias (replace spaces/special chars) */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
