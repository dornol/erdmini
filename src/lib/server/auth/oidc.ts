import * as client from 'openid-client';
import { randomBytes, randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { OIDCProviderRow, OIDCStateRow } from '$lib/types/auth';

// Cache discovered configs
const configCache = new Map<string, client.Configuration>();

async function getConfig(provider: OIDCProviderRow): Promise<client.Configuration> {
  const cached = configCache.get(provider.id);
  if (cached) return cached;

  const config = await client.discovery(
    new URL(provider.issuer_url),
    provider.client_id,
    provider.client_secret,
  );
  configCache.set(provider.id, config);
  return config;
}

export function clearConfigCache(providerId?: string): void {
  if (providerId) {
    configCache.delete(providerId);
  } else {
    configCache.clear();
  }
}

export async function buildAuthorizationUrl(
  db: Database.Database,
  provider: OIDCProviderRow,
  redirectUri: string,
): Promise<string> {
  const config = await getConfig(provider);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  // Save state
  db.prepare(
    'INSERT INTO oidc_states (state, provider_id, code_verifier, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(state, provider.id, codeVerifier, redirectUri, expiresAt);

  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    scope: provider.scopes || 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    response_type: 'code',
  });

  const authUrl = client.buildAuthorizationUrl(config, params);
  return authUrl.href;
}

export async function handleCallback(
  db: Database.Database,
  provider: OIDCProviderRow,
  callbackUrl: URL,
): Promise<{ sub: string; email?: string; name?: string; claims: Record<string, unknown> }> {
  const stateParam = callbackUrl.searchParams.get('state');
  if (!stateParam) throw new Error('Missing state parameter');

  // Retrieve and delete state
  const stateRow = db.prepare(
    'SELECT * FROM oidc_states WHERE state = ?'
  ).get(stateParam) as OIDCStateRow | undefined;

  if (!stateRow) throw new Error('Invalid state');

  db.prepare('DELETE FROM oidc_states WHERE state = ?').run(stateParam);

  // Check expiry
  if (new Date(stateRow.expires_at) <= new Date()) {
    throw new Error('State expired');
  }

  const config = await getConfig(provider);

  const tokens = await client.authorizationCodeGrant(
    config,
    callbackUrl,
    {
      pkceCodeVerifier: stateRow.code_verifier,
      expectedState: stateParam,
    },
  );

  const claims = tokens.claims();
  if (!claims) throw new Error('No claims in token');

  return {
    sub: claims.sub,
    email: claims.email as string | undefined,
    name: (claims.name ?? claims.preferred_username ?? claims.email) as string | undefined,
    claims: claims as unknown as Record<string, unknown>,
  };
}

export function findOrCreateOIDCUser(
  db: Database.Database,
  providerId: string,
  sub: string,
  email: string | undefined,
  name: string | undefined,
  autoCreate: boolean,
): { userId: string; status: string; created?: boolean } | null {
  // Check existing identity (join users to get status)
  const existing = db.prepare(
    `SELECT oi.user_id, u.status
     FROM oidc_identities oi
     JOIN users u ON u.id = oi.user_id
     WHERE oi.provider_id = ? AND oi.subject = ?`
  ).get(providerId, sub) as { user_id: string; status: string } | undefined;

  if (existing) return { userId: existing.user_id, status: existing.status };

  // Determine status: active if auto-create is on, pending otherwise
  const status = autoCreate ? 'active' : 'pending';

  // Create new user
  const userId = randomUUID();
  const displayName = name || email || `oidc_${sub.substring(0, 8)}`;

  db.prepare(
    `INSERT INTO users (id, display_name, email, role, status) VALUES (?, ?, ?, 'user', ?)`
  ).run(userId, displayName, email || null, status);

  // Link identity
  const identityId = randomUUID();
  db.prepare(
    'INSERT INTO oidc_identities (id, user_id, provider_id, subject, email) VALUES (?, ?, ?, ?, ?)'
  ).run(identityId, userId, providerId, sub, email || null);

  return { userId, status, created: true };
}

// Cleanup expired states (call periodically)
export function cleanupExpiredStates(db: Database.Database): void {
  db.prepare("DELETE FROM oidc_states WHERE expires_at < datetime('now')").run();
}
