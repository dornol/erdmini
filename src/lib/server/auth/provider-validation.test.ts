import { describe, expect, it } from 'vitest';
import { validateProviderInput } from './provider-validation';

for (const kind of ['ldap', 'oidc'] as const) describe(`${kind} provider validation`, () => {
  const valid = kind === 'ldap'
    ? { displayName: 'Directory', serverUrl: 'ldaps://example.test', bindDn: 'cn=service,dc=test', bindPassword: 'secret', userSearchBase: 'dc=test' }
    : { displayName: 'Identity', issuerUrl: 'https://example.test', clientId: 'client', clientSecret: 'secret' };
  it('accepts partial edits, blank preserved secrets, optional clears and legacy numeric checkbox values', () => {
    expect(validateProviderInput(valid, kind, true)).toBeNull();
    expect(validateProviderInput({ enabled: 0, autoCreateUsers: 1, syncGroups: false, ...(kind === 'ldap' ? { bindPassword: '', groupSearchBase: '', startTls: true } : { clientSecret: '', allowedGroups: '' }) }, kind, false)).toBeNull();
    expect(validateProviderInput({}, kind, false)).toBeNull();
  });
  it('rejects malformed bodies and all nonboolean checkbox values before a mutation', () => {
    for (const body of [null, [], 'provider', 1]) expect(validateProviderInput(body, kind, false)).not.toBeNull();
    for (const value of ['false', '', 2, null, {}, []]) expect(validateProviderInput({ ...valid, enabled: value }, kind, true)).not.toBeNull();
  });
  it('rejects missing, whitespace-only and nonstring required fields and optional structured values', () => {
    for (const name of Object.keys(valid)) {
      for (const value of [' ', 123, true, null, [], {}]) expect(validateProviderInput({ ...valid, [name]: value }, kind, true)).not.toBeNull();
    }
    for (const value of [123, {}, [], null]) expect(validateProviderInput({ [kind === 'ldap' ? 'groupSearchFilter' : 'scopes']: value }, kind, false)).not.toBeNull();
    expect(validateProviderInput({ displayName: ' ' }, kind, false)).not.toBeNull();
  });
});
