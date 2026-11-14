import { createServer, createSecureContext, TLSSocket } from 'node:tls';
import { createServer as createNetServer, type Socket } from 'node:net';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { BerReader, BerWriter, BindRequest, PresenceFilter, SearchRequest } from 'ldapts';

/** Minimal LDAPS protocol peer; evaluates real filters and validates both binds. */
export async function startLdapProvider(options: { startTls?: boolean; rejectStartTls?: boolean; untrustedCertificate?: boolean; hostnameMismatch?: boolean; stallTlsHandshake?: boolean } = {}) {
  const serviceDn = 'cn=service,dc=example,dc=test';
  const userBase = 'ou=people,dc=example,dc=test';
  const groupBase = 'ou=groups,dc=example,dc=test';
  const identity = { username: `ldap-${randomUUID()}`, password: 'ldap-user-password', email: `ldap-${randomUUID()}@example.test`, name: 'LDAP browser user', groups: [] as string[] };
  const userDn = `uid=${identity.username},${userBase}`;
  const binds: { dn: string; accepted: boolean }[] = [];
  const searches: { base: string; filter: string }[] = [];
  const sockets = new Set<Socket>();
  let startTlsRequests = 0;
  let acceptedConnections = 0;
  let stallTlsHandshake = Boolean(options.stallTlsHandshake);
  let encryptedBinds = 0;
  const errors: string[] = [];
  let failGroupSearch = false;
  let failure: 'service-bind' | 'user-search' | 'disconnect' | 'service-bind-timeout' | 'user-bind-timeout' | 'user-search-timeout' | 'group-search-timeout' | undefined;
  const trustedCredentials = { key: await readFile(new URL('../fixtures/oidc-key.pem', import.meta.url)), cert: await readFile(new URL('../fixtures/oidc-cert.pem', import.meta.url)) };
  const credentials = options.untrustedCertificate
    ? { key: await readFile(new URL('../fixtures/untrusted-key.pem', import.meta.url)), cert: await readFile(new URL('../fixtures/untrusted-cert.pem', import.meta.url)) }
    : options.hostnameMismatch
      ? { key: await readFile(new URL('../fixtures/untrusted-key.pem', import.meta.url)), cert: await readFile(new URL('../fixtures/hostname-mismatch-cert.pem', import.meta.url)) }
      : trustedCredentials;
  let secureContext = createSecureContext(credentials);
  function attach(socket: Socket) {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let pending = Buffer.alloc(0);
    let boundDn = '';
    const packet = (messageId: number, operation: number, write: (writer: BerWriter) => void) => {
      const writer = new BerWriter();
      writer.startSequence(); writer.writeInt(messageId); writer.startSequence(operation);
      write(writer);
      writer.endSequence(); writer.endSequence();
      socket.write(writer.buffer);
    };
    const result = (id: number, operation: number, status = 0) => packet(id, operation, writer => {
      writer.writeEnumeration(status); writer.writeString(''); writer.writeString(status ? 'Test directory rejection' : '');
    });
    const entry = (id: number, dn: string, attributes: Record<string, string>) => packet(id, 0x64, writer => {
      writer.writeString(dn); writer.startSequence();
      for (const [name, value] of Object.entries(attributes)) {
        writer.startSequence(); writer.writeString(name); writer.startSequence(0x31); writer.writeString(value); writer.endSequence(); writer.endSequence();
      }
      writer.endSequence();
    });
    socket.on('data', data => {
      pending = Buffer.concat([pending, data]);
      try {
        while (pending.length >= 2) {
          const lengthByte = pending[1];
          const lengthBytes = lengthByte & 0x80 ? lengthByte & 0x7f : 0;
          if (pending.length < 2 + lengthBytes) return;
          const size = lengthBytes ? pending.readUIntBE(2, lengthBytes) : lengthByte;
          const end = 2 + lengthBytes + size;
          if (pending.length < end) return;
          const reader = new BerReader(pending.subarray(0, end));
          pending = pending.subarray(end);
          reader.readSequence();
          const messageId = reader.readInt()!;
          const operation = reader.readSequence();
          if (operation === 0x42) { socket.end(); continue; }
          if (operation === 0x77 && options.startTls) {
            const oid = reader.readString(0x80);
            startTlsRequests++;
            if (oid !== '1.3.6.1.4.1.1466.20037' || options.rejectStartTls) { result(messageId, 0x78, 53); continue; }
            result(messageId, 0x78);
            socket.removeAllListeners('data');
            if (stallTlsHandshake) return;
            attach(new TLSSocket(socket, { isServer: true, secureContext }));
            return;
          }
          if (operation === 0x60) {
            if (!(socket instanceof TLSSocket) || !socket.encrypted) { result(messageId, 0x61, 13); continue; }
            encryptedBinds++;
            const bind = new BindRequest({ messageId }); bind.parseMessage(reader);
            const accepted = (bind.dn === serviceDn && bind.password === 'service-password' && failure !== 'service-bind') || (bind.dn === userDn && bind.password === identity.password);
            binds.push({ dn: bind.dn, accepted });
            if ((failure === 'service-bind-timeout' && bind.dn === serviceDn) || (failure === 'user-bind-timeout' && bind.dn === userDn)) continue;
            boundDn = accepted ? bind.dn : '';
            result(messageId, 0x61, accepted ? 0 : 49);
          } else if (operation === 0x63) {
            const search = new SearchRequest({ messageId, filter: new PresenceFilter({ attribute: 'objectClass' }) });
            // ldapts' presence parser reads from the start of the packet buffer.
            // Decode that primitive filter at its actual offset for base-DN probes.
            const searchOffset = reader.offset;
            const baseDN = reader.readString() ?? '';
            reader.readEnumeration(); reader.readEnumeration();
            reader.readInt(); reader.readInt(); reader.readBoolean();
            if (reader.peek() === 0x87) {
              search.baseDN = baseDN;
              search.filter = new PresenceFilter({ attribute: reader.readString(0x87) ?? '' });
            } else {
              reader.offset = searchOffset;
              search.parseMessage(reader);
            }
            searches.push({ base: search.baseDN, filter: search.filter.toString() });
            if ((search.baseDN === userBase && failure === 'user-search-timeout') || (search.baseDN === groupBase && failure === 'group-search-timeout')) continue;
            if (failure === 'disconnect') { socket.destroy(); return; }
            if (search.baseDN === userBase && failure === 'user-search') { result(messageId, 0x65, 80); continue; }
            if (boundDn !== serviceDn) { result(messageId, 0x65, 50); continue; }
            if (search.baseDN === userBase && search.filter.matches({ uid: identity.username })) entry(messageId, userDn, { mail: identity.email, cn: identity.name });
            if (search.baseDN === groupBase) {
              if (failGroupSearch) { result(messageId, 0x65, 80); continue; }
              if (search.filter.matches({ member: userDn })) for (const dn of identity.groups) entry(messageId, dn, {});
            }
            result(messageId, 0x65);
          } else { errors.push(`Unexpected LDAP operation ${operation}`); socket.destroy(); }
        }
      } catch (error) { errors.push(String(error)); socket.destroy(); }
    });
  }
  const server = options.startTls ? createNetServer(attach)
    : options.stallTlsHandshake ? createNetServer(socket => {
      if (!stallTlsHandshake) attach(new TLSSocket(socket, { isServer: true, secureContext }));
    }) : createServer(credentials, attach);
  server.on('connection', socket => {
    acceptedConnections++;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('LDAP listener unavailable');
  return {
    serverUrl: `${options.startTls ? 'ldap' : 'ldaps'}://127.0.0.1:${address.port}`, identity, userDn, serviceDn, userBase, groupBase, binds, searches, errors,
    restoreTrustedCertificate() {
      secureContext = createSecureContext(trustedCredentials);
      if (!options.startTls && !options.stallTlsHandshake) (server as import('node:tls').Server).setSecureContext(trustedCredentials);
    },
    resumeTlsHandshake() { stallTlsHandshake = false; },
    get acceptedConnections() { return acceptedConnections; },
    get startTlsRequests() { return startTlsRequests; },
    get encryptedBinds() { return encryptedBinds; },
    set failure(value: 'service-bind' | 'user-search' | 'disconnect' | 'service-bind-timeout' | 'user-bind-timeout' | 'user-search-timeout' | 'group-search-timeout' | undefined) { failure = value; },
    set failGroupSearch(value: boolean) { failGroupSearch = value; },
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
