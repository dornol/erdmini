import { z } from 'zod';
import type { Dialect } from '$lib/types/erd';
import type { RegisterFn } from './types';
import { importDDL } from '$lib/utils/ddl-import';
import { importPrisma } from '$lib/utils/prisma-import';
import { importDBML } from '$lib/utils/dbml-import';

export const registerImportTools: RegisterFn = (server, ctx) => {
  const { requireAccess, saveAndNotify, mcpAudit, mergeOrReplaceSchema } = ctx;

  server.tool(
    'import_ddl',
    'Import DDL SQL (CREATE TABLE statements) to create tables. By default merges with existing tables (skips tables with same name). Set replace=true to replace entire schema. Supports 7 SQL dialects.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      sql: z.string().max(1048576).describe('DDL SQL statements'),
      dialect: z.enum(['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2']).optional().describe('SQL dialect (default: mysql)'),
      replace: z.boolean().optional().describe('Replace existing schema (default: false, merges)'),
    },
    async ({ projectId, sql, dialect, replace }) => {
      requireAccess(projectId, 'editor');
      const result = await importDDL(sql, (dialect || 'mysql') as Dialect);

      if (result.errors.length > 0 && result.tables.length === 0) {
        return {
          content: [{ type: 'text', text: `Import failed:\n${result.errors.join('\n')}` }],
          isError: true,
        };
      }

      const schema = mergeOrReplaceSchema(projectId, result.tables, replace);

      mcpAudit('import_ddl', projectId, { dialect: dialect || 'mysql', tableCount: result.tables.length, replace: !!replace });
      saveAndNotify(projectId, schema);

      const summary = [`Imported ${result.tables.length} table(s)`];
      if (result.errors.length > 0) summary.push(`Errors: ${result.errors.join('; ')}`);
      if (result.warnings.length > 0) summary.push(`Warnings: ${result.warnings.join('; ')}`);
      return { content: [{ type: 'text', text: summary.join('\n') }] };
    },
  );

  server.tool(
    'import_prisma',
    'Import Prisma schema source code. Parses models, enums, @relation, @id, @unique, @@index. By default merges; set replace=true to replace entire schema.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      source: z.string().max(1048576).describe('Prisma schema source code'),
      replace: z.boolean().optional().describe('Replace existing schema (default: false, merges)'),
    },
    async ({ projectId, source, replace }) => {
      requireAccess(projectId, 'editor');
      const result = importPrisma(source);

      if (result.errors.length > 0 && result.tables.length === 0) {
        return {
          content: [{ type: 'text', text: `Import failed:\n${result.errors.join('\n')}` }],
          isError: true,
        };
      }

      const schema = mergeOrReplaceSchema(projectId, result.tables, replace);

      mcpAudit('import_prisma', projectId, { tableCount: result.tables.length, replace: !!replace });
      saveAndNotify(projectId, schema);

      const summary = [`Imported ${result.tables.length} model(s) from Prisma schema`];
      if (result.errors.length > 0) summary.push(`Errors: ${result.errors.join('; ')}`);
      if (result.warnings.length > 0) summary.push(`Warnings: ${result.warnings.join('; ')}`);
      return { content: [{ type: 'text', text: summary.join('\n') }] };
    },
  );

  server.tool(
    'import_dbml',
    'Import DBML source code. Parses Table, Column, Enum, Ref, Indexes blocks. By default merges; set replace=true to replace entire schema.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      source: z.string().max(1048576).describe('DBML source code'),
      replace: z.boolean().optional().describe('Replace existing schema (default: false, merges)'),
    },
    async ({ projectId, source, replace }) => {
      requireAccess(projectId, 'editor');
      const result = importDBML(source);

      if (result.errors.length > 0 && result.tables.length === 0) {
        return {
          content: [{ type: 'text', text: `Import failed:\n${result.errors.join('\n')}` }],
          isError: true,
        };
      }

      const schema = mergeOrReplaceSchema(projectId, result.tables, replace);

      mcpAudit('import_dbml', projectId, { tableCount: result.tables.length, replace: !!replace });
      saveAndNotify(projectId, schema);

      const summary = [`Imported ${result.tables.length} table(s) from DBML`];
      if (result.errors.length > 0) summary.push(`Errors: ${result.errors.join('; ')}`);
      if (result.warnings.length > 0) summary.push(`Warnings: ${result.warnings.join('; ')}`);
      return { content: [{ type: 'text', text: summary.join('\n') }] };
    },
  );
};
