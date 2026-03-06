import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ProjectStore uses Svelte 5 runes ($state) so it can't be imported directly in vitest.
 * These tests verify the extracted logic patterns for:
 * - loadProjectSchema pruning behavior (stale shared project removal)
 * - migrate() empty-index + canCreateProject behavior
 */

// ─── loadProjectSchema pruning logic ───

interface ProjectMeta {
  id: string;
  name: string;
}

interface ProjectIndex {
  version: string;
  activeProjectId: string;
  projects: ProjectMeta[];
}

function simulateLoadProjectSchema(
  index: ProjectIndex,
  projectId: string,
  schemaAvailable: (id: string) => boolean,
  saveIndex: (idx: ProjectIndex) => void,
): { ok: boolean; index: ProjectIndex } {
  if (!schemaAvailable(projectId)) {
    const had = index.projects.some((p) => p.id === projectId);
    if (had) {
      index.projects = index.projects.filter((p) => p.id !== projectId);
      if (index.projects.length > 0) {
        index.activeProjectId = index.projects[0].id;
        saveIndex(index);
        return simulateLoadProjectSchema(index, index.activeProjectId, schemaAvailable, saveIndex);
      }
      index.activeProjectId = '';
      saveIndex(index);
    }
    return { ok: false, index };
  }
  return { ok: true, index };
}

describe('loadProjectSchema pruning logic', () => {
  it('returns ok when schema is available', () => {
    const index: ProjectIndex = {
      version: '1',
      activeProjectId: 'p1',
      projects: [{ id: 'p1', name: 'Project 1' }],
    };
    const saveIndex = vi.fn();
    const result = simulateLoadProjectSchema(index, 'p1', () => true, saveIndex);
    expect(result.ok).toBe(true);
    expect(result.index.projects).toHaveLength(1);
    expect(saveIndex).not.toHaveBeenCalled();
  });

  it('prunes inaccessible project and switches to next', () => {
    const index: ProjectIndex = {
      version: '1',
      activeProjectId: 'shared1',
      projects: [
        { id: 'shared1', name: '[shared] Revoked' },
        { id: 'p2', name: 'My Project' },
      ],
    };
    const saveIndex = vi.fn();
    const result = simulateLoadProjectSchema(
      index, 'shared1',
      (id) => id !== 'shared1', // shared1 returns 403
      saveIndex,
    );
    expect(result.ok).toBe(true);
    expect(result.index.projects).toHaveLength(1);
    expect(result.index.projects[0].id).toBe('p2');
    expect(result.index.activeProjectId).toBe('p2');
    expect(saveIndex).toHaveBeenCalled();
  });

  it('prunes the only project and empties index', () => {
    const index: ProjectIndex = {
      version: '1',
      activeProjectId: 'shared1',
      projects: [{ id: 'shared1', name: '[shared] Only Project' }],
    };
    const saveIndex = vi.fn();
    const result = simulateLoadProjectSchema(
      index, 'shared1',
      () => false,
      saveIndex,
    );
    expect(result.ok).toBe(false);
    expect(result.index.projects).toHaveLength(0);
    expect(result.index.activeProjectId).toBe('');
    expect(saveIndex).toHaveBeenCalledWith(expect.objectContaining({
      activeProjectId: '',
      projects: [],
    }));
  });

  it('prunes multiple inaccessible projects until finding an accessible one', () => {
    const index: ProjectIndex = {
      version: '1',
      activeProjectId: 'shared1',
      projects: [
        { id: 'shared1', name: '[shared] Revoked 1' },
        { id: 'shared2', name: '[shared] Revoked 2' },
        { id: 'p3', name: 'My Own Project' },
      ],
    };
    const saveIndex = vi.fn();
    const result = simulateLoadProjectSchema(
      index, 'shared1',
      (id) => id === 'p3', // only p3 is accessible
      saveIndex,
    );
    expect(result.ok).toBe(true);
    expect(result.index.projects).toHaveLength(1);
    expect(result.index.projects[0].id).toBe('p3');
    expect(result.index.activeProjectId).toBe('p3');
  });

  it('prunes all projects when none are accessible', () => {
    const index: ProjectIndex = {
      version: '1',
      activeProjectId: 'shared1',
      projects: [
        { id: 'shared1', name: '[shared] Revoked 1' },
        { id: 'shared2', name: '[shared] Revoked 2' },
      ],
    };
    const saveIndex = vi.fn();
    const result = simulateLoadProjectSchema(
      index, 'shared1',
      () => false,
      saveIndex,
    );
    expect(result.ok).toBe(false);
    expect(result.index.projects).toHaveLength(0);
    expect(result.index.activeProjectId).toBe('');
  });

  it('does not prune if project is not in index', () => {
    const index: ProjectIndex = {
      version: '1',
      activeProjectId: 'p1',
      projects: [{ id: 'p1', name: 'Project 1' }],
    };
    const saveIndex = vi.fn();
    const result = simulateLoadProjectSchema(
      index, 'unknown-id',
      () => false,
      saveIndex,
    );
    expect(result.ok).toBe(false);
    // p1 should remain — only 'unknown-id' was queried, not in index
    expect(result.index.projects).toHaveLength(1);
    expect(saveIndex).not.toHaveBeenCalled();
  });
});

// ─── migrate() empty-index + canCreateProject logic ───

describe('migrate empty-index + canCreateProject logic', () => {
  function simulateMigrate(
    existingIndex: ProjectIndex | null,
    user: { canCreateProject: boolean } | null,
  ): { action: 'load' | 'createDefault' | 'emptyNoPermission' } {
    if (existingIndex) {
      if (existingIndex.projects.length === 0 && (!user || user.canCreateProject)) {
        return { action: 'createDefault' };
      }
      return { action: 'load' };
    }
    if (user && !user.canCreateProject) {
      return { action: 'emptyNoPermission' };
    }
    return { action: 'createDefault' };
  }

  it('creates default project when empty index and user has canCreateProject', () => {
    const result = simulateMigrate(
      { version: '1', activeProjectId: '', projects: [] },
      { canCreateProject: true },
    );
    expect(result.action).toBe('createDefault');
  });

  it('creates default project when empty index and no user (local mode)', () => {
    const result = simulateMigrate(
      { version: '1', activeProjectId: '', projects: [] },
      null,
    );
    expect(result.action).toBe('createDefault');
  });

  it('loads existing index when it has projects', () => {
    const result = simulateMigrate(
      { version: '1', activeProjectId: 'p1', projects: [{ id: 'p1', name: 'X' }] },
      { canCreateProject: true },
    );
    expect(result.action).toBe('load');
  });

  it('loads empty index without creating project when user lacks permission', () => {
    const result = simulateMigrate(
      { version: '1', activeProjectId: '', projects: [] },
      { canCreateProject: false },
    );
    expect(result.action).toBe('load');
  });

  it('skips default project when no index and user lacks permission', () => {
    const result = simulateMigrate(null, { canCreateProject: false });
    expect(result.action).toBe('emptyNoPermission');
  });

  it('creates default project when no index and no user (local mode)', () => {
    const result = simulateMigrate(null, null);
    expect(result.action).toBe('createDefault');
  });

  it('creates default project when no index and user has permission', () => {
    const result = simulateMigrate(null, { canCreateProject: true });
    expect(result.action).toBe('createDefault');
  });

  // Key scenario: user had no permission → saved empty index → permission granted → re-login
  it('creates default project when permission was granted after empty index was saved', () => {
    // Previously saved empty index because user had no canCreateProject
    const emptyIndex: ProjectIndex = { version: '1', activeProjectId: '', projects: [] };
    // Now user has canCreateProject
    const result = simulateMigrate(emptyIndex, { canCreateProject: true });
    expect(result.action).toBe('createDefault');
  });
});

// ─── ensureOwnerPermission guard logic (index PUT endpoint) ───

describe('ensureOwnerPermission guard in index PUT', () => {
  function simulateIndexPut(
    existingProjectIds: string[],
    newProjects: { id: string }[],
    schemaExists: (id: string) => boolean,
  ): { ensureOwnerCalled: string[]; permissionCheckNeeded: boolean } {
    const existingIds = new Set(existingProjectIds);
    const ensureOwnerCalled: string[] = [];

    const newProjectIds = newProjects
      .filter((p) => !existingIds.has(p.id))
      .map((p) => p.id);

    let permissionCheckNeeded = false;
    if (newProjectIds.length > 0) {
      const hasNewOwnProject = newProjectIds.some((id) => !schemaExists(id));
      if (hasNewOwnProject) {
        permissionCheckNeeded = true;
      }
    }

    for (const proj of newProjects) {
      if (!existingIds.has(proj.id)) {
        const hasSchema = schemaExists(proj.id);
        if (!hasSchema) {
          ensureOwnerCalled.push(proj.id);
        }
      }
    }

    return { ensureOwnerCalled, permissionCheckNeeded };
  }

  it('calls ensureOwnerPermission for genuinely new project', () => {
    const result = simulateIndexPut(
      [], // no existing projects
      [{ id: 'new1' }],
      () => false, // no schema exists
    );
    expect(result.ensureOwnerCalled).toEqual(['new1']);
    expect(result.permissionCheckNeeded).toBe(true);
  });

  it('does NOT call ensureOwnerPermission for shared project (schema exists)', () => {
    const result = simulateIndexPut(
      [], // not in existing index
      [{ id: 'shared1' }],
      (id) => id === 'shared1', // shared project has schema row
    );
    expect(result.ensureOwnerCalled).toEqual([]);
    expect(result.permissionCheckNeeded).toBe(false);
  });

  it('does NOT call ensureOwnerPermission for already-existing project in index', () => {
    const result = simulateIndexPut(
      ['p1'], // already in index
      [{ id: 'p1' }],
      () => true,
    );
    expect(result.ensureOwnerCalled).toEqual([]);
    expect(result.permissionCheckNeeded).toBe(false);
  });

  it('handles mix of new own and shared projects correctly', () => {
    const result = simulateIndexPut(
      ['existing1'],
      [
        { id: 'existing1' },
        { id: 'new-own' },
        { id: 'shared-proj' },
      ],
      (id) => id === 'shared-proj', // only shared-proj has schema
    );
    expect(result.ensureOwnerCalled).toEqual(['new-own']);
    expect(result.permissionCheckNeeded).toBe(true);
  });

  it('requires permission check when at least one genuinely new project', () => {
    const result = simulateIndexPut(
      [],
      [{ id: 'shared1' }, { id: 'new1' }],
      (id) => id === 'shared1',
    );
    expect(result.ensureOwnerCalled).toEqual(['new1']);
    expect(result.permissionCheckNeeded).toBe(true);
  });

  it('does NOT require permission check when all new projects are shared', () => {
    const result = simulateIndexPut(
      [],
      [{ id: 'shared1' }, { id: 'shared2' }],
      () => true, // all have schema rows
    );
    expect(result.ensureOwnerCalled).toEqual([]);
    expect(result.permissionCheckNeeded).toBe(false);
  });

  // Key scenario: share revoked → user saves index → should NOT recreate owner
  it('does NOT recreate owner permission after share revocation', () => {
    // User had shared project, it was in their index. Share revoked.
    // Client-side pruned it. But suppose client re-adds it (stale state):
    const result = simulateIndexPut(
      [], // empty existing (fresh login)
      [{ id: 'previously-shared' }],
      (id) => id === 'previously-shared', // schema still exists on server
    );
    // Should NOT call ensureOwnerPermission because schema exists
    expect(result.ensureOwnerCalled).toEqual([]);
  });
});
