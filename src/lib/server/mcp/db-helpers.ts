import type Database from 'better-sqlite3';
import type { ERDSchema, ProjectMeta } from '$lib/types/erd';
import type { ProjectPermissionLevel, ApiKeyScope } from '$lib/types/auth';

interface ProjectIndexData {
  projects: ProjectMeta[];
}

const SCOPE_LEVEL: Record<string, number> = { viewer: 0, editor: 1 };

export function listUserProjects(
  db: Database.Database,
  userId: string,
  userRole: string,
  keyScopes?: ApiKeyScope[] | null,
): ProjectMeta[] {
  // If scopes are set, only return scoped projects
  if (keyScopes) {
    const scopedIds = new Set(keyScopes.map(s => s.projectId));
    const allRows = db.prepare(
      `SELECT pi.data FROM project_index pi WHERE pi.user_id != 'singleton'`
    ).all() as { data: string }[];

    const result: ProjectMeta[] = [];
    for (const row of allRows) {
      try {
        const index: ProjectIndexData = JSON.parse(row.data);
        if (index.projects) {
          for (const p of index.projects) {
            if (scopedIds.has(p.id)) result.push(p);
          }
        }
      } catch { /* skip */ }
    }
    return result;
  }

  // Admin can see all projects
  if (userRole === 'admin') {
    const rows = db.prepare(
      `SELECT pi.data FROM project_index pi WHERE pi.user_id != 'singleton'`
    ).all() as { data: string }[];

    const all: ProjectMeta[] = [];
    for (const row of rows) {
      try {
        const index: ProjectIndexData = JSON.parse(row.data);
        if (index.projects) all.push(...index.projects);
      } catch { /* skip */ }
    }
    return all;
  }

  // Regular user: own projects + shared projects
  const ownRow = db.prepare(
    'SELECT data FROM project_index WHERE user_id = ?'
  ).get(userId) as { data: string } | undefined;

  const ownProjects: ProjectMeta[] = [];
  if (ownRow) {
    try {
      const index: ProjectIndexData = JSON.parse(ownRow.data);
      if (index.projects) ownProjects.push(...index.projects);
    } catch { /* skip */ }
  }

  // Shared projects via permissions
  const permRows = db.prepare(
    `SELECT pp.project_id FROM project_permissions pp WHERE pp.user_id = ?`
  ).all(userId) as { project_id: string }[];

  const ownIds = new Set(ownProjects.map(p => p.id));
  const sharedIds = permRows.map(r => r.project_id).filter(id => !ownIds.has(id));

  // Look up shared project metadata from all project_index rows
  if (sharedIds.length > 0) {
    const allRows = db.prepare(
      `SELECT pi.data FROM project_index pi WHERE pi.user_id != 'singleton'`
    ).all() as { data: string }[];

    for (const row of allRows) {
      try {
        const index: ProjectIndexData = JSON.parse(row.data);
        if (index.projects) {
          for (const p of index.projects) {
            if (sharedIds.includes(p.id)) {
              ownProjects.push(p);
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  return ownProjects;
}

export function checkAccess(
  db: Database.Database,
  projectId: string,
  userId: string,
  userRole: string,
  requiredLevel: ProjectPermissionLevel,
  keyScopes?: ApiKeyScope[] | null,
): boolean {
  // If scopes are set, check scope-level access first
  if (keyScopes) {
    const scope = keyScopes.find(s => s.projectId === projectId);
    if (!scope) return false; // project not in scopes → deny
    const requiredLevelNum = SCOPE_LEVEL[requiredLevel] ?? 999;
    const scopeLevelNum = SCOPE_LEVEL[scope.permission] ?? -1;
    if (scopeLevelNum < requiredLevelNum) return false;
    // Scope allows it — still verify user actually has access to this project
  }

  if (userRole === 'admin') return true;

  // Check if user owns this project (via project_index)
  const ownRow = db.prepare(
    'SELECT data FROM project_index WHERE user_id = ?'
  ).get(userId) as { data: string } | undefined;

  if (ownRow) {
    try {
      const index: ProjectIndexData = JSON.parse(ownRow.data);
      if (index.projects?.some(p => p.id === projectId)) return true;
    } catch { /* skip */ }
  }

  // Check permissions table
  const perm = db.prepare(
    'SELECT permission FROM project_permissions WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId) as { permission: ProjectPermissionLevel } | undefined;

  if (!perm) return false;

  const levelOrder: Record<ProjectPermissionLevel, number> = { viewer: 0, editor: 1, owner: 2 };
  return levelOrder[perm.permission] >= levelOrder[requiredLevel];
}

export function getSchema(db: Database.Database, projectId: string): ERDSchema | null {
  const row = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(projectId) as { data: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as ERDSchema;
  } catch {
    return null;
  }
}

export function saveSchema(db: Database.Database, projectId: string, schema: ERDSchema): void {
  schema.updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO schemas (project_id, data, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(project_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
  ).run(projectId, JSON.stringify(schema));
}
