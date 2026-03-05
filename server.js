import { createServer } from 'http';
import { handler } from './build/handler.js';
import Database from 'better-sqlite3';
import { initCollabServer } from './collab-server.js';
import { createLogger } from './logger.js';

const log = createLogger('server');
const collabLog = createLogger('collab');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || 'data/erdmini.db';

const server = createServer(handler);

let collabDb = null;
let wss = null;

// Initialize WebSocket collaboration server with its own DB connection
try {
  collabDb = new Database(DB_PATH, { readonly: false });
  collabDb.pragma('journal_mode = WAL');
  collabDb.pragma('foreign_keys = ON');
  const collab = initCollabServer(server, collabDb);
  wss = collab.wss;
  globalThis.__erdmini_notifySchemaChange = collab.notifySchemaChange;
  collabLog.info('WebSocket server initialized');
} catch (e) {
  collabLog.warn('Could not initialize WebSocket server', { error: e.message });
  collabLog.warn('Real-time collaboration will be disabled');
}

// Prevent unhandled socket errors from crashing the server
process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    log.warn('Connection reset', { error: err.message });
  } else {
    log.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  }
});

// Graceful shutdown
function shutdown(signal) {
  log.info(`Received ${signal}, shutting down...`);

  // Close WebSocket server and all connections
  if (wss) {
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();
  }

  // Close the HTTP server
  server.close(() => {
    // Close DB connection
    if (collabDb) {
      try { collabDb.close(); } catch { /* ignore */ }
    }
    log.info('Shutdown complete');
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown stalls
  setTimeout(() => {
    log.warn('Forcing exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
  log.info(`Listening on port ${PORT}`, { port: Number(PORT) });
});
