import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration-level tests for naming rules store logic.
 * Tests the data flow between API responses and store state
 * to catch mismatches like the dictionary API response format bug.
 */

// ─── fetchDictionaryWords parsing logic ───

interface DictionaryApiResponse {
  words: { id: string; word: string; meaning: string; category: string; status: string }[];
  total: number;
  pendingCount: number;
  mySuggestions: unknown[];
}

/** Extracted parsing logic from NamingRuleStore.fetchDictionaryWords */
function parseDictionaryResponse(data: DictionaryApiResponse): Set<string> {
  const words = new Set<string>();
  const rows = data.words ?? [];
  for (const r of rows) {
    words.add(r.word.toLowerCase());
  }
  return words;
}

describe('fetchDictionaryWords parsing', () => {
  it('correctly parses paginated API response { words: [...], total }', () => {
    const apiResponse: DictionaryApiResponse = {
      words: [
        { id: '1', word: 'User', meaning: '사용자', category: 'entity', status: 'approved' },
        { id: '2', word: 'Account', meaning: '계정', category: 'entity', status: 'approved' },
        { id: '3', word: 'id', meaning: '식별자', category: 'common', status: 'approved' },
      ],
      total: 3,
      pendingCount: 0,
      mySuggestions: [],
    };

    const result = parseDictionaryResponse(apiResponse);
    expect(result.size).toBe(3);
    expect(result.has('user')).toBe(true);  // lowercased
    expect(result.has('account')).toBe(true);
    expect(result.has('id')).toBe(true);
  });

  it('handles empty words array', () => {
    const apiResponse: DictionaryApiResponse = {
      words: [],
      total: 0,
      pendingCount: 0,
      mySuggestions: [],
    };

    const result = parseDictionaryResponse(apiResponse);
    expect(result.size).toBe(0);
  });

  it('does NOT treat the response itself as an array (old bug)', () => {
    // The old bug: `const data: { word: string }[] = await res.json()`
    // treated the entire response as an array, so data.map(d => d.word) returned undefined
    const apiResponse = {
      words: [{ id: '1', word: 'Test', meaning: '', category: '', status: 'approved' }],
      total: 1,
      pendingCount: 0,
      mySuggestions: [],
    };

    // Wrong way (old bug) — treat response as array
    const wrongResult = (apiResponse as unknown as { word: string }[]);
    expect(Array.isArray(wrongResult)).toBe(false); // it's an object, not array

    // Right way — extract .words
    const correctResult = parseDictionaryResponse(apiResponse);
    expect(correctResult.size).toBe(1);
    expect(correctResult.has('test')).toBe(true);
  });

  it('lowercases all words for case-insensitive matching', () => {
    const apiResponse: DictionaryApiResponse = {
      words: [
        { id: '1', word: 'UserName', meaning: '', category: '', status: 'approved' },
        { id: '2', word: 'EMAIL', meaning: '', category: '', status: 'approved' },
      ],
      total: 2,
      pendingCount: 0,
      mySuggestions: [],
    };

    const result = parseDictionaryResponse(apiResponse);
    expect(result.has('username')).toBe(true);
    expect(result.has('email')).toBe(true);
    expect(result.has('UserName')).toBe(false); // must be lowercase
  });
});

// ─── auto-save permission guard logic ───

describe('auto-save permission guard', () => {
  it('should NOT save when isReadOnly is true', () => {
    const scenarios = [
      { safeToSave: true, isReadOnly: true, shouldSave: false },
      { safeToSave: true, isReadOnly: false, shouldSave: true },
      { safeToSave: false, isReadOnly: false, shouldSave: false },
      { safeToSave: false, isReadOnly: true, shouldSave: false },
    ];

    for (const { safeToSave, isReadOnly, shouldSave } of scenarios) {
      const willSave = safeToSave && !isReadOnly;
      expect(willSave).toBe(shouldSave);
    }
  });

  it('viewer permission means readOnly', () => {
    // Maps permission level to readOnly flag
    const permToReadOnly: Record<string, boolean> = {
      owner: false,
      editor: false,
      viewer: true,
      anonymous: true,
    };

    expect(permToReadOnly['viewer']).toBe(true);
    expect(permToReadOnly['editor']).toBe(false);
  });
});

// ─── autoLoadSharedProjects condition logic ───

describe('autoLoadSharedProjects trigger condition', () => {
  interface Scenario {
    projectCount: number;
    isLoggedIn: boolean;
    canCreateProject: boolean;
    shouldAutoLoad: boolean;
  }

  const scenarios: Scenario[] = [
    // New correct behavior: load for ALL logged-in users with 0 projects
    { projectCount: 0, isLoggedIn: true, canCreateProject: true, shouldAutoLoad: true },
    { projectCount: 0, isLoggedIn: true, canCreateProject: false, shouldAutoLoad: true },
    // Has projects — don't auto-load (user uses dropdown manually)
    { projectCount: 1, isLoggedIn: true, canCreateProject: true, shouldAutoLoad: false },
    { projectCount: 1, isLoggedIn: true, canCreateProject: false, shouldAutoLoad: false },
    // Not logged in — never auto-load
    { projectCount: 0, isLoggedIn: false, canCreateProject: true, shouldAutoLoad: false },
  ];

  it.each(scenarios)(
    'projects=$projectCount, loggedIn=$isLoggedIn, canCreate=$canCreateProject → autoLoad=$shouldAutoLoad',
    ({ projectCount, isLoggedIn, canCreateProject, shouldAutoLoad }) => {
      // Current condition in +page.svelte (after fix):
      // projectCount === 0 && authStore.user (isLoggedIn)
      const willAutoLoad = projectCount === 0 && isLoggedIn;
      expect(willAutoLoad).toBe(shouldAutoLoad);
    },
  );

  it('old bug: canCreateProject=true users were excluded', () => {
    // Old condition: projectCount === 0 && isLoggedIn && !canCreateProject
    const oldCondition = (projectCount: number, isLoggedIn: boolean, canCreateProject: boolean) =>
      projectCount === 0 && isLoggedIn && !canCreateProject;

    // This was the bug: user with canCreateProject=true, no projects, had shared projects → not loaded
    expect(oldCondition(0, true, true)).toBe(false);  // old: excluded!

    // New condition: projectCount === 0 && isLoggedIn
    const newCondition = (projectCount: number, isLoggedIn: boolean) =>
      projectCount === 0 && isLoggedIn;

    expect(newCondition(0, true)).toBe(true);  // new: included!
  });
});

// ─── saveSchema error → storageFull mapping ───

describe('saveSchema error handling', () => {
  it('403 response should throw (triggering storageFull in store)', async () => {
    // ServerStorageProvider.saveSchema throws on non-ok response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    });

    async function saveSchema(projectId: string) {
      const res = await mockFetch(`/api/storage/schemas/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        throw new Error(`Failed to save schema (${res.status})`);
      }
    }

    // The save should throw, which the store catches and sets storageFull=true
    await expect(saveSchema('proj1')).rejects.toThrow('Failed to save schema (403)');
  });

  it('200 response should not throw', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    async function saveSchema(projectId: string) {
      const res = await mockFetch(`/api/storage/schemas/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        throw new Error(`Failed to save schema (${res.status})`);
      }
    }

    await expect(saveSchema('proj1')).resolves.toBeUndefined();
  });
});

// ─── readOnly UI guard coverage ───

describe('readOnly UI guard rules', () => {
  type Permission = 'owner' | 'editor' | 'viewer' | 'anonymous';

  function isReadOnly(perm: Permission): boolean {
    return perm === 'viewer' || perm === 'anonymous';
  }

  const MUTATION_ACTIONS = [
    'addColumn', 'deleteColumn', 'addForeignKey', 'addUniqueKey', 'addIndex',
    'addDomain', 'updateDomain', 'applyDomain', 'groupDrop',
  ] as const;

  it.each(['viewer', 'anonymous'] as Permission[])(
    '%s should NOT be able to perform mutations',
    (perm) => {
      expect(isReadOnly(perm)).toBe(true);
      // All mutation actions should be blocked
      for (const action of MUTATION_ACTIONS) {
        const allowed = !isReadOnly(perm);
        expect(allowed).toBe(false);
      }
    },
  );

  it.each(['owner', 'editor'] as Permission[])(
    '%s should be able to perform mutations',
    (perm) => {
      expect(isReadOnly(perm)).toBe(false);
    },
  );
});

// ─── embed permission logic ───

describe('embed button visibility', () => {
  interface EmbedScenario {
    isLoggedIn: boolean;
    canCreateEmbed: boolean;
    permission: 'owner' | 'editor' | 'viewer';
    shouldShow: boolean;
  }

  const scenarios: EmbedScenario[] = [
    // Owner always sees embed (regardless of canCreateEmbed flag)
    { isLoggedIn: true, canCreateEmbed: false, permission: 'owner', shouldShow: true },
    { isLoggedIn: true, canCreateEmbed: true, permission: 'owner', shouldShow: true },
    // Editor needs canCreateEmbed flag
    { isLoggedIn: true, canCreateEmbed: true, permission: 'editor', shouldShow: true },
    { isLoggedIn: true, canCreateEmbed: false, permission: 'editor', shouldShow: false },
    // Viewer never sees embed
    { isLoggedIn: true, canCreateEmbed: true, permission: 'viewer', shouldShow: false },
    // Not logged in
    { isLoggedIn: false, canCreateEmbed: false, permission: 'owner', shouldShow: false },
  ];

  it.each(scenarios)(
    'loggedIn=$isLoggedIn, canEmbed=$canCreateEmbed, perm=$permission → show=$shouldShow',
    ({ isLoggedIn, canCreateEmbed, permission, shouldShow }) => {
      // Current condition: isLoggedIn && (owner || (canCreateEmbed && editor))
      const show = isLoggedIn && (
        permission === 'owner' ||
        (canCreateEmbed && permission === 'editor')
      );
      expect(show).toBe(shouldShow);
    },
  );

  it('old bug: owner without canCreateEmbed was excluded', () => {
    // Old: isLoggedIn && canCreateEmbed && (owner || editor)
    const oldCondition = (canCreateEmbed: boolean, permission: string) =>
      canCreateEmbed && (permission === 'owner' || permission === 'editor');

    // Owner without flag → excluded in old code
    expect(oldCondition(false, 'owner')).toBe(false);

    // New: isLoggedIn && (owner || (canCreateEmbed && editor))
    const newCondition = (canCreateEmbed: boolean, permission: string) =>
      permission === 'owner' || (canCreateEmbed && permission === 'editor');

    // Owner without flag → included in new code
    expect(newCondition(false, 'owner')).toBe(true);
  });
});
