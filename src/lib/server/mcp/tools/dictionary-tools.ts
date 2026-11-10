import { z } from 'zod';
import { logAudit } from '$lib/server/audit';
import {
  cloneDictionary,
  createDictionary,
  createWord,
  deleteDictionary,
  deleteWord,
  getDictionaryUsage,
  importWords,
  listDictionaries,
  listDictionariesWithUsage,
  listProjectsUsingDictionary,
  listWords,
  setDefaultDictionary,
  updateDictionary,
  updateWord,
  updateWordStatus,
  type WordStatus,
} from '$lib/server/dictionary';
import {
  NAMING_CONVENTIONS,
  NAMING_RULE_TYPES,
  computeEffectiveRules,
  normalizeProjectNamingOverride,
  type NamingRuleType,
  type ProjectNamingOverrideEntry,
  type ProjectNamingOverrideValue,
  type ProjectNamingOverrides,
  type SiteNamingRules,
} from '$lib/types/naming-rules';
import type { RegisterFn, McpToolContext } from './types';

const WORD_STATUSES: WordStatus[] = ['approved', 'pending', 'rejected'];
const MAX_EXPORT_WORDS = 10000;
const MAX_IMPORT_WORDS = 5000;
const DICTIONARY_CHECK_TARGETS = ['table', 'column', 'both'] as const;
const AFFIX_OVERRIDE_SCHEMA = z.union([
  z.string().max(20),
  z.object({ enabled: z.boolean().optional(), value: z.string().max(20).optional() }).strict(),
  z.null(),
]);
const CASE_OVERRIDE_SCHEMA = z.union([
  z.string().max(256),
  z.object({ enabled: z.boolean().optional(), value: z.string().max(256).optional() }).strict(),
  z.null(),
]);
const DICTIONARY_CHECK_OVERRIDE_SCHEMA = z.union([
  z.enum(['table', 'column', 'both']),
  z.object({ enabled: z.boolean().optional(), value: z.enum(['table', 'column', 'both']).optional() }).strict(),
  z.null(),
]);

function isAdmin(ctx: McpToolContext): boolean {
  return ctx.keyInfo.userRole === 'admin';
}

function requireAdmin(ctx: McpToolContext): void {
  if (!isAdmin(ctx)) throw new Error('Access denied: admin API key required');
}

function auditDictionary(ctx: McpToolContext, action: string, detail?: Record<string, unknown>): void {
  logAudit({
    action,
    category: 'mcp',
    userId: ctx.keyInfo.userId,
    username: ctx.keyInfo.displayName,
    resourceType: 'dictionary',
    detail,
    source: 'mcp',
  });
}

function dictionaryExists(ctx: McpToolContext, dictionaryId: string): boolean {
  return !!ctx.db.prepare('SELECT id FROM dictionaries WHERE id = ?').get(dictionaryId);
}

function getWordOwnerAndStatus(ctx: McpToolContext, wordId: string): { created_by: string; status: string } | undefined {
  return ctx.db
    .prepare('SELECT created_by, status FROM word_dictionary WHERE id = ?')
    .get(wordId) as { created_by: string; status: string } | undefined;
}

function readNamingRules(ctx: McpToolContext): SiteNamingRules {
  const row = ctx.db
    .prepare("SELECT value FROM site_settings WHERE key = 'naming_rules'")
    .get() as { value: string } | undefined;
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value) as SiteNamingRules;
  } catch {
    return {};
  }
}

function validateNamingRuleValue(type: NamingRuleType, value: string): void {
  if ((type === 'tableCase' || type === 'columnCase') && !NAMING_CONVENTIONS.includes(value as never)) {
    throw new Error(`Invalid ${type} value. Use one of: ${NAMING_CONVENTIONS.join(', ')}`);
  }
  if (type === 'dictionaryCheck' && !DICTIONARY_CHECK_TARGETS.includes(value as never)) {
    throw new Error(`Invalid dictionaryCheck value. Use one of: ${DICTIONARY_CHECK_TARGETS.join(', ')}`);
  }
  if (['tablePrefix', 'tableSuffix', 'columnPrefix', 'columnSuffix'].includes(type) && value.length > 20) {
    throw new Error(`${type} must be 20 characters or fewer`);
  }
}

function describeNamingRuleState(siteRules: SiteNamingRules, projectOverrides: ProjectNamingOverrides = {}) {
  const effectiveRules = computeEffectiveRules(siteRules, projectOverrides);
  const ruleStatus = Object.fromEntries(NAMING_RULE_TYPES.map((type) => {
    const siteRule = siteRules[type];
    const override = normalizeProjectNamingOverride(projectOverrides[type]);
    const hasOverride = override !== undefined;
    const status = !siteRule?.enabled
      ? 'disabled'
      : hasOverride && siteRule.allowOverride && override.enabled === false
        ? 'project_disabled'
        : hasOverride && siteRule.allowOverride
        ? 'project_override'
        : siteRule.allowOverride
          ? 'inherited'
          : 'admin_locked';
    return [type, {
      status,
      enabled: siteRule?.enabled === true,
      allowOverride: siteRule?.allowOverride === true,
      value: effectiveRules[type]?.value ?? siteRule?.value ?? null,
      source: effectiveRules[type]?.source ?? null,
      projectOverride: override ?? null,
    }];
  }));

  return { ruleStatus, effectiveRules };
}

function normalizeIncomingOverride(value: ProjectNamingOverrideValue): ProjectNamingOverrideEntry {
  return typeof value === 'string' ? { value } : value;
}

export const registerDictionaryTools: RegisterFn = (server, ctx) => {
  server.tool(
    'list_dictionaries',
    'List word dictionaries. Admin API keys include usage counts and project references; regular keys receive basic dictionary metadata.',
    {},
    async () => {
      const rows = isAdmin(ctx) ? listDictionariesWithUsage(ctx.db) : listDictionaries(ctx.db);
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
    },
  );

  server.tool(
    'create_dictionary',
    'Create a new word dictionary. Requires an admin API key. Returns the created dictionary row.',
    {
      name: z.string().min(1).max(256).describe('Dictionary name'),
      description: z.string().max(1000).optional().describe('Optional description'),
      cloneFromDictionaryId: z.string().max(256).optional().describe('Optional source dictionary ID to clone words from'),
    },
    async ({ name, description, cloneFromDictionaryId }) => {
      requireAdmin(ctx);
      const row = cloneFromDictionaryId
        ? cloneDictionary(ctx.db, cloneFromDictionaryId, { name, description }, ctx.keyInfo.userId)
        : createDictionary(ctx.db, { name, description }, ctx.keyInfo.userId);
      auditDictionary(ctx, cloneFromDictionaryId ? 'clone_dictionary' : 'create_dictionary', {
        dictionaryId: row.id,
        name: row.name,
        cloneFromDictionaryId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(row, null, 2) }] };
    },
  );

  server.tool(
    'update_dictionary',
    'Update dictionary metadata or set it as the default dictionary. Requires an admin API key.',
    {
      dictionaryId: z.string().max(256).describe('Dictionary ID'),
      name: z.string().min(1).max(256).optional().describe('New dictionary name'),
      description: z.string().max(1000).nullable().optional().describe('New description, or null to clear'),
      isDefault: z.boolean().optional().describe('Set this dictionary as the default'),
    },
    async ({ dictionaryId, name, description, isDefault }) => {
      requireAdmin(ctx);
      let row = updateDictionary(ctx.db, dictionaryId, { name, description });
      if (isDefault === true) row = setDefaultDictionary(ctx.db, dictionaryId);
      auditDictionary(ctx, 'update_dictionary', { dictionaryId, name: row.name, isDefault: !!row.is_default });
      return { content: [{ type: 'text' as const, text: JSON.stringify(row, null, 2) }] };
    },
  );

  server.tool(
    'delete_dictionary',
    'Delete an unused non-default dictionary. Requires an admin API key. Returns an error if words, share links, or projects still use it.',
    {
      dictionaryId: z.string().max(256).describe('Dictionary ID'),
    },
    async ({ dictionaryId }) => {
      requireAdmin(ctx);
      try {
        deleteDictionary(ctx.db, dictionaryId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Delete failed';
        if (message.includes('in use') || message.includes('Default dictionary') || message.includes('used by projects')) {
          const usage = getDictionaryUsage(ctx.db, dictionaryId);
          const projects = listProjectsUsingDictionary(ctx.db, dictionaryId);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: message, ...usage, projectCount: projects.length, projects }, null, 2) }],
            isError: true,
          };
        }
        throw e;
      }
      auditDictionary(ctx, 'delete_dictionary', { dictionaryId });
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );

  server.tool(
    'list_dictionary_words',
    'List words in a word dictionary. Regular API keys only see approved words; admin API keys may filter by status.',
    {
      dictionaryId: z.string().max(256).optional().describe('Dictionary ID, defaults to the site default dictionary'),
      search: z.string().max(256).optional().describe('Search word or meaning'),
      category: z.string().max(256).optional().describe('Category filter. Use empty string for uncategorized words.'),
      status: z.enum(['approved', 'pending', 'rejected']).optional().describe('Admin-only status filter'),
      page: z.number().int().min(1).optional().describe('Page number, default 1'),
      limit: z.number().int().min(0).max(200).optional().describe('Page size, default 50, max 200. Use 0 for count only.'),
    },
    async ({ dictionaryId, search, category, status, page, limit }) => {
      const effectiveStatus = isAdmin(ctx) && status ? status : 'approved';
      const result = listWords(ctx.db, { dictionaryId, search, category, status: effectiveStatus, page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'add_dictionary_word',
    'Add a word to a dictionary. Admin API keys create approved words by default; regular API keys create pending suggestions.',
    {
      dictionaryId: z.string().max(256).optional().describe('Dictionary ID, defaults to the site default dictionary'),
      word: z.string().min(1).max(256).describe('Word or abbreviation'),
      meaning: z.string().min(1).max(1000).describe('Meaning'),
      description: z.string().max(2000).optional().describe('Optional description'),
      category: z.string().max(256).optional().describe('Optional category'),
      status: z.enum(['approved', 'pending', 'rejected']).optional().describe('Admin-only initial status'),
    },
    async ({ dictionaryId, word, meaning, description, category, status }) => {
      const effectiveStatus: WordStatus = isAdmin(ctx) ? (status ?? 'approved') : 'pending';
      const row = createWord(ctx.db, { dictionaryId, word, meaning, description, category, status: effectiveStatus }, ctx.keyInfo.userId);
      auditDictionary(ctx, isAdmin(ctx) ? 'create_dictionary_word' : 'suggest_dictionary_word', {
        dictionaryId: row.dictionary_id,
        wordId: row.id,
        word: row.word,
        status: row.status,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(row, null, 2) }] };
    },
  );

  server.tool(
    'update_dictionary_word',
    'Update a dictionary word or approve/reject it. Requires an admin API key.',
    {
      wordId: z.string().max(256).describe('Word row ID'),
      word: z.string().min(1).max(256).optional().describe('New word'),
      meaning: z.string().min(1).max(1000).optional().describe('New meaning'),
      description: z.string().max(2000).nullable().optional().describe('New description, or null to clear'),
      category: z.string().max(256).nullable().optional().describe('New category, or null to clear'),
      status: z.enum(['approved', 'pending', 'rejected']).optional().describe('New status'),
    },
    async ({ wordId, word, meaning, description, category, status }) => {
      requireAdmin(ctx);
      if (status) updateWordStatus(ctx.db, wordId, status);
      if (word !== undefined || meaning !== undefined || description !== undefined || category !== undefined) {
        updateWord(ctx.db, wordId, { word, meaning, description, category });
      }
      auditDictionary(ctx, 'update_dictionary_word', { wordId, status });
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );

  server.tool(
    'delete_dictionary_word',
    'Delete a dictionary word. Admin API keys may delete any word; regular API keys may delete only their own pending/rejected suggestions.',
    {
      wordId: z.string().max(256).describe('Word row ID'),
    },
    async ({ wordId }) => {
      const row = getWordOwnerAndStatus(ctx, wordId);
      if (!row) return { content: [{ type: 'text' as const, text: 'Word not found' }], isError: true };
      if (!isAdmin(ctx) && (row.created_by !== ctx.keyInfo.userId || !['pending', 'rejected'].includes(row.status))) {
        throw new Error('Access denied: cannot delete this dictionary word');
      }
      deleteWord(ctx.db, wordId);
      auditDictionary(ctx, 'delete_dictionary_word', { wordId });
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );

  server.tool(
    'import_dictionary_words',
    'Bulk import words into a dictionary. Requires an admin API key. Creates or updates words case-insensitively.',
    {
      dictionaryId: z.string().max(256).optional().describe('Dictionary ID, defaults to the site default dictionary'),
      status: z.enum(['approved', 'pending', 'rejected']).optional().describe('Imported word status, default approved'),
      words: z.array(z.object({
        word: z.string().min(1).max(256),
        meaning: z.string().min(1).max(1000),
        description: z.string().max(2000).optional(),
        category: z.string().max(256).optional(),
      })).max(MAX_IMPORT_WORDS).describe('Words to import'),
    },
    async ({ dictionaryId, status, words }) => {
      requireAdmin(ctx);
      const result = importWords(ctx.db, words, ctx.keyInfo.userId, dictionaryId, status ?? 'approved');
      auditDictionary(ctx, 'import_dictionary_words', { dictionaryId, status: status ?? 'approved', ...result, errors: result.errors.length });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'export_dictionary_words',
    'Export approved words from a dictionary as JSON. Limited to 10,000 words.',
    {
      dictionaryId: z.string().max(256).optional().describe('Dictionary ID, defaults to the site default dictionary'),
    },
    async ({ dictionaryId }) => {
      const { total } = listWords(ctx.db, { dictionaryId, limit: 0 });
      if (total > MAX_EXPORT_WORDS) {
        return { content: [{ type: 'text' as const, text: `Dictionary export is limited to ${MAX_EXPORT_WORDS} words` }], isError: true };
      }
      const { words } = listWords(ctx.db, { dictionaryId, limit: MAX_EXPORT_WORDS });
      return { content: [{ type: 'text' as const, text: JSON.stringify(words, null, 2) }] };
    },
  );

  server.tool(
    'set_project_dictionary',
    'Set or clear the dictionary used by a project for naming-rule validation. Requires editor access to the project.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      dictionaryId: z.string().max(256).nullable().optional().describe('Dictionary ID to use, or null/omitted to clear and use the default'),
    },
    async ({ projectId, dictionaryId }) => {
      ctx.requireAccess(projectId, 'editor');
      if (dictionaryId && !dictionaryExists(ctx, dictionaryId)) {
        return { content: [{ type: 'text' as const, text: `Dictionary ${dictionaryId} not found` }], isError: true };
      }
      const schema = ctx.getSchemaOrFail(projectId);
      const updated = { ...schema, dictionaryId: dictionaryId || undefined, updatedAt: new Date().toISOString() };
      ctx.saveAndNotify(projectId, updated);
      ctx.mcpAudit('set_project_dictionary', projectId, { dictionaryId: dictionaryId || null });
      return { content: [{ type: 'text' as const, text: 'OK' }] };
    },
  );

  server.tool(
    'set_project_naming_rules',
    'Set or clear project naming-rule overrides. Only enabled site rules with project override allowed can be changed. Requires editor access to the project.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      overrides: z.object({
        tableCase: CASE_OVERRIDE_SCHEMA.optional().describe('Override table case. Use string for value, object for enabled/value, or null to clear'),
        columnCase: CASE_OVERRIDE_SCHEMA.optional().describe('Override column case. Use string for value, object for enabled/value, or null to clear'),
        tablePrefix: AFFIX_OVERRIDE_SCHEMA.optional().describe('Override table prefix. Use string for value, object for enabled/value, or null to clear'),
        tableSuffix: AFFIX_OVERRIDE_SCHEMA.optional().describe('Override table suffix. Use string for value, object for enabled/value, or null to clear'),
        columnPrefix: AFFIX_OVERRIDE_SCHEMA.optional().describe('Override column prefix. Use string for value, object for enabled/value, or null to clear'),
        columnSuffix: AFFIX_OVERRIDE_SCHEMA.optional().describe('Override column suffix. Use string for value, object for enabled/value, or null to clear'),
        dictionaryCheck: DICTIONARY_CHECK_OVERRIDE_SCHEMA.optional().describe('Override dictionary check target. Use string for value, object for enabled/value, or null to clear'),
      }).strict().describe('Rule override values. Omitted keys are left unchanged; null clears an existing override. enabled=false disables an allowed project rule.'),
    },
    async ({ projectId, overrides }) => {
      ctx.requireAccess(projectId, 'editor');
      const siteRules = readNamingRules(ctx);
      const schema = ctx.getSchemaOrFail(projectId);
      const nextOverrides: ProjectNamingOverrides = { ...(schema.namingRules ?? {}) };

      for (const [rawType, value] of Object.entries(overrides)) {
        const type = rawType as NamingRuleType;
        if (value === null) {
          delete nextOverrides[type];
          continue;
        }

        const siteRule = siteRules[type];
        if (!siteRule?.enabled) throw new Error(`${type} is disabled by admin`);
        if (!siteRule.allowOverride) throw new Error(`${type} is locked by admin`);

        if (value !== undefined) {
          const incoming = normalizeIncomingOverride(value as ProjectNamingOverrideValue);
          const current = normalizeProjectNamingOverride(nextOverrides[type]) ?? {};
          const next: ProjectNamingOverrideEntry = { ...current, ...incoming };
          if (next.value !== undefined) validateNamingRuleValue(type, next.value);
          if (next.enabled === undefined && next.value === undefined) {
            delete nextOverrides[type];
          } else {
            nextOverrides[type] = next;
          }
        } else if (value === undefined) {
          delete nextOverrides[type];
        }
      }

      const updated = {
        ...schema,
        namingRules: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
        updatedAt: new Date().toISOString(),
      };
      ctx.saveAndNotify(projectId, updated);
      ctx.mcpAudit('set_project_naming_rules', projectId, { overrides });

      const state = describeNamingRuleState(siteRules, updated.namingRules);
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        projectOverrides: updated.namingRules ?? {},
        ...state,
      }, null, 2) }] };
    },
  );

  server.tool(
    'get_naming_rules',
    'Get site naming rules. If projectId is provided, also returns project overrides, rule status, and effective rules for that project.',
    {
      projectId: z.string().max(256).optional().describe('Optional project ID for project-specific effective rules'),
    },
    async ({ projectId }) => {
      const siteRules = readNamingRules(ctx);
      if (!projectId) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ siteRules }, null, 2) }] };
      }
      ctx.requireAccess(projectId, 'viewer');
      const schema = ctx.getSchemaOrFail(projectId);
      const state = describeNamingRuleState(siteRules, schema.namingRules);
      const result = {
        siteRules,
        projectDictionaryId: schema.dictionaryId ?? null,
        projectOverrides: schema.namingRules ?? {},
        ...state,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
};
