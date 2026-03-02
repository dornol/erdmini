import { createServer } from 'http';
import { handler } from './build/handler.js';
import Database from 'better-sqlite3';
import { initCollabServer } from './collab-server.js';

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || 'data/erdmini.db';

const server = createServer(handler);

// Initialize WebSocket collaboration server with its own DB connection
try {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initCollabServer(server, db);
  console.log('[collab] WebSocket server initialized');
} catch (e) {
  console.warn('[collab] Could not initialize WebSocket server:', e.message);
  console.warn('[collab] Real-time collaboration will be disabled');
}

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
