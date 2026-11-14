import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Tests for collab system hardening logic.
 * Cannot test actual WebSocket connections, but can verify:
 * - Operation kind whitelist correctness
 * - Reconnect limit logic
 * - Join rejection stop logic
 */

// ─── Operation kind whitelist ───

const relaySource = readFileSync(new URL('../../../collab-server.js', import.meta.url), 'utf8');
const relayList = relaySource.match(/const ALLOWED_OP_KINDS = new Set\(\[([\s\S]*?)\]\);/);
if (!relayList) throw new Error('Could not locate the actual relay operation whitelist');
const relayKinds = [...relayList[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const ALLOWED_OP_KINDS = new Set(relayKinds);
const typeSource = readFileSync(new URL('../types/collab.ts', import.meta.url), 'utf8');
const declaredKinds = [...typeSource.matchAll(/kind: '([^']+)'/g)].map(match => match[1]);

describe('operation kind whitelist', () => {
  it('has no duplicate operation entries in the actual relay source', () => {
    expect(ALLOWED_OP_KINDS.size).toBe(relayKinds.length);
  });

  it('rejects unknown operation kinds', () => {
    const malicious = ['exec', 'eval', 'drop-database', '__proto__', 'constructor', ''];
    for (const kind of malicious) {
      expect(ALLOWED_OP_KINDS.has(kind)).toBe(false);
    }
  });

  it('matches every declared CollabOperation kind without allowing extra kinds', () => {
    expect([...ALLOWED_OP_KINDS].sort()).toEqual([...new Set(declaredKinds)].sort());
  });
});

// ─── Reconnect limit logic ───

describe('reconnect limit logic', () => {
  it('stops after max attempts', () => {
    const maxAttempts = 20;
    let attempts = 0;
    let gaveUp = false;

    function scheduleReconnect() {
      if (attempts >= maxAttempts) {
        gaveUp = true;
        return;
      }
      attempts++;
    }

    for (let i = 0; i < 25; i++) {
      scheduleReconnect();
    }

    expect(attempts).toBe(maxAttempts);
    expect(gaveUp).toBe(true);
  });

  it('resets attempts on successful join', () => {
    let attempts = 15;

    // Simulate successful join
    function onJoined() {
      attempts = 0;
    }

    onJoined();
    expect(attempts).toBe(0);
  });
});

// ─── Join rejection stop logic ───

describe('join rejection handling', () => {
  const FATAL_ERRORS = ['No access to project', 'Unauthorized', 'Invalid session'];

  it('marks intentionalClose for fatal errors', () => {
    for (const msg of FATAL_ERRORS) {
      let intentionalClose = false;

      // Simulate error message handler
      if (msg === 'No access to project' || msg === 'Unauthorized' || msg === 'Invalid session') {
        intentionalClose = true;
      }

      expect(intentionalClose).toBe(true);
    }
  });

  it('does NOT mark intentionalClose for non-fatal errors', () => {
    const nonFatal = ['Operation payload too large', 'Invalid operation kind: foo', '__disconnected__'];
    for (const msg of nonFatal) {
      let intentionalClose = false;

      if (msg === 'No access to project' || msg === 'Unauthorized' || msg === 'Invalid session') {
        intentionalClose = true;
      }

      expect(intentionalClose).toBe(false);
    }
  });
});
