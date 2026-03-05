import { parsePrismaSchema } from '@loancrate/prisma-schema-parser';
import {
  findIdFieldAttribute,
  findIdBlockAttribute,
  findDefaultFieldAttribute,
  findUniqueFieldAttribute,
  findUniqueBlockAttributes,
  findIndexBlockAttributes,
  findRelationFieldAttribute,
  findMapFieldAttribute,
  findMapBlockAttribute,
} from '@loancrate/prisma-schema-parser';
import {
  findFirstAttribute,
  getDeclarationAttributes,
} from '@loancrate/prisma-schema-parser';
import type {
  ModelDeclaration,
  EnumDeclaration,
  EnumValue,
  FieldDeclaration,
  PrismaType,
  SchemaExpression,
  CommentBlock,
} from '@loancrate/prisma-schema-parser';
import type { Column, ColumnType, ReferentialAction, Table, UniqueKey, TableIndex } from '$lib/types/erd';
import type { ImportResult } from '$lib/utils/ddl-import-types';
import { generateId } from '$lib/utils/common';
import { IMPORT_GRID_COLS, IMPORT_GRID_GAP_X, IMPORT_GRID_GAP_Y, IMPORT_GRID_OFFSET } from '$lib/constants/layout';

// Prisma scalar type → ERD ColumnType
const PRISMA_TYPE_MAP: Record<string, ColumnType> = {
  String: 'VARCHAR',
  Int: 'INT',
  BigInt: 'BIGINT',
  Float: 'FLOAT',
  Decimal: 'DECIMAL',
  Boolean: 'BOOLEAN',
  DateTime: 'DATETIME',
  Json: 'JSON',
  Bytes: 'TEXT',
};

// Prisma @db.* native type → override
const NATIVE_TYPE_MAP: Record<string, { type: ColumnType; length?: number; scale?: number }> = {
  Text: { type: 'TEXT' },
  SmallInt: { type: 'SMALLINT' },
  DoublePrecision: { type: 'DOUBLE' },
  Uuid: { type: 'UUID' },
  Char: { type: 'CHAR' },
  Date: { type: 'DATE' },
  Timestamp: { type: 'TIMESTAMP' },
  TinyInt: { type: 'SMALLINT' },
  MediumInt: { type: 'INT' },
  Real: { type: 'FLOAT' },
};

interface PrismaImportMessages {
  noModels: () => string;
  implicitM2m: (params: { detail: string }) => string;
  noPkWarning: (params: { model: string }) => string;
  fkResolveFailed: (params: { detail: string }) => string;
}

const DEFAULT_MESSAGES: PrismaImportMessages = {
  noModels: () => 'No model definitions found.',
  implicitM2m: ({ detail }) => `Implicit many-to-many skipped: ${detail}`,
  noPkWarning: ({ model }) => `Model ${model} has no primary key (Prisma requires @id).`,
  fkResolveFailed: ({ detail }) => `FK resolve failed: ${detail}`,
};

function getBaseTypeName(prismaType: PrismaType): { name: string; isList: boolean; isOptional: boolean } {
  switch (prismaType.kind) {
    case 'typeId':
      return { name: prismaType.name.value, isList: false, isOptional: false };
    case 'optional':
      return { name: prismaType.type.kind === 'typeId' ? prismaType.type.name.value : '', isList: false, isOptional: true };
    case 'list':
      return { name: prismaType.type.kind === 'typeId' ? prismaType.type.name.value : '', isList: true, isOptional: false };
    case 'required':
      return { name: prismaType.type.kind === 'typeId' ? prismaType.type.name.value : '', isList: false, isOptional: false };
    case 'unsupported':
      return { name: '', isList: false, isOptional: false };
    default:
      return { name: '', isList: false, isOptional: false };
  }
}

function expressionToString(expr: SchemaExpression): string {
  if (expr.kind === 'literal') return String(expr.value);
  if (expr.kind === 'functionCall') {
    const fname = expr.path.value.join('.');
    return `${fname.toUpperCase()}()`;
  }
  if (expr.kind === 'path') return expr.value.join('.');
  if (expr.kind === 'array') return `[${expr.items.map(expressionToString).join(', ')}]`;
  return '';
}

function mapReferentialAction(action: string | undefined): ReferentialAction {
  if (!action) return 'RESTRICT';
  switch (action) {
    case 'Cascade': return 'CASCADE';
    case 'SetNull': return 'SET NULL';
    case 'Restrict': return 'RESTRICT';
    case 'NoAction': return 'NO ACTION';
    case 'SetDefault': return 'RESTRICT';
    default: return 'RESTRICT';
  }
}

function getDocComment(members: (FieldDeclaration | CommentBlock | { kind: string })[], fieldIndex: number): string | undefined {
  // Look for a CommentBlock immediately preceding this field
  if (fieldIndex <= 0) return undefined;
  const prev = members[fieldIndex - 1];
  if (prev && 'kind' in prev && prev.kind === 'commentBlock') {
    const cb = prev as CommentBlock;
    const docComments = cb.comments.filter(c => c.kind === 'docComment');
    if (docComments.length > 0) {
      return docComments.map(c => c.text.replace(/^\s*/, '')).join('\n');
    }
  }
  return undefined;
}

function hasFieldIgnore(field: FieldDeclaration): boolean {
  return !!findFirstAttribute(field.attributes, 'ignore');
}

function hasBlockIgnore(model: ModelDeclaration): boolean {
  const attrs = getDeclarationAttributes(model);
  return !!findFirstAttribute(attrs, 'ignore');
}

function hasUpdatedAt(field: FieldDeclaration): boolean {
  return !!findFirstAttribute(field.attributes, 'updatedAt');
}

function findDbAttribute(field: FieldDeclaration): { nativeType: string; args: SchemaExpression[] } | undefined {
  if (!field.attributes) return undefined;
  for (const attr of field.attributes) {
    if (attr.kind === 'fieldAttribute' && attr.path.value.length === 2 && attr.path.value[0] === 'db') {
      return {
        nativeType: attr.path.value[1],
        args: attr.args
          ? attr.args.filter((a): a is SchemaExpression => a.kind !== 'namedArgument')
          : [],
      };
    }
  }
  return undefined;
}

export function importPrisma(
  source: string,
  messages?: Partial<PrismaImportMessages>,
): ImportResult {
  const msg: PrismaImportMessages = { ...DEFAULT_MESSAGES, ...messages };
  const errors: string[] = [];
  const warnings: string[] = [];

  let schema;
  try {
    schema = parsePrismaSchema(source);
  } catch (e) {
    return { tables: [], errors: [`Parse error: ${e instanceof Error ? e.message : e}`], warnings: [] };
  }

  // Collect enums (use @map name if present on individual values)
  const enumMap = new Map<string, string[]>();
  for (const decl of schema.declarations) {
    if (decl.kind === 'enum') {
      const enumDecl = decl as EnumDeclaration;
      const values = enumDecl.members
        .filter(m => m.kind === 'enumValue')
        .map(m => {
          const ev = m as EnumValue;
          const mapAttr = findMapFieldAttribute(ev);
          return mapAttr?.name ?? ev.name.value;
        });
      enumMap.set(enumDecl.name.value, values);
    }
  }

  // Collect model names (for detecting relation fields)
  const modelNames = new Set<string>();
  for (const decl of schema.declarations) {
    if (decl.kind === 'model' || decl.kind === 'type' || decl.kind === 'view') {
      modelNames.add((decl as ModelDeclaration).name.value);
    }
  }

  if (modelNames.size === 0) {
    errors.push(msg.noModels());
    return { tables: [], errors, warnings };
  }

  // Pass 1: Build tables from models
  const tables: Table[] = [];
  const modelNameToTableId = new Map<string, string>();
  const columnNameToId = new Map<string, Map<string, string>>(); // tableId → (colName → colId)

  // Track relation info for Pass 2
  interface RelationInfo {
    tableId: string;
    tableName: string;
    fieldName: string;
    targetModel: string;
    fields?: string[];
    references?: string[];
    onDelete?: string;
    onUpdate?: string;
    isList: boolean;
  }
  const relations: RelationInfo[] = [];

  let tableIndex = 0;
  for (const decl of schema.declarations) {
    if (decl.kind !== 'model' && decl.kind !== 'type' && decl.kind !== 'view') continue;
    const model = decl as ModelDeclaration;
    const modelName = model.name.value;

    // Skip @@ignore models
    if (hasBlockIgnore(model)) {
      warnings.push(`Model "${modelName}" has @@ignore, skipped.`);
      continue;
    }

    const mapAttr = findMapBlockAttribute(model);
    const tableName = mapAttr?.name ?? modelName;
    const tableId = generateId();
    modelNameToTableId.set(modelName, tableId);

    const colMap = new Map<string, string>();
    columnNameToId.set(tableId, colMap);

    const columns: Column[] = [];
    const uniqueKeys: UniqueKey[] = [];
    const indexes: TableIndex[] = [];

    // Check @@id for composite PK
    const compositeId = findIdBlockAttribute(model);
    const compositePkFields = compositeId ? new Set(compositeId.fields.map(f => f.name)) : new Set<string>();

    // Process fields
    for (let i = 0; i < model.members.length; i++) {
      const member = model.members[i];
      if (member.kind !== 'field') continue;
      const field = member as FieldDeclaration;

      // Skip @ignore fields
      if (hasFieldIgnore(field)) continue;

      const { name: typeName, isList, isOptional } = getBaseTypeName(field.type);

      // Skip Unsupported("...") types with warning
      if (field.type.kind === 'unsupported' || (field.type.kind === 'optional' && field.type.type.kind === 'unsupported') || (field.type.kind === 'list' && field.type.type.kind === 'unsupported')) {
        warnings.push(`Unsupported type skipped: ${modelName}.${field.name.value}`);
        continue;
      }

      // Skip relation fields (type is another model or list of model)
      if (modelNames.has(typeName)) {
        const relAttr = findRelationFieldAttribute(field);
        relations.push({
          tableId,
          tableName,
          fieldName: field.name.value,
          targetModel: typeName,
          fields: relAttr?.fields,
          references: relAttr?.references,
          onDelete: relAttr?.onDelete,
          onUpdate: relAttr?.onUpdate,
          isList,
        });
        continue;
      }

      // Map column name (respect @map)
      const fieldMapAttr = findMapFieldAttribute(field);
      const colName = fieldMapAttr?.name ?? field.name.value;
      const colId = generateId();
      colMap.set(field.name.value, colId);
      colMap.set(colName, colId);

      // Determine type
      let colType: ColumnType = 'VARCHAR';
      let length: number | undefined;
      let scale: number | undefined;
      let enumValues: string[] | undefined;

      if (enumMap.has(typeName)) {
        colType = 'ENUM';
        enumValues = enumMap.get(typeName);
      } else if (PRISMA_TYPE_MAP[typeName]) {
        colType = PRISMA_TYPE_MAP[typeName];
      }

      // Check @db.* native type override
      const dbAttr = findDbAttribute(field);
      if (dbAttr) {
        const override = NATIVE_TYPE_MAP[dbAttr.nativeType];
        if (override) {
          colType = override.type;
          if (override.length) length = override.length;
          if (override.scale !== undefined) scale = override.scale;
        }
        // Handle VarChar(N), Char(N), Decimal(P,S) with args
        if (dbAttr.nativeType === 'VarChar' || dbAttr.nativeType === 'Char') {
          colType = dbAttr.nativeType === 'VarChar' ? 'VARCHAR' : 'CHAR';
          if (dbAttr.args.length > 0 && dbAttr.args[0].kind === 'literal') {
            length = Number(dbAttr.args[0].value);
          }
        }
        if (dbAttr.nativeType === 'Decimal') {
          colType = 'DECIMAL';
          if (dbAttr.args.length >= 1 && dbAttr.args[0].kind === 'literal') {
            length = Number(dbAttr.args[0].value);
          }
          if (dbAttr.args.length >= 2 && dbAttr.args[1].kind === 'literal') {
            scale = Number(dbAttr.args[1].value);
          }
        }
      }

      // Default VARCHAR length
      if (colType === 'VARCHAR' && !length) {
        length = 255;
      }

      // PK
      const idAttr = findIdFieldAttribute(field);
      const isPk = !!idAttr || compositePkFields.has(field.name.value);

      // Default value
      const defaultAttr = findDefaultFieldAttribute(field);
      let defaultValue: string | undefined;
      let autoIncrement = false;
      if (defaultAttr) {
        const expr = defaultAttr.expression;
        if (expr.kind === 'functionCall') {
          const fname = expr.path.value.join('.').toLowerCase();
          if (fname === 'autoincrement') {
            autoIncrement = true;
          } else if (fname === 'now') {
            defaultValue = 'NOW()';
          } else if (fname === 'uuid') {
            colType = 'UUID';
            length = undefined;
            defaultValue = 'UUID()';
          } else if (fname === 'cuid') {
            defaultValue = 'CUID()';
          } else if (fname === 'dbgenerated') {
            // Extract the argument if present
            if (expr.args && expr.args.length > 0) {
              const arg = expr.args[0];
              const argExpr = arg.kind === 'namedArgument' ? arg.expression : arg;
              defaultValue = expressionToString(argExpr);
            }
          } else {
            defaultValue = `${fname.toUpperCase()}()`;
          }
        } else {
          const val = expressionToString(expr);
          if (val !== '') defaultValue = val;
        }
      }

      // @updatedAt → default NOW() if no explicit default
      if (hasUpdatedAt(field) && !defaultValue) {
        defaultValue = 'NOW()';
      }

      // Unique
      const uniqueAttr = findUniqueFieldAttribute(field);
      const isUnique = !!uniqueAttr;

      // Comment from doc comment (///)
      const comment = getDocComment(model.members, i) || (field.comment?.kind === 'docComment' ? field.comment.text.replace(/^\s*/, '') : undefined);

      columns.push({
        id: colId,
        name: colName,
        type: colType,
        length,
        scale,
        nullable: isOptional,
        primaryKey: isPk,
        unique: isUnique,
        autoIncrement,
        defaultValue,
        enumValues,
        comment,
      });
    }

    // Composite unique keys (@@unique)
    const compositeUniques = findUniqueBlockAttributes(model);
    for (const uk of compositeUniques) {
      const ukColIds = uk.fields
        .map(f => colMap.get(f.name))
        .filter((id): id is string => !!id);
      if (ukColIds.length >= 2) {
        uniqueKeys.push({
          id: generateId(),
          columnIds: ukColIds,
          name: uk.name || uk.map,
        });
      }
    }

    // Indexes (@@index)
    const compositeIndexes = findIndexBlockAttributes(model);
    for (const idx of compositeIndexes) {
      const idxColIds = idx.fields
        .map(f => colMap.get(f.name))
        .filter((id): id is string => !!id);
      if (idxColIds.length > 0) {
        indexes.push({
          id: generateId(),
          columnIds: idxColIds,
          name: idx.name || idx.map,
          unique: false,
        });
      }
    }

    // Table comment from doc comment block preceding model
    let tableComment: string | undefined;
    const declIndex = schema.declarations.indexOf(decl);
    if (declIndex > 0) {
      const prev = schema.declarations[declIndex - 1];
      if (prev.kind === 'commentBlock') {
        const docComments = (prev as CommentBlock).comments.filter(c => c.kind === 'docComment');
        if (docComments.length > 0) {
          tableComment = docComments.map(c => c.text.replace(/^\s*/, '')).join('\n');
        }
      }
    }

    // No PK warning
    if (!compositeId && !columns.some(c => c.primaryKey)) {
      warnings.push(msg.noPkWarning({ model: tableName }));
    }

    const col = tableIndex % IMPORT_GRID_COLS;
    const row = Math.floor(tableIndex / IMPORT_GRID_COLS);

    tables.push({
      id: tableId,
      name: tableName,
      columns,
      foreignKeys: [],
      uniqueKeys,
      indexes,
      position: { x: IMPORT_GRID_OFFSET + col * IMPORT_GRID_GAP_X, y: IMPORT_GRID_OFFSET + row * IMPORT_GRID_GAP_Y },
      comment: tableComment,
    });
    tableIndex++;
  }

  // Pass 2: Resolve relations → FK
  for (const rel of relations) {
    // Skip list relations without fields (implicit M:N or back-relation)
    if (!rel.fields || !rel.references) {
      if (rel.isList) {
        // Back-relation side of 1:N or implicit M:N — silently skip
        continue;
      }
      // Required relation without fields/references — this is an implicit M:N or missing @relation
      warnings.push(msg.implicitM2m({ detail: `${rel.tableName}.${rel.fieldName} → ${rel.targetModel}` }));
      continue;
    }

    const targetTableId = modelNameToTableId.get(rel.targetModel);
    if (!targetTableId) {
      warnings.push(msg.fkResolveFailed({ detail: `Target model "${rel.targetModel}" not found for ${rel.tableName}.${rel.fieldName}` }));
      continue;
    }

    const sourceColMap = columnNameToId.get(rel.tableId);
    const targetColMap = columnNameToId.get(targetTableId);
    if (!sourceColMap || !targetColMap) continue;

    const srcColIds = rel.fields.map(f => sourceColMap.get(f)).filter((id): id is string => !!id);
    const refColIds = rel.references.map(f => targetColMap.get(f)).filter((id): id is string => !!id);

    if (srcColIds.length !== rel.fields.length || refColIds.length !== rel.references.length) {
      warnings.push(msg.fkResolveFailed({ detail: `Column resolution failed for ${rel.tableName}.${rel.fieldName}` }));
      continue;
    }

    const table = tables.find(t => t.id === rel.tableId);
    if (!table) continue;

    table.foreignKeys.push({
      id: generateId(),
      columnIds: srcColIds,
      referencedTableId: targetTableId,
      referencedColumnIds: refColIds,
      onDelete: mapReferentialAction(rel.onDelete),
      onUpdate: mapReferentialAction(rel.onUpdate),
    });
  }

  return { tables, errors, warnings };
}
