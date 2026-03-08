import { z } from 'zod';
import type { ColumnDomain } from '$lib/types/erd';
import { COLUMN_TYPES } from '$lib/types/erd';
import type { RegisterFn } from './types';
import { addDomain, updateDomain, deleteDomain, suggestDomains } from '../schema-ops';
import { resolveEffectiveDomain } from '$lib/utils/domain-hierarchy';
import { computeCoverageStats } from '$lib/utils/domain-analysis';
import { exportDictionaryMarkdown, exportDictionaryHtml } from '$lib/utils/domain-dictionary';

export const registerDomainTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'list_domains',
    'List all column domains (reusable column templates) with usage counts showing how many columns are linked to each domain.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const usageMap = new Map<string, number>();
      for (const t of schema.tables) {
        for (const c of t.columns) {
          if (c.domainId) usageMap.set(c.domainId, (usageMap.get(c.domainId) ?? 0) + 1);
        }
      }
      const result = (schema.domains ?? []).map(d => ({
        ...d,
        usageCount: usageMap.get(d.id) ?? 0,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_domain',
    'Get domain details by ID or name: type, constraints, linked columns, effective values (with hierarchy inheritance), child domains.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).optional().describe('Domain ID (provide domainId or domainName)'),
      domainName: z.string().max(256).optional().describe('Domain name (provide domainId or domainName)'),
    },
    async ({ projectId, domainId, domainName }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      if (!domainId && !domainName) {
        return { content: [{ type: 'text', text: 'Provide either domainId or domainName' }], isError: true };
      }
      const domain = domainId
        ? (schema.domains ?? []).find(d => d.id === domainId)
        : (schema.domains ?? []).find(d => d.name.toLowerCase() === domainName!.toLowerCase());
      if (!domain) {
        return { content: [{ type: 'text', text: `Domain not found: ${domainId || domainName}` }], isError: true };
      }
      const linkedColumns: { tableName: string; columnName: string; columnId: string }[] = [];
      for (const t of schema.tables) {
        for (const c of t.columns) {
          if (c.domainId === domain.id) {
            linkedColumns.push({ tableName: t.name, columnName: c.name, columnId: c.id });
          }
        }
      }
      const effectiveValues = resolveEffectiveDomain(domain.id, schema.domains ?? []);
      const childDomains = (schema.domains ?? [])
        .filter(d => d.parentId === domain.id)
        .map(d => ({ id: d.id, name: d.name }));
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...domain, linkedColumns, effectiveValues, children: childDomains }, null, 2) }],
      };
    },
  );

  server.tool(
    'add_domain',
    'Create a reusable column domain (template). Returns {domainId, name}. Domains define type, constraints, and metadata that propagate to linked columns. Set parentId for domain hierarchy.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      name: z.string().max(256).describe('Domain name'),
      type: z.enum(COLUMN_TYPES as [string, ...string[]]).describe('Column type'),
      length: z.number().optional().describe('Column length'),
      scale: z.number().optional().describe('Decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL (default: false)'),
      primaryKey: z.boolean().optional().describe('Primary key (default: false)'),
      unique: z.boolean().optional().describe('Unique constraint (default: false)'),
      autoIncrement: z.boolean().optional().describe('Auto increment (default: false)'),
      defaultValue: z.string().max(1024).optional().describe('Default value expression'),
      check: z.string().max(1024).optional().describe('CHECK constraint expression'),
      enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
      comment: z.string().max(4096).optional().describe('Domain comment'),
      group: z.string().max(256).optional().describe('Domain group name'),
      description: z.string().max(10000).optional().describe('Multi-line description (markdown)'),
      alias: z.string().max(256).optional().describe('Alias / display name'),
      dataStandard: z.string().max(1024).optional().describe('External standard reference'),
      example: z.string().max(1024).optional().describe('Example value'),
      validRange: z.string().max(1024).optional().describe('Valid range description'),
      owner: z.string().max(256).optional().describe('Owner / team'),
      tags: z.array(z.string().max(128)).max(50).optional().describe('Search tags'),
      parentId: z.string().max(256).optional().describe('Parent domain ID for hierarchy'),
    },
    async ({ projectId, name, type, ...opts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const domainFields: Omit<ColumnDomain, 'id'> = {
        name,
        type: type as any,
        nullable: opts.nullable ?? false,
        primaryKey: opts.primaryKey ?? false,
        unique: opts.unique ?? false,
        autoIncrement: opts.autoIncrement ?? false,
        length: opts.length,
        scale: opts.scale,
        defaultValue: opts.defaultValue,
        check: opts.check,
        enumValues: opts.enumValues,
        comment: opts.comment,
        group: opts.group,
        description: opts.description,
        alias: opts.alias,
        dataStandard: opts.dataStandard,
        example: opts.example,
        validRange: opts.validRange,
        owner: opts.owner,
        tags: opts.tags,
        parentId: opts.parentId,
      };
      const result = addDomain(schema, domainFields);
      mcpAudit('add_domain', projectId, { name });
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ domainId: result.domainId, name }) }],
      };
    },
  );

  server.tool(
    'update_domain',
    'Update domain properties. Changes automatically propagate to all linked columns and child domains in the hierarchy.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).describe('Domain ID'),
      name: z.string().max(256).optional().describe('New domain name'),
      type: z.enum(COLUMN_TYPES as [string, ...string[]]).optional().describe('New column type'),
      length: z.number().min(0).max(65535).optional().describe('New length'),
      scale: z.number().min(0).max(30).optional().describe('New decimal scale'),
      nullable: z.boolean().optional().describe('Allow NULL'),
      primaryKey: z.boolean().optional().describe('Primary key'),
      unique: z.boolean().optional().describe('Unique'),
      autoIncrement: z.boolean().optional().describe('Auto increment'),
      defaultValue: z.string().max(1024).optional().describe('Default value expression'),
      check: z.string().max(1024).optional().describe('CHECK constraint expression'),
      enumValues: z.array(z.string().max(256)).max(1000).optional().describe('ENUM values'),
      comment: z.string().max(4096).optional().describe('Domain comment'),
      group: z.string().max(256).optional().describe('Domain group name'),
      description: z.string().max(10000).optional().describe('Multi-line description (markdown)'),
      alias: z.string().max(256).optional().describe('Alias / display name'),
      dataStandard: z.string().max(1024).optional().describe('External standard reference'),
      example: z.string().max(1024).optional().describe('Example value'),
      validRange: z.string().max(1024).optional().describe('Valid range description'),
      owner: z.string().max(256).optional().describe('Owner / team'),
      tags: z.array(z.string().max(128)).max(50).optional().describe('Search tags'),
      parentId: z.string().max(256).optional().describe('Parent domain ID for hierarchy'),
    },
    async ({ projectId, domainId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.domains ?? []).find(d => d.id === domainId)) {
        return { content: [{ type: 'text', text: `Domain ${domainId} not found` }], isError: true };
      }
      const updated = updateDomain(schema, domainId, patch as any);
      mcpAudit('update_domain', projectId, { domainId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Domain updated (changes propagated to linked columns)' }] };
    },
  );

  server.tool(
    'delete_domain',
    'Delete a domain. All linked columns are unlinked. Child domains are re-parented to the deleted domain\'s parent.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      domainId: z.string().max(256).describe('Domain ID to delete'),
    },
    async ({ projectId, domainId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      if (!(schema.domains ?? []).find(d => d.id === domainId)) {
        return { content: [{ type: 'text', text: `Domain ${domainId} not found` }], isError: true };
      }
      const updated = deleteDomain(schema, domainId);
      mcpAudit('delete_domain', projectId, { domainId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Domain deleted (linked columns unlinked)' }] };
    },
  );

  server.tool(
    'suggest_domains',
    'Analyze unlinked columns and suggest domain candidates. Groups columns by matching (type, length, scale, baseName) that appear 2+ times. Sorted by frequency.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const suggestions = suggestDomains(schema);
      if (suggestions.length === 0) {
        return { content: [{ type: 'text', text: 'No domain suggestions — all columns are unique or already linked to domains.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(suggestions, null, 2) }] };
    },
  );

  server.tool(
    'domain_coverage',
    'Get domain coverage statistics: total columns, linked columns, coverage percentage, and per-group breakdown.',
    { projectId: z.string().max(256).describe('Project ID') },
    async ({ projectId }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const stats = computeCoverageStats(schema);
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    },
  );

  server.tool(
    'export_domain_dictionary',
    'Export a domain data dictionary listing all domains with their types, constraints, descriptions, and linked columns. Available in markdown or HTML format.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      format: z.enum(['markdown', 'html']).describe('Output format'),
    },
    async ({ projectId, format }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      const dctx = { schema, projectName: projectId };
      const result = format === 'markdown'
        ? exportDictionaryMarkdown(dctx)
        : exportDictionaryHtml(dctx);
      return { content: [{ type: 'text', text: result }] };
    },
  );
};
