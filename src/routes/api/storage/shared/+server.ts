import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import type { ProjectPermissionRow } from '$lib/types/auth';

export const GET: RequestHandler = ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find projects shared with this user via direct permissions (not owned by them)
  const rows = db.prepare(`
    SELECT pp.project_id, pp.permission, pp.created_at,
           (SELECT u2.display_name FROM project_permissions op
            JOIN users u2 ON u2.id = op.user_id
            WHERE op.project_id = pp.project_id AND op.permission = 'owner'
            ORDER BY op.created_at LIMIT 1) as owner_name
    FROM project_permissions pp
    WHERE pp.user_id = ? AND pp.permission != 'owner'
    ORDER BY pp.created_at DESC
  `).all(locals.user.id) as (Pick<ProjectPermissionRow, 'project_id' | 'permission' | 'created_at'> & { owner_name: string })[];

  // Also find projects shared via groups
  const groupRows = db.prepare(`
    SELECT DISTINCT gpp.project_id, gpp.permission, gpp.created_at,
           (SELECT u2.display_name FROM project_permissions op
            JOIN users u2 ON u2.id = op.user_id
            WHERE op.project_id = gpp.project_id AND op.permission = 'owner'
            ORDER BY op.created_at LIMIT 1) as owner_name
    FROM group_project_permissions gpp
    JOIN group_members gm ON gm.group_id = gpp.group_id
    WHERE gm.user_id = ?
    ORDER BY gpp.created_at DESC
  `).all(locals.user.id) as { project_id: string; permission: string; created_at: string; owner_name: string }[];

  // Merge: direct permissions take precedence; add group-only projects
  const directIds = new Set(rows.map(r => r.project_id));
  const allRows = [
    ...rows,
    ...groupRows.filter(r => !directIds.has(r.project_id)),
  ];

  // For each shared project, look up the project name from schemas
  const result = allRows.map(r => {
    const schemaRow = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(r.project_id) as { data: string } | undefined;
    let projectName = r.project_id;
    if (schemaRow) {
      try {
        const schema = JSON.parse(schemaRow.data);
        if (schema.name) projectName = schema.name;
      } catch { /* use project_id */ }
    }

    return {
      projectId: r.project_id,
      permission: r.permission,
      ownerName: r.owner_name,
      projectName,
      sharedAt: r.created_at,
    };
  });

  return json(result);
};
