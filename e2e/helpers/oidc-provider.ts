import { createServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';

/** Local protocol peer: discovery, signed ID tokens, one-use codes and S256 PKCE. */
export async function startOidcProvider() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = randomUUID();
  const identity = { sub: randomUUID(), email: `oidc-${randomUUID()}@example.test`, name: 'OIDC browser user', groups: [] as string[] };
  const claims: Record<string, unknown> = {};
  const credentials = { clientSecret: 'e2e-secret' };
  const codes = new Map<string, { challenge: string; redirectUri: string }>();
  const authorizations: URL[] = [];
  const exchanges: { verifier: string; challenge: string }[] = [];
  let discoveryFailure: 'unavailable' | 'malformed-json' | 'wrong-issuer' | 'missing-authorization-endpoint' | 'missing-token-endpoint' | 'missing-jwks-uri' | undefined;
  let discoveryRequests = 0;
  let jwksFailure: 'unavailable' | 'empty' | undefined;
  let issuer = '';
  let lastCallback = '';
  let invalidSignature = false;
  let deferCallback = false;
  let authorizationDenied = false;
  let tokenFailure: 'invalid-grant' | 'unavailable' | 'missing-id-token' | undefined;
  const server = createServer({
    key: await readFile(new URL('../fixtures/oidc-key.pem', import.meta.url)),
    cert: await readFile(new URL('../fixtures/oidc-cert.pem', import.meta.url)),
  }, async (request, response) => {
    const url = new URL(request.url!, issuer);
    const json = (data: unknown, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    if (url.pathname === '/.well-known/openid-configuration') {
      discoveryRequests++;
      if (discoveryFailure === 'unavailable') return json({ error: 'temporarily_unavailable' }, 503);
      if (discoveryFailure === 'malformed-json') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        return response.end('{invalid');
      }
      return json({
        issuer: discoveryFailure === 'wrong-issuer' ? `${issuer}/other` : issuer, authorization_endpoint: discoveryFailure === 'missing-authorization-endpoint' ? undefined : `${issuer}/authorize`,
        token_endpoint: discoveryFailure === 'missing-token-endpoint' ? undefined : `${issuer}/token`,
        jwks_uri: discoveryFailure === 'missing-jwks-uri' ? undefined : `${issuer}/jwks`,
        response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'], code_challenge_methods_supported: ['S256'],
      });
    }
    if (url.pathname === '/jwks' && jwksFailure === 'unavailable') return json({ error: 'temporarily_unavailable' }, 503);
    if (url.pathname === '/jwks' && jwksFailure === 'empty') return json({ keys: [] });
    if (url.pathname === '/jwks') return json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] });
    if (url.pathname === '/authorize') {
      if (request.method === 'GET') {
        authorizations.push(url);
        response.writeHead(200, { 'Content-Type': 'text/html' });
        return response.end('<form method="POST"><button type="submit">Continue with test identity</button></form>');
      }
      if (url.searchParams.get('client_id') !== 'e2e-client' || url.searchParams.get('code_challenge_method') !== 'S256') return json({ error: 'invalid_request' }, 400);
      const code = randomUUID();
      codes.set(code, { challenge: url.searchParams.get('code_challenge')!, redirectUri: url.searchParams.get('redirect_uri')! });
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      if (authorizationDenied) {
        callback.searchParams.set('error', 'access_denied');
        codes.delete(code);
      } else callback.searchParams.set('code', code);
      callback.searchParams.set('state', url.searchParams.get('state')!);
      lastCallback = callback.href;
      if (deferCallback) {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        return response.end('<p>Authorization ready</p>');
      }
      response.writeHead(302, { Location: callback.href });
      return response.end();
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = new URLSearchParams(Buffer.concat(chunks).toString());
      const grant = codes.get(body.get('code') ?? '');
      codes.delete(body.get('code') ?? '');
      const verifier = body.get('code_verifier') ?? '';
      if (!grant || body.get('grant_type') !== 'authorization_code' || body.get('client_id') !== 'e2e-client' || body.get('client_secret') !== credentials.clientSecret || body.get('redirect_uri') !== grant.redirectUri || createHash('sha256').update(verifier).digest('base64url') !== grant.challenge) return json({ error: 'invalid_grant' }, 400);
      exchanges.push({ verifier, challenge: grant.challenge });
      if (tokenFailure === 'invalid-grant') return json({ error: 'invalid_grant' }, 400);
      if (tokenFailure === 'unavailable') return json({ error: 'temporarily_unavailable' }, 503);
      if (tokenFailure === 'missing-id-token') return json({ access_token: randomUUID(), token_type: 'Bearer' });
      const now = Math.floor(Date.now() / 1000);
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({ alg: 'RS256', kid })}.${encode({ iss: issuer, aud: 'e2e-client', iat: now, exp: now + 300, ...identity, ...claims })}`;
      const signingKey = invalidSignature ? generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey : privateKey;
      const token = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), signingKey).toString('base64url')}`;
      return json({ access_token: randomUUID(), token_type: 'Bearer', expires_in: 300, id_token: token });
    }
    return json({ error: 'not_found' }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('OIDC listener unavailable');
  issuer = `https://127.0.0.1:${address.port}`;
  return {
    issuer, identity, claims, credentials, authorizations, exchanges,
    set jwksFailure(value: 'unavailable' | 'empty' | undefined) { jwksFailure = value; },
    get discoveryRequests() { return discoveryRequests; },
    set discoveryFailure(value: 'unavailable' | 'malformed-json' | 'wrong-issuer' | 'missing-authorization-endpoint' | 'missing-token-endpoint' | 'missing-jwks-uri' | undefined) { discoveryFailure = value; },
    get lastCallback() { return lastCallback; },
    set authorizationDenied(value: boolean) { authorizationDenied = value; },
    set tokenFailure(value: 'invalid-grant' | 'unavailable' | 'missing-id-token' | undefined) { tokenFailure = value; },
    set deferCallback(value: boolean) { deferCallback = value; },
    set invalidSignature(value: boolean) { invalidSignature = value; },
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
