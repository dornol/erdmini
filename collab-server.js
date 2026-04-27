// Standalone WebSocket collaboration server
// Works independently of SvelteKit's module system
import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';
import { createLogger } from './logger.js';

const log = createLogger('collab');

// Allowed operation kinds (must match CollabOperation in src/lib/types/collab.ts)
const ALLOWED_OP_KINDS = new Set([
  'add-table', 'delete-table', 'delete-tables', 'update-table-name', 'update-table-comment',
  'update-table-color', 'update-table-group', 'move-table', 'move-tables',
  'add-column', 'update-column', 'delete-column', 'move-column',
  'add-fk', 'update-fk', 'delete-fk', 'add-uk', 'delete-uk', 'add-index', 'delete-index',
  'add-domain', 'update-domain', 'delete-domain',
  'duplicate-table', 'update-group-color', 'rename-group', 'apply-layout',
  'add-memo', 'delete-memo', 'delete-memos', 'move-memo', 'move-memos', 'update-memo',
  'attach-memo', 'detach-memo',
  'add-schema', 'delete-schema', 'rename-schema', 'reorder-schemas', 'update-table-schema',
  'load-schema',
]);

const PEER_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

// ── Room Manager ──
class RoomManager {
  constructor() {
    /** @type {Map<string, {ws: import('ws').WebSocket, userId: string, displayName: string, color: string, projectId: string|null}>} */
    this.peers = new Map();
    /** @type {Map<string, Set<string>>} */
    this.rooms = new Map();
    /** @type {Map<string, number>} */
    this.colorCounters = new Map();
  }

  register(peerId, ws, userId, displayName) {
    this.peers.set(peerId, { ws, userId, displayName, color: '', projectId: null });
  }

  unregister(peerId) {
    const peer = this.peers.get(peerId);
    if (peer?.projectId) this.leaveRoom(peerId);
    this.peers.delete(peerId);
  }

  joinRoom(projectId, peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.projectId) this.leaveRoom(peerId);

    const counter = this.colorCounters.get(projectId) ?? 0;
    peer.color = PEER_COLORS[counter % PEER_COLORS.length];
    this.colorCounters.set(projectId, counter + 1);
    peer.projectId = projectId;

    if (!this.rooms.has(projectId)) this.rooms.set(projectId, new Set());
    this.rooms.get(projectId).add(peerId);

    // Gather existing peers
    const existingPeers = [];
    for (const otherId of this.rooms.get(projectId)) {
      if (otherId === peerId) continue;
      const other = this.peers.get(otherId);
      if (other) existingPeers.push({ peerId: otherId, userId: other.userId, displayName: other.displayName, color: other.color });
    }

    this.sendTo(peerId, { type: 'joined', peerId, peers: existingPeers });
    this.broadcast(projectId, {
      type: 'peer-joined',
      peer: { peerId, userId: peer.userId, displayName: peer.displayName, color: peer.color },
    }, peerId);
  }

  leaveRoom(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer?.projectId) return;
    const projectId = peer.projectId;
    const room = this.rooms.get(projectId);
    if (room) {
      room.delete(peerId);
      if (room.size === 0) {
        this.rooms.delete(projectId);
        this.colorCounters.delete(projectId);
      }
    }
    peer.projectId = null;
    this.broadcast(projectId, { type: 'peer-left', peerId });
  }

  broadcast(projectId, msg, excludePeerId) {
    const room = this.rooms.get(projectId);
    if (!room) return;
    const data = JSON.stringify(msg);
    for (const peerId of room) {
      if (peerId === excludePeerId) continue;
      const peer = this.peers.get(peerId);
      if (peer?.ws.readyState === 1) peer.ws.send(data);
    }
  }

  sendTo(peerId, msg) {
    const peer = this.peers.get(peerId);
    if (peer?.ws.readyState === 1) peer.ws.send(JSON.stringify(msg));
  }

  getProjectId(peerId) {
    return this.peers.get(peerId)?.projectId ?? null;
  }
}

const roomManager = new RoomManager();

function notifySchemaChange(projectId, schema, source) {
  const type = source === 'mcp' ? 'mcp-sync' : 'sync';
  roomManager.broadcast(projectId, { type, schema });
}

// ── Rate Limiting ──
/** @type {Map<string, { count: number, resetTime: number }>} */
const peerMessageCounts = new Map();
const RATE_LIMIT = 100; // messages per second
const RATE_WINDOW = 1000; // 1 second in ms

function checkRateLimit(peerId) {
  const now = Date.now();
  let entry = peerMessageCounts.get(peerId);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + RATE_WINDOW };
    peerMessageCounts.set(peerId, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// ── Message Handler ──
function handleMessage(peerId, raw, db, userId, userRole) {
  let msg;
  try { msg = JSON.parse(raw); } catch {
    roomManager.sendTo(peerId, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  try {
    switch (msg.type) {
      case 'join': {
        if (typeof msg.projectId !== 'string' || !msg.projectId) {
          roomManager.sendTo(peerId, { type: 'error', message: 'Invalid projectId' });
          return;
        }
        if (!hasProjectAccess(db, msg.projectId, userId, userRole, 'viewer')) {
          roomManager.sendTo(peerId, { type: 'error', message: 'No access to project' });
          return;
        }
        roomManager.joinRoom(msg.projectId, peerId);
        break;
      }
      case 'leave': {
        roomManager.leaveRoom(peerId);
        break;
      }
      case 'operation': {
        // Basic operation payload validation
        if (!msg.op || typeof msg.op !== 'object') {
          roomManager.sendTo(peerId, { type: 'error', message: 'Invalid operation: op must be an object' });
          return;
        }
        if (!msg.op.kind || typeof msg.op.kind !== 'string') {
          roomManager.sendTo(peerId, { type: 'error', message: 'Invalid operation: op.kind must be a non-empty string' });
          return;
        }
        if (!ALLOWED_OP_KINDS.has(msg.op.kind)) {
          roomManager.sendTo(peerId, { type: 'error', message: `Invalid operation kind: ${msg.op.kind}` });
          return;
        }
        const opStr = JSON.stringify(msg.op);
        if (opStr.length > 512 * 1024) {
          roomManager.sendTo(peerId, { type: 'error', message: 'Operation payload too large' });
          return;
        }
        const projectId = roomManager.getProjectId(peerId);
        if (!projectId) { roomManager.sendTo(peerId, { type: 'error', message: 'Not in a room' }); return; }
        if (!hasProjectAccess(db, projectId, userId, userRole, 'editor')) {
          roomManager.sendTo(peerId, { type: 'error', message: 'Insufficient permission' });
          return;
        }
        roomManager.broadcast(projectId, { type: 'operation', op: msg.op, fromPeerId: peerId }, peerId);
        break;
      }
      case 'presence': {
        const projectId = roomManager.getProjectId(peerId);
        if (!projectId) return;
        const presenceStr = JSON.stringify(msg.data);
        if (presenceStr.length > 4096) {
          roomManager.sendTo(peerId, { type: 'error', message: 'Presence data too large' });
          return;
        }
        roomManager.broadcast(projectId, { type: 'presence', data: msg.data, fromPeerId: peerId }, peerId);
        break;
      }
      case 'request-sync': {
        const projectId = roomManager.getProjectId(peerId);
        if (!projectId) { roomManager.sendTo(peerId, { type: 'error', message: 'Not in a room' }); return; }
        const row = db.prepare('SELECT data FROM schemas WHERE project_id = ?').get(projectId);
        if (row) {
          let schema;
          try { schema = JSON.parse(row.data); } catch (parseErr) {
            log.error('Corrupted schema data in DB', { projectId, error: parseErr.message });
            roomManager.sendTo(peerId, { type: 'error', message: 'Schema data corrupted' });
            return;
          }
          roomManager.sendTo(peerId, { type: 'sync', schema });
        } else {
          roomManager.sendTo(peerId, { type: 'error', message: 'Schema not found' });
        }
        break;
      }
    }
  } catch (err) {
    log.error('Unhandled error in handleMessage', { peerId, error: err.message });
    roomManager.sendTo(peerId, { type: 'error', message: 'Internal server error' });
  }
}

// ── Permission check (minimal, matches src/lib/server/auth/permissions.ts) ──
const PERM_HIERARCHY = { viewer: 0, editor: 1, owner: 2 };

function hasProjectAccess(db, projectId, userId, userRole, minLevel) {
  if (userRole === 'admin') return true;

  // Direct permission
  const row = db.prepare('SELECT permission FROM project_permissions WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  let best = row ? (PERM_HIERARCHY[row.permission] ?? -1) : -1;

  // Group permission — pick highest level
  const groupRows = db.prepare(
    `SELECT gpp.permission FROM group_project_permissions gpp
     JOIN group_members gm ON gm.group_id = gpp.group_id
     WHERE gpp.project_id = ? AND gm.user_id = ?`
  ).all(projectId, userId);
  for (const gr of groupRows) {
    const level = PERM_HIERARCHY[gr.permission] ?? -1;
    if (level > best) best = level;
  }

  return best >= PERM_HIERARCHY[minLevel];
}

// ── Session validation (minimal, matches src/lib/server/auth/session.ts) ──
function validateSession(db, sessionId) {
  const row = db.prepare(`
    SELECT s.id as session_id, s.user_id, s.expires_at,
           u.id as uid, u.display_name, u.role, u.status
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  if (row.status !== 'active') return null;
  return { user: { id: row.uid, displayName: row.display_name, role: row.role } };
}

// ── Cookie parser ──
function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of (cookieHeader || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  }
  return cookies;
}

// ── Shared: set up a WS connection after upgrade ──
function setupConnection(ws, db, user) {
  const peerId = randomBytes(8).toString('hex');
  roomManager.register(peerId, ws, user.id, user.displayName);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawData) => {
    if (!checkRateLimit(peerId)) {
      roomManager.sendTo(peerId, { type: 'error', message: 'Rate limit exceeded' });
      ws.close(1008, 'Rate limit exceeded');
      return;
    }
    const raw = typeof rawData === 'string' ? rawData : rawData.toString();
    handleMessage(peerId, raw, db, user.id, user.role);
  });

  ws.on('close', () => {
    peerMessageCounts.delete(peerId);
    roomManager.unregister(peerId);
  });
  ws.on('error', () => {
    peerMessageCounts.delete(peerId);
    roomManager.unregister(peerId);
  });
}

// ── Shared: authenticate an upgrade request ──
function authenticateUpgrade(request, db) {
  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies['erdmini_session'];
  if (!sessionId) return null;
  return validateSession(db, sessionId);
}

/**
 * Create a collab WebSocket handler (for use in Vite dev plugin).
 * Returns the wss instance and a handleUpgrade function.
 * The caller is responsible for wiring up the 'upgrade' event.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function createCollabHandler(db) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 });

  // Ping/pong keepalive
  const pingInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  /**
   * Handle a WebSocket upgrade for /collab.
   * Returns true if handled, false if not (wrong path or auth failure).
   */
  function handleUpgrade(request, socket, head) {
    // Always add error handler to prevent unhandled crash
    socket.on('error', (err) => {
      // ECONNRESET / EPIPE during upgrade = client closed (refresh/navigate) — benign
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
        log.debug('Socket closed during upgrade', { code: err.code });
        return;
      }
      log.warn('Socket error during upgrade', { error: err.message });
    });

    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/collab') {
      return false;
    }

    // Origin validation — reject cross-origin WebSocket upgrades (CSRF defense-in-depth)
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return true;
        }
      } catch {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return true;
      }
    }

    const result = authenticateUpgrade(request, db);
    if (!result) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return true; // handled (rejected)
    }

    const { user } = result;
    wss.handleUpgrade(request, socket, head, (ws) => {
      setupConnection(ws, db, user);
    });
    return true; // handled (accepted)
  }

  return { wss, handleUpgrade, notifySchemaChange };
}

/**
 * Initialize collab WebSocket on an HTTP server (for production use in server.js).
 * Uses server.on('upgrade') directly — no Vite conflict in production.
 *
 * @param {import('http').Server} server
 * @param {import('better-sqlite3').Database} db
 */
export function initCollabServer(server, db) {
  const { wss, handleUpgrade, notifySchemaChange } = createCollabHandler(db);

  server.on('upgrade', (request, socket, head) => {
    // Add error handler for ALL upgrade sockets (including non-collab)
    if (!socket.listenerCount('error')) {
      socket.on('error', (err) => {
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
          log.debug('Socket closed', { code: err.code });
          return;
        }
        log.warn('Socket error', { error: err.message });
      });
    }
    handleUpgrade(request, socket, head);
  });

  return { wss, notifySchemaChange };
}
