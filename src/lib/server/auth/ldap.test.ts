import { describe, it, expect } from 'vitest';
import { _escapeLdapFilter_for_testing as escapeLdapFilter } from './ldap';

describe('escapeLdapFilter', () => {
  it('escapes backslash', () => {
    expect(escapeLdapFilter('a\\b')).toBe('a\\5cb');
  });

  it('escapes asterisk', () => {
    expect(escapeLdapFilter('a*b')).toBe('a\\2ab');
  });

  it('escapes parentheses', () => {
    expect(escapeLdapFilter('a(b)c')).toBe('a\\28b\\29c');
  });

  it('escapes NUL character', () => {
    expect(escapeLdapFilter('a\0b')).toBe('a\\00b');
  });

  it('escapes multiple special characters', () => {
    expect(escapeLdapFilter('admin*()\\')).toBe('admin\\2a\\28\\29\\5c');
  });

  it('leaves normal strings unchanged', () => {
    expect(escapeLdapFilter('johndoe')).toBe('johndoe');
    expect(escapeLdapFilter('user@example.com')).toBe('user@example.com');
  });

  it('handles injection attempt', () => {
    expect(escapeLdapFilter('*)(uid=*))(|(uid=*')).toBe('\\2a\\29\\28uid=\\2a\\29\\29\\28|\\28uid=\\2a');
  });

  it('handles empty string', () => {
    expect(escapeLdapFilter('')).toBe('');
  });
});
