import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { validateEmbedToken, verifyEmbedPassword } from '$lib/server/embed';

function getProjectName(projectId: string): string {
  // Search all project_index rows for the project name
  const rows = db.prepare('SELECT data FROM project_index').all() as Array<{ data: string }>;
  for (const row of rows) {
    try {
      const index = JSON.parse(row.data);
      const project = index.projects?.find((p: { id: string }) => p.id === projectId);
      if (project?.name) return project.name;
    } catch { /* ignore */ }
  }
  return 'Untitled';
}

export const GET: RequestHandler = async ({ params, url }) => {
  const result = validateEmbedToken(db, params.token);

  if (!result) {
    return json({ error: 'Token expired or not found' }, { status: 403 });
  }

  // Password check
  if (result.hasPassword) {
    const password = url.searchParams.get('password');
    if (!password) {
      return json({ requiresPassword: true }, { status: 401 });
    }
    const valid = await verifyEmbedPassword(db, result.id, password);
    if (!valid) {
      return json({ error: 'Wrong password', requiresPassword: true }, { status: 401 });
    }
  }

  // Load schema
  const schemaRow = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(result.projectId) as { data: string } | undefined;
  if (!schemaRow) {
    return json({ error: 'Schema not found' }, { status: 404 });
  }

  // Load canvas state
  const canvasRow = db.prepare('SELECT data FROM canvas_states WHERE project_id = ?').get(result.projectId) as { data: string } | undefined;

  const projectName = getProjectName(result.projectId);

  return json({
    projectName,
    schema: JSON.parse(schemaRow.data),
    canvasState: canvasRow ? JSON.parse(canvasRow.data) : null,
  });
};
