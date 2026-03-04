import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';

function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

interface ProjectIndexRow {
  id: string;
  data: string;
  user_id: string;
}

// GET /api/admin/projects — list all projects with owner info
export const GET: RequestHandler = ({ locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  // Get all project_index rows — multiple users may reference the same project
  const rows = db.prepare('SELECT id, data, user_id FROM project_index').all() as ProjectIndexRow[];

  const seen = new Set<string>();
  const projects: {
    id: string;
    name: string;
    updatedAt: string;
    ownerId: string | null;
    ownerName: string | null;
    memberCount: number;
  }[] = [];

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data);
      const projectList = parsed.projects ?? [];

      for (const p of projectList) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);

        // Get owner from project_permissions
        const owner = db.prepare(
          `SELECT pp.user_id, u.display_name
           FROM project_permissions pp
           JOIN users u ON u.id = pp.user_id
           WHERE pp.project_id = ? AND pp.permission = 'owner'
           LIMIT 1`
        ).get(p.id) as { user_id: string; display_name: string } | undefined;

        // Get member count
        const memberRow = db.prepare(
          'SELECT COUNT(*) as cnt FROM project_permissions WHERE project_id = ?'
        ).get(p.id) as { cnt: number };

        projects.push({
          id: p.id,
          name: p.name,
          updatedAt: p.updatedAt ?? p.createdAt,
          ownerId: owner?.user_id ?? null,
          ownerName: owner?.display_name ?? null,
          memberCount: memberRow.cnt,
        });
      }
    } catch {
      // Skip malformed data
    }
  }

  return json(projects);
};
