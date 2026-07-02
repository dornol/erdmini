import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpToolContext } from './types';
import type { ERDSchema } from '$lib/types/erd';

const {
  mockCreateWord,
  mockListDictionaries,
  mockListDictionariesWithUsage,
  mockListWords,
} = vi.hoisted(() => ({
  mockCreateWord: vi.fn(),
  mockListDictionaries: vi.fn(),
  mockListDictionariesWithUsage: vi.fn(),
  mockListWords: vi.fn(),
}));

vi.mock('$lib/server/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('$lib/server/dictionary', () => ({
  cloneDictionary: vi.fn(),
  createDictionary: vi.fn(),
  createWord: mockCreateWord,
  deleteDictionary: vi.fn(),
  deleteWord: vi.fn(),
  getDictionaryUsage: vi.fn(),
  importWords: vi.fn(),
  listDictionaries: mockListDictionaries,
  listDictionariesWithUsage: mockListDictionariesWithUsage,
  listProjectsUsingDictionary: vi.fn(),
  listWords: mockListWords,
  setDefaultDictionary: vi.fn(),
  updateDictionary: vi.fn(),
  updateWord: vi.fn(),
  updateWordStatus: vi.fn(),
}));

import { registerDictionaryTools } from './dictionary-tools';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function makeServer() {
  const tools = new Map<string, ToolHandler>();
  return {
    tools,
    server: {
      tool(name: string, _description: string, _schema: unknown, handler: ToolHandler) {
        tools.set(name, handler);
      },
    },
  };
}

function makeSchema(overrides: Partial<ERDSchema> = {}): ERDSchema {
  return {
    version: '1',
    tables: [],
    domains: [],
    memos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCtx(role: 'admin' | 'user' = 'user', schema = makeSchema()): McpToolContext {
  const prepare = vi.fn((sql: string) => ({
    get: vi.fn(() => {
      if (sql.includes('FROM dictionaries')) return { id: 'dict1' };
      if (sql.includes('site_settings')) {
        return { value: JSON.stringify({ dictionaryCheck: { enabled: true, value: 'both', allowOverride: true } }) };
      }
      return undefined;
    }),
    all: vi.fn(() => []),
    run: vi.fn(),
  }));

  return {
    db: { prepare } as never,
    keyInfo: {
      userId: 'u1',
      userRole: role,
      displayName: 'User 1',
      keyId: 'key1',
      scopes: null,
    },
    requireAccess: vi.fn(),
    getSchemaOrFail: vi.fn(() => schema),
    saveAndNotify: vi.fn(),
    mcpAudit: vi.fn(),
    mergeOrReplaceSchema: vi.fn(),
  };
}

function mockSiteRules(ctx: McpToolContext, rules: Record<string, unknown>): void {
  vi.mocked(ctx.db.prepare).mockImplementation((sql: string) => ({
    get: vi.fn(() => {
      if (sql.includes('FROM dictionaries')) return { id: 'dict1' };
      if (sql.includes('site_settings')) return { value: JSON.stringify(rules) };
      return undefined;
    }),
    all: vi.fn(() => []),
    run: vi.fn(),
  }) as never);
}

async function call(tools: Map<string, ToolHandler>, name: string, args: Record<string, unknown> = {}) {
  const handler = tools.get(name);
  if (!handler) throw new Error(`Tool not registered: ${name}`);
  return handler(args);
}

describe('registerDictionaryTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDictionaries.mockReturnValue([{ id: 'default', name: 'Default', is_default: 1 }]);
    mockListDictionariesWithUsage.mockReturnValue([{ id: 'default', name: 'Default', is_default: 1, wordCount: 2 }]);
    mockListWords.mockReturnValue({ words: [], total: 0 });
    mockCreateWord.mockReturnValue({ id: 'w1', dictionary_id: 'dict1', word: 'acct', status: 'pending' });
  });

  it('registers dictionary MCP tools', () => {
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, makeCtx());

    expect([...tools.keys()]).toEqual(expect.arrayContaining([
      'list_dictionaries',
      'list_dictionary_words',
      'add_dictionary_word',
      'set_project_dictionary',
      'set_project_naming_rules',
      'get_naming_rules',
    ]));
  });

  it('lists usage details for admin keys only', async () => {
    const admin = makeServer();
    registerDictionaryTools(admin.server as never, makeCtx('admin'));
    await call(admin.tools, 'list_dictionaries');
    expect(mockListDictionariesWithUsage).toHaveBeenCalled();

    const user = makeServer();
    registerDictionaryTools(user.server as never, makeCtx('user'));
    await call(user.tools, 'list_dictionaries');
    expect(mockListDictionaries).toHaveBeenCalled();
  });

  it('creates pending suggestions for non-admin word additions', async () => {
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, makeCtx('user'));

    await call(tools, 'add_dictionary_word', { dictionaryId: 'dict1', word: 'acct', meaning: 'Account', status: 'approved' });

    expect(mockCreateWord).toHaveBeenCalledWith(expect.anything(), {
      dictionaryId: 'dict1',
      word: 'acct',
      meaning: 'Account',
      description: undefined,
      category: undefined,
      status: 'pending',
    }, 'u1');
  });

  it('sets the project dictionary with editor access', async () => {
    const schema = makeSchema();
    const ctx = makeCtx('user', schema);
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    await call(tools, 'set_project_dictionary', { projectId: 'p1', dictionaryId: 'dict1' });

    expect(ctx.requireAccess).toHaveBeenCalledWith('p1', 'editor');
    expect(ctx.saveAndNotify).toHaveBeenCalledWith('p1', expect.objectContaining({ dictionaryId: 'dict1' }));
    expect(ctx.mcpAudit).toHaveBeenCalledWith('set_project_dictionary', 'p1', { dictionaryId: 'dict1' });
  });

  it('returns effective naming rules for a project', async () => {
    const ctx = makeCtx('user', makeSchema({ namingRules: { dictionaryCheck: 'table' }, dictionaryId: 'dict1' }));
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    const res = await call(tools, 'get_naming_rules', { projectId: 'p1' });
    const body = JSON.parse(res.content[0].text);

    expect(ctx.requireAccess).toHaveBeenCalledWith('p1', 'viewer');
    expect(body.projectDictionaryId).toBe('dict1');
    expect(body.effectiveRules.dictionaryCheck).toEqual({ value: 'table', source: 'project' });
    expect(body.ruleStatus.dictionaryCheck).toMatchObject({ status: 'project_override', allowOverride: true });
    expect(body.ruleStatus.dictionaryCheck.projectOverride).toEqual({ value: 'table' });
  });

  it('returns naming rule status for inherited, locked, disabled, project disabled, and project override rules', async () => {
    const ctx = makeCtx('user', makeSchema({ namingRules: { tablePrefix: 't_', dictionaryCheck: { enabled: false } } }));
    mockSiteRules(ctx, {
      tableCase: { enabled: true, value: 'snake_case', allowOverride: true },
      columnCase: { enabled: true, value: 'camelCase', allowOverride: false },
      tablePrefix: { enabled: true, value: 'tbl_', allowOverride: true },
      dictionaryCheck: { enabled: true, value: 'both', allowOverride: true },
      tableSuffix: { enabled: false, value: '_tbl', allowOverride: true },
    });
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    const res = await call(tools, 'get_naming_rules', { projectId: 'p1' });
    const body = JSON.parse(res.content[0].text);

    expect(body.ruleStatus.tableCase).toMatchObject({ status: 'inherited', value: 'snake_case', source: 'admin' });
    expect(body.ruleStatus.columnCase).toMatchObject({ status: 'admin_locked', value: 'camelCase', source: 'admin' });
    expect(body.ruleStatus.tablePrefix).toMatchObject({ status: 'project_override', value: 't_', source: 'project' });
    expect(body.ruleStatus.dictionaryCheck).toMatchObject({ status: 'project_disabled', value: 'both', source: null });
    expect(body.ruleStatus.tableSuffix).toMatchObject({ status: 'disabled', value: '_tbl', source: null });
  });

  it('sets allowed project naming rule overrides with editor access', async () => {
    const schema = makeSchema();
    const ctx = makeCtx('user', schema);
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    const res = await call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { dictionaryCheck: 'column' },
    });
    const body = JSON.parse(res.content[0].text);

    expect(ctx.requireAccess).toHaveBeenCalledWith('p1', 'editor');
    expect(ctx.saveAndNotify).toHaveBeenCalledWith('p1', expect.objectContaining({
      namingRules: { dictionaryCheck: { value: 'column' } },
    }));
    expect(ctx.mcpAudit).toHaveBeenCalledWith('set_project_naming_rules', 'p1', { overrides: { dictionaryCheck: 'column' } });
    expect(body.effectiveRules.dictionaryCheck).toEqual({ value: 'column', source: 'project' });
  });

  it('disables allowed project naming rules with editor access', async () => {
    const ctx = makeCtx('user', makeSchema());
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    const res = await call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { dictionaryCheck: { enabled: false } },
    });
    const body = JSON.parse(res.content[0].text);

    expect(ctx.saveAndNotify).toHaveBeenCalledWith('p1', expect.objectContaining({
      namingRules: { dictionaryCheck: { enabled: false } },
    }));
    expect(body.effectiveRules.dictionaryCheck).toBeUndefined();
    expect(body.ruleStatus.dictionaryCheck).toMatchObject({ status: 'project_disabled', source: null });
  });

  it('re-enables a project naming rule while preserving an override value', async () => {
    const ctx = makeCtx('user', makeSchema({ namingRules: { dictionaryCheck: { enabled: false, value: 'table' } } }));
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    const res = await call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { dictionaryCheck: { enabled: true } },
    });
    const body = JSON.parse(res.content[0].text);

    expect(ctx.saveAndNotify).toHaveBeenCalledWith('p1', expect.objectContaining({
      namingRules: { dictionaryCheck: { enabled: true, value: 'table' } },
    }));
    expect(body.effectiveRules.dictionaryCheck).toEqual({ value: 'table', source: 'project' });
  });

  it('clears project naming rule overrides with null values', async () => {
    const ctx = makeCtx('user', makeSchema({ namingRules: { dictionaryCheck: 'table' } }));
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    await call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { dictionaryCheck: null },
    });

    expect(ctx.saveAndNotify).toHaveBeenCalledWith('p1', expect.objectContaining({
      namingRules: undefined,
    }));
  });

  it('preserves omitted project naming rule overrides when updating another rule', async () => {
    const ctx = makeCtx('user', makeSchema({ namingRules: { tableCase: 'PascalCase', dictionaryCheck: 'table' } }));
    mockSiteRules(ctx, {
      tableCase: { enabled: true, value: 'snake_case', allowOverride: true },
      dictionaryCheck: { enabled: true, value: 'both', allowOverride: true },
    });
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    await call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { dictionaryCheck: null },
    });

    expect(ctx.saveAndNotify).toHaveBeenCalledWith('p1', expect.objectContaining({
      namingRules: { tableCase: 'PascalCase' },
    }));
  });

  it('allows clearing stale project overrides even when admin later disables the rule', async () => {
    const ctx = makeCtx('user', makeSchema({ namingRules: { dictionaryCheck: { enabled: false } } }));
    mockSiteRules(ctx, { dictionaryCheck: { enabled: false, value: 'both', allowOverride: true } });
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    await call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { dictionaryCheck: null },
    });

    expect(ctx.saveAndNotify).toHaveBeenCalledWith('p1', expect.objectContaining({
      namingRules: undefined,
    }));
  });

  it('rejects project naming rule overrides locked by admin', async () => {
    const ctx = makeCtx('user', makeSchema());
    mockSiteRules(ctx, { dictionaryCheck: { enabled: true, value: 'both', allowOverride: false } });
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    await expect(call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { dictionaryCheck: 'table' },
    })).rejects.toThrow('dictionaryCheck is locked by admin');
    expect(ctx.saveAndNotify).not.toHaveBeenCalled();
  });

  it('rejects project naming rule overrides disabled by admin', async () => {
    const ctx = makeCtx('user', makeSchema());
    mockSiteRules(ctx, { dictionaryCheck: { enabled: false, value: 'both', allowOverride: true } });
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    await expect(call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { dictionaryCheck: 'table' },
    })).rejects.toThrow('dictionaryCheck is disabled by admin');
    expect(ctx.saveAndNotify).not.toHaveBeenCalled();
  });

  it('rejects invalid project naming rule override values', async () => {
    const ctx = makeCtx('user', makeSchema());
    mockSiteRules(ctx, { tableCase: { enabled: true, value: 'snake_case', allowOverride: true } });
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    await expect(call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { tableCase: 'kebab-case' },
    })).rejects.toThrow('Invalid tableCase value');
    expect(ctx.saveAndNotify).not.toHaveBeenCalled();
  });

  it('accepts Pascal_Snake_Case naming rule overrides', async () => {
    const ctx = makeCtx('user', makeSchema());
    mockSiteRules(ctx, { columnCase: { enabled: true, value: 'snake_case', allowOverride: true } });
    const { server, tools } = makeServer();
    registerDictionaryTools(server as never, ctx);

    await call(tools, 'set_project_naming_rules', {
      projectId: 'p1',
      overrides: { columnCase: { value: 'Pascal_Snake_Case' } },
    });

    expect(ctx.saveAndNotify).toHaveBeenCalledWith('p1', expect.objectContaining({
      namingRules: { columnCase: { value: 'Pascal_Snake_Case' } },
    }));
  });
});
