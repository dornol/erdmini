import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockRun, mockAll, mockPrepare } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockRun = vi.fn();
  const mockAll = vi.fn();
  const mockPrepare = vi.fn((_sql: string) => ({ get: mockGet, run: mockRun, all: mockAll }));
  return { mockGet, mockRun, mockAll, mockPrepare };
});

vi.mock('$lib/server/db', () => ({
  default: { prepare: mockPrepare },
}));

import { listUserProjects, checkAccess, getSchema, saveSchema } from './db-helpers';
import type { ERDSchema } from '$lib/types/erd';

const mockDb = { prepare: mockPrepare } as any;

function makeProjectIndex(projects: { id: string; name: string }[]) {
  return JSON.stringify({
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      lastOpenedAt: '2024-01-01',
    })),
  });
}

describe('listUserProjects', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAll.mockReset();
    mockPrepare.mockClear();
  });

  it('admin sees all projects from all users', () => {
    mockAll.mockReturnValue([
      { data: makeProjectIndex([{ id: 'p1', name: 'Project 1' }]) },
      { data: makeProjectIndex([{ id: 'p2', name: 'Project 2' }]) },
    ]);

    const result = listUserProjects(mockDb, 'admin1', 'admin');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('p1');
    expect(result[1].id).toBe('p2');
  });

  it('regular user sees own projects', () => {
    // First call: own projects
    mockGet.mockReturnValue({ data: makeProjectIndex([{ id: 'p1', name: 'My Project' }]) });
    // Second call: shared project permissions
    mockAll.mockReturnValue([]);

    const result = listUserProjects(mockDb, 'user1', 'user');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('My Project');
  });

  it('regular user with no projects returns empty', () => {
    mockGet.mockReturnValue(undefined);
    mockAll.mockReturnValue([]);

    const result = listUserProjects(mockDb, 'user1', 'user');
    expect(result).toEqual([]);
  });

  it('scoped API key only returns scoped projects', () => {
    mockAll.mockReturnValue([
      { data: makeProjectIndex([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }]) },
    ]);

    const scopes = [{ projectId: 'p1', permission: 'editor' as const }];
    const result = listUserProjects(mockDb, 'user1', 'user', scopes);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  it('scoped API key with no matching projects returns empty', () => {
    mockAll.mockReturnValue([
      { data: makeProjectIndex([{ id: 'p1', name: 'A' }]) },
    ]);

    const scopes = [{ projectId: 'nonexistent', permission: 'viewer' as const }];
    const result = listUserProjects(mockDb, 'user1', 'user', scopes);
    expect(result).toEqual([]);
  });

  it('handles malformed JSON gracefully', () => {
    mockAll.mockReturnValue([
      { data: 'not json' },
      { data: makeProjectIndex([{ id: 'p1', name: 'Valid' }]) },
    ]);

    const result = listUserProjects(mockDb, 'admin1', 'admin');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });
});

describe('checkAccess', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAll.mockReset();
    mockPrepare.mockClear();
  });

  it('admin always has access', () => {
    expect(checkAccess(mockDb, 'proj1', 'admin1', 'admin', 'owner')).toBe(true);
  });

  it('owner of project has owner access', () => {
    // project_index lookup returns the project
    mockGet
      .mockReturnValueOnce({ data: makeProjectIndex([{ id: 'proj1', name: 'My' }]) });

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'owner')).toBe(true);
  });

  it('permission table grants access', () => {
    // project_index lookup returns no project
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ permission: 'editor' });

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'editor')).toBe(true);
  });

  it('insufficient permission denies access', () => {
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ permission: 'viewer' });

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'editor')).toBe(false);
  });

  it('no permission and no project ownership denies access', () => {
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'viewer')).toBe(false);
  });

  it('scoped API key allows if scope matches', () => {
    // project_index returns the project (user owns it)
    mockGet.mockReturnValueOnce({ data: makeProjectIndex([{ id: 'proj1', name: 'A' }]) });

    const scopes = [{ projectId: 'proj1', permission: 'editor' as const }];
    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'editor', scopes)).toBe(true);
  });

  it('scoped API key denies if project not in scopes', () => {
    const scopes = [{ projectId: 'other', permission: 'editor' as const }];
    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'viewer', scopes)).toBe(false);
  });

  it('scoped API key denies if scope permission insufficient', () => {
    const scopes = [{ projectId: 'proj1', permission: 'viewer' as const }];
    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'editor', scopes)).toBe(false);
  });
});

describe('checkAccess — group permissions', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAll.mockReset();
    mockPrepare.mockClear();
  });

  it('group permission grants access when no direct permission', () => {
    // project_index: no ownership
    mockGet
      .mockReturnValueOnce(undefined)  // project_index
      .mockReturnValueOnce(undefined); // direct permission
    // group permission: editor
    mockAll.mockReturnValue([{ permission: 'editor' }]);

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'editor')).toBe(true);
  });

  it('group viewer grants viewer access', () => {
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);
    mockAll.mockReturnValue([{ permission: 'viewer' }]);

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'viewer')).toBe(true);
  });

  it('group viewer denies editor access', () => {
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);
    mockAll.mockReturnValue([{ permission: 'viewer' }]);

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'editor')).toBe(false);
  });

  it('group editor + direct viewer → editor access granted', () => {
    mockGet
      .mockReturnValueOnce(undefined)  // no project ownership
      .mockReturnValueOnce({ permission: 'viewer' }); // direct: viewer
    mockAll.mockReturnValue([{ permission: 'editor' }]); // group: editor

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'editor')).toBe(true);
  });

  it('direct owner + group viewer → owner access granted', () => {
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ permission: 'owner' }); // direct: owner
    mockAll.mockReturnValue([{ permission: 'viewer' }]); // group: viewer

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'owner')).toBe(true);
  });

  it('multiple groups — picks highest for access check', () => {
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);
    mockAll.mockReturnValue([
      { permission: 'viewer' },
      { permission: 'editor' },
      { permission: 'viewer' },
    ]);

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'editor')).toBe(true);
    // But not owner
  });

  it('no direct, no group → denies access', () => {
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);
    mockAll.mockReturnValue([]);

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'viewer')).toBe(false);
  });

  it('group owner permission grants owner access', () => {
    mockGet
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);
    mockAll.mockReturnValue([{ permission: 'owner' }]);

    expect(checkAccess(mockDb, 'proj1', 'user1', 'user', 'owner')).toBe(true);
  });
});

describe('listUserProjects — group permissions', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAll.mockReset();
    mockPrepare.mockClear();
  });

  it('includes group-shared projects for regular user', () => {
    // Own projects
    mockGet.mockReturnValue({ data: makeProjectIndex([{ id: 'p1', name: 'Own' }]) });
    // Call sequence for mockAll:
    // 1. direct permissions → none
    // 2. group permissions → p2
    // 3. all project_index rows → contains p2
    mockAll
      .mockReturnValueOnce([])  // direct permissions
      .mockReturnValueOnce([{ project_id: 'p2' }])  // group permissions
      .mockReturnValueOnce([  // all project_index rows
        { data: makeProjectIndex([{ id: 'p2', name: 'Group Shared' }]) },
      ]);

    const result = listUserProjects(mockDb, 'user1', 'user');
    expect(result).toHaveLength(2);
    expect(result.map(p => p.id)).toContain('p1');
    expect(result.map(p => p.id)).toContain('p2');
  });

  it('deduplicates direct and group shared projects', () => {
    mockGet.mockReturnValue({ data: makeProjectIndex([{ id: 'p1', name: 'Own' }]) });
    // Both direct and group point to p2
    mockAll
      .mockReturnValueOnce([{ project_id: 'p2' }])  // direct permissions
      .mockReturnValueOnce([{ project_id: 'p2' }])  // group permissions (same project)
      .mockReturnValueOnce([
        { data: makeProjectIndex([{ id: 'p2', name: 'Shared' }]) },
      ]);

    const result = listUserProjects(mockDb, 'user1', 'user');
    expect(result).toHaveLength(2); // p1 + p2 (not p2 twice)
    const p2s = result.filter(p => p.id === 'p2');
    expect(p2s).toHaveLength(1);
  });

  it('does not duplicate own projects that are also group-shared', () => {
    mockGet.mockReturnValue({ data: makeProjectIndex([{ id: 'p1', name: 'Own' }]) });
    mockAll
      .mockReturnValueOnce([])  // direct permissions
      .mockReturnValueOnce([{ project_id: 'p1' }]);  // group shares p1 (already owned)
    // No call 3 since sharedIds should be empty (p1 filtered by ownIds)

    const result = listUserProjects(mockDb, 'user1', 'user');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  it('empty group permissions still works', () => {
    mockGet.mockReturnValue({ data: makeProjectIndex([{ id: 'p1', name: 'Own' }]) });
    mockAll
      .mockReturnValueOnce([])  // direct
      .mockReturnValueOnce([]);  // group

    const result = listUserProjects(mockDb, 'user1', 'user');
    expect(result).toHaveLength(1);
  });
});

describe('getSchema', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPrepare.mockClear();
  });

  it('returns parsed schema', () => {
    const schema: ERDSchema = {
      version: '1',
      tables: [{ id: 't1', name: 'users', columns: [], foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 0, y: 0 } }],
      domains: [],
      memos: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };
    mockGet.mockReturnValue({ data: JSON.stringify(schema) });

    const result = getSchema(mockDb, 'proj1');
    expect(result).not.toBeNull();
    expect(result!.tables).toHaveLength(1);
    expect(result!.tables[0].name).toBe('users');
  });

  it('returns null for non-existent project', () => {
    mockGet.mockReturnValue(undefined);
    expect(getSchema(mockDb, 'nonexistent')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    mockGet.mockReturnValue({ data: 'not valid json {{' });
    expect(getSchema(mockDb, 'proj1')).toBeNull();
  });
});

describe('saveSchema', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockPrepare.mockClear();
  });

  it('saves schema with upsert', () => {
    const schema: ERDSchema = {
      version: '1',
      tables: [],
      domains: [],
      memos: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    saveSchema(mockDb, 'proj1', schema);

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    const sql = mockPrepare.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO schemas');
    expect(sql).toContain('ON CONFLICT');
    expect(mockRun).toHaveBeenCalledWith('proj1', expect.any(String));
  });

  it('updates updatedAt timestamp', () => {
    const schema: ERDSchema = {
      version: '1',
      tables: [],
      domains: [],
      memos: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    const before = new Date().toISOString();
    saveSchema(mockDb, 'proj1', schema);

    expect(schema.updatedAt).not.toBe('2024-01-01');
    expect(new Date(schema.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000);
  });

  it('serializes schema to JSON string', () => {
    const schema: ERDSchema = {
      version: '1',
      tables: [{ id: 't1', name: 'users', columns: [], foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 0, y: 0 } }],
      domains: [],
      memos: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    saveSchema(mockDb, 'proj1', schema);

    const jsonArg = mockRun.mock.calls[0][1] as string;
    const parsed = JSON.parse(jsonArg);
    expect(parsed.tables[0].name).toBe('users');
  });
});
