import type Database from 'better-sqlite3';
import type { ProjectPermissionLevel, ProjectPermissionRow } from '$lib/types/auth';

const PERMISSION_HIERARCHY: Record<ProjectPermissionLevel, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

/**
 * Get the permission level a user has on a project.
 * Admin users always get 'owner' access.
 */
export function getProjectPermission(
  db: Database.Database,
  projectId: string,
  userId: string,
  userRole: string,
): ProjectPermissionLevel | null {
  // Admin bypasses — full owner access on everything
  if (userRole === 'admin') return 'owner';

  // Direct permission
  const row = db.prepare(
    'SELECT permission FROM project_permissions WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId) as Pick<ProjectPermissionRow, 'permission'> | undefined;

  let best: ProjectPermissionLevel | null = row ? row.permission as ProjectPermissionLevel : null;

  // Group permission — pick highest level across all groups the user belongs to
  const groupRows = (db.prepare(`
    SELECT gpp.permission FROM group_project_permissions gpp
    JOIN group_members gm ON gm.group_id = gpp.group_id
    WHERE gpp.project_id = ? AND gm.user_id = ?
  `).all(projectId, userId) ?? []) as { permission: string }[];

  for (const gr of groupRows) {
    const perm = gr.permission as ProjectPermissionLevel;
    if (!best || PERMISSION_HIERARCHY[perm] > PERMISSION_HIERARCHY[best]) {
      best = perm;
    }
  }

  return best;
}

/**
 * Check if a user has at least `minLevel` permission on a project.
 * Returns true if access is granted, false otherwise.
 */
export function hasProjectAccess(
  db: Database.Database,
  projectId: string,
  userId: string,
  userRole: string,
  minLevel: ProjectPermissionLevel,
): boolean {
  const perm = getProjectPermission(db, projectId, userId, userRole);
  if (!perm) return false;
  return PERMISSION_HIERARCHY[perm] >= PERMISSION_HIERARCHY[minLevel];
}

/**
 * Ensure owner permission exists for a project.
 */
export function ensureOwnerPermission(
  db: Database.Database,
  projectId: string,
  userId: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO project_permissions (id, project_id, user_id, permission)
     VALUES (?, ?, ?, 'owner')`
  ).run(`perm_${userId}_${projectId}`, projectId, userId);
}
