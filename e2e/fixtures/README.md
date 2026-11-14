# Local authentication TLS fixture

`oidc-cert.pem` and `oidc-key.pem` are public, test-only localhost credentials.
The HTTPS OIDC, LDAPS and StartTLS protocol peers in `e2e/helpers` use them; JWT signing
keys are generated separately for each test. Never use this private key outside
tests.

The server E2E config trusts this certificate with `NODE_EXTRA_CA_CERTS` and pins
`PUBLIC_APP_URL` to the isolated test server. OIDC browser contexts explicitly
accept the local certificate; application-side HTTPS verification stays enabled.

To regenerate both files:

```sh
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout e2e/fixtures/oidc-key.pem -out e2e/fixtures/oidc-cert.pem \
  -days 36500 -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
```

`untrusted-cert.pem` and `untrusted-key.pem` are a separate, public test-only
self-signed pair. They deliberately are **not** included in `NODE_EXTRA_CA_CERTS`.
LDAPS/StartTLS rejection tests use this pair, assert zero bind/search requests,
then replace it with the trusted fixture on the same listener to verify recovery.
Never trust or use either private key outside these local tests. Regenerate the
untrusted pair with the same command above using the `untrusted-` file names and
a fresh key; keep the server trust configuration limited to `oidc-cert.pem`.

`hostname-mismatch-cert.pem` is signed by the trusted `oidc-cert.pem` test CA,
using the public test-only `untrusted-key.pem` key. Its only SAN is
`DNS:wrong.example.test`. The chain therefore verifies against the configured CA,
but localhost/127.0.0.1 hostname verification must reject it. LDAPS and StartTLS
tests assert no bind/search before replacing it with the valid certificate on
the same listener and authenticating successfully.

To regenerate the mismatch leaf, create a CSR for `wrong.example.test` with
`untrusted-key.pem`, then sign it with the `oidc-cert.pem`/`oidc-key.pem` pair using
`openssl x509 -req`. Set SAN to `DNS:wrong.example.test`, CA to false, key usage to
digitalSignature/keyEncipherment, and extended key usage to serverAuth. Verify
that `openssl verify -CAfile e2e/fixtures/oidc-cert.pem` accepts it and the same
command with `-verify_hostname localhost` reports hostname mismatch.

The LDAP protocol peer can also accept TCP while withholding its TLS handshake
(`stallTlsHandshake`). For LDAPS it initially keeps a raw TCP listener silent;
for StartTLS it approves the LDAP upgrade and then withholds TLS responses.
`resumeTlsHandshake()` lets later connections complete on the same address.
Connection tests assert no bind/search before the timeout, then verify recovery.
