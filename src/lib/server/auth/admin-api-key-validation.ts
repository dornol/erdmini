const PERMISSIONS = new Set(['viewer', 'editor', 'owner']);

/** Validate the complete request before changing key metadata or restrictions. */
export function validateAdminApiKeyInput(body: unknown, creating: boolean): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const fields = body as Record<string, unknown>;
  if (creating || fields.name !== undefined) {
    if (typeof fields.name !== 'string' || !fields.name.trim()) return 'name is required';
  }
  if (creating && fields.userId !== undefined && (typeof fields.userId !== 'string' || !fields.userId.trim())) return 'Invalid userId';
  if (fields.expiresAt !== undefined && fields.expiresAt !== null) {
    if (typeof fields.expiresAt !== 'string' || !fields.expiresAt.trim() || Number.isNaN(Date.parse(fields.expiresAt))) return 'Invalid expiresAt date';
  }
  if (fields.scopes !== undefined) {
    if (!Array.isArray(fields.scopes)) return 'Invalid scopes';
    const projects = new Set<string>();
    for (const scope of fields.scopes) {
      if (!scope || typeof scope !== 'object' || Array.isArray(scope) ||
        typeof scope.projectId !== 'string' || !scope.projectId.trim() ||
        typeof scope.permission !== 'string' || !PERMISSIONS.has(scope.permission) || projects.has(scope.projectId)) return 'Invalid or duplicate scopes';
      projects.add(scope.projectId);
    }
  }
  return null;
}
