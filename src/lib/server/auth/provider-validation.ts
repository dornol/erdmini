const SHARED_STRINGS = ['displayName'];
const OIDC_STRINGS = ['issuerUrl', 'clientId', 'clientSecret', 'scopes', 'groupClaim', 'allowedGroups', 'adminGroups'];
const LDAP_STRINGS = ['serverUrl', 'bindDn', 'bindPassword', 'userSearchBase', 'userSearchFilter', 'emailAttribute', 'displayNameAttribute', 'groupSearchBase', 'groupSearchFilter', 'adminGroupDn', 'allowedGroupDns'];

/** Validate every supplied field before changing provider configuration. */
export function validateProviderInput(body: unknown, kind: 'ldap' | 'oidc', creating: boolean): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const fields = body as Record<string, unknown>;
  const required = kind === 'ldap' ? ['displayName', 'serverUrl', 'bindDn', 'userSearchBase'] : ['displayName', 'issuerUrl', 'clientId'];
  for (const name of [...SHARED_STRINGS, ...(kind === 'ldap' ? LDAP_STRINGS : OIDC_STRINGS)]) {
    if (fields[name] !== undefined && typeof fields[name] !== 'string') return `Invalid ${name}`;
  }
  for (const name of [...required, ...(creating ? [kind === 'ldap' ? 'bindPassword' : 'clientSecret'] : [])]) {
    if ((creating || fields[name] !== undefined) && (typeof fields[name] !== 'string' || !fields[name].trim())) return `${name} is required`;
  }
  for (const name of ['enabled', 'autoCreateUsers', 'syncGroups', ...(kind === 'ldap' ? ['startTls'] : [])]) {
    const value = fields[name];
    // Admin forms historically submit SQLite booleans as 0/1 on update.
    if (value !== undefined && typeof value !== 'boolean' && value !== 0 && value !== 1) return `Invalid ${name}`;
  }
  return null;
}
