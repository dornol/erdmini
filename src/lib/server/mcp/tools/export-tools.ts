import { z } from 'zod';
import type { Dialect } from '$lib/types/erd';
import type { DDLExportOptions } from '$lib/utils/ddl-export';
import type { RegisterFn } from './types';
import { exportDDL } from '$lib/utils/ddl-export';
import { exportPrisma } from '$lib/utils/prisma-export';
import { exportDBML } from '$lib/utils/dbml-export';
import { exportMermaid, exportPlantUML } from '$lib/utils/diagram-export';

export const registerExportTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail } = ctx;

  server.tool(
    'export_ddl',
    'Export DDL SQL (CREATE TABLE statements) for the project. Returns raw SQL text. Supports 7 dialects with options for comments, FK constraints, indexes, domain annotations, and keyword casing.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      dialect: z.enum(['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2']).describe('SQL dialect'),
      includeComments: z.boolean().optional().describe('Include comments in DDL'),
      includeForeignKeys: z.boolean().optional().describe('Include FK constraints'),
      includeIndexes: z.boolean().optional().describe('Include indexes'),
      includeDomains: z.boolean().optional().describe('Include domain comments on columns'),
      upperCaseKeywords: z.boolean().optional().describe('Uppercase SQL keywords'),
    },
    async ({ projectId, dialect, ...opts }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const options: Partial<DDLExportOptions> = {};
      if (opts.includeComments !== undefined) options.includeComments = opts.includeComments;
      if (opts.includeForeignKeys !== undefined) options.includeForeignKeys = opts.includeForeignKeys;
      if (opts.includeIndexes !== undefined) options.includeIndexes = opts.includeIndexes;
      if (opts.includeDomains !== undefined) options.includeDomains = opts.includeDomains;
      if (opts.upperCaseKeywords !== undefined) options.upperCaseKeywords = opts.upperCaseKeywords;

      const ddl = exportDDL(schema, dialect as Dialect, options);
      return { content: [{ type: 'text', text: ddl }] };
    },
  );

  server.tool(
    'export_prisma',
    'Export as Prisma schema (.prisma format) with models, relations, enums, and indexes.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      includeComments: z.boolean().optional().describe('Include comments as /// doc comments'),
      includeForeignKeys: z.boolean().optional().describe('Include relation fields'),
      includeIndexes: z.boolean().optional().describe('Include @@index declarations'),
    },
    async ({ projectId, ...opts }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const options: Record<string, boolean> = {};
      if (opts.includeComments !== undefined) options.includeComments = opts.includeComments;
      if (opts.includeForeignKeys !== undefined) options.includeForeignKeys = opts.includeForeignKeys;
      if (opts.includeIndexes !== undefined) options.includeIndexes = opts.includeIndexes;

      const prisma = exportPrisma(schema, options);
      return { content: [{ type: 'text', text: prisma }] };
    },
  );

  server.tool(
    'export_dbml',
    'Export as DBML (Database Markup Language) format. Options to include comments, foreign key Ref statements, and index blocks.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      includeComments: z.boolean().optional().describe('Include comments and notes'),
      includeForeignKeys: z.boolean().optional().describe('Include Ref statements'),
      includeIndexes: z.boolean().optional().describe('Include Indexes blocks'),
    },
    async ({ projectId, ...opts }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const options: Record<string, boolean> = {};
      if (opts.includeComments !== undefined) options.includeComments = opts.includeComments;
      if (opts.includeForeignKeys !== undefined) options.includeForeignKeys = opts.includeForeignKeys;
      if (opts.includeIndexes !== undefined) options.includeIndexes = opts.includeIndexes;

      const dbml = exportDBML(schema, options);
      return { content: [{ type: 'text', text: dbml }] };
    },
  );

  server.tool(
    'export_diagram',
    'Export ERD as Mermaid or PlantUML text diagram. Returns diagram source code that can be rendered by diagram tools.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      format: z.enum(['mermaid', 'plantuml']).describe('Diagram format'),
    },
    async ({ projectId, format }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const diagram = format === 'mermaid' ? exportMermaid(schema) : exportPlantUML(schema);
      return { content: [{ type: 'text', text: diagram }] };
    },
  );
};
