import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import type { Plugin } from 'vite';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

function collabDevPlugin(): Plugin {
  return {
    name: 'collab-ws-dev',
    configureServer(server) {
      // Read .env file via Vite's loadEnv (process.env alone misses .env values)
      const env = loadEnv(server.config.mode, process.cwd(), '');
      const storageMode = env.PUBLIC_STORAGE_MODE || process.env.PUBLIC_STORAGE_MODE;

      if (storageMode !== 'server') return;

      const httpServer = server.httpServer;
      if (!httpServer) return;

      const initCollab = async () => {
        try {
          const Database = (await import('better-sqlite3')).default;
          const dbPath = env.DB_PATH || process.env.DB_PATH || 'data/erdmini.db';
          const db = new Database(dbPath, { readonly: false });
          db.pragma('journal_mode = WAL');
          db.pragma('foreign_keys = ON');

          // Use absolute path for dynamic import (Vite compiles config to temp dir)
          const collabServerPath = pathToFileURL(resolve('collab-server.js')).href;
          const { createCollabHandler } = await import(collabServerPath);
          const { handleUpgrade } = createCollabHandler(db);

          // Take over upgrade handling to prevent conflict with Vite's HMR WebSocket.
          // Save Vite's existing upgrade listeners, remove them, then add a single
          // unified handler that dispatches /collab to our handler and everything
          // else to Vite's original handlers.
          const viteListeners = httpServer.listeners('upgrade').slice() as Function[];
          httpServer.removeAllListeners('upgrade');

          httpServer.on('upgrade', (request: import('http').IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
            if (!socket.listenerCount('error')) {
              socket.on('error', (err: Error) => {
                // Suppress expected connection reset errors
              });
            }

            const handled = handleUpgrade(request, socket, head);
            if (!handled) {
              // Not /collab — delegate to Vite's original handlers (HMR etc.)
              for (const listener of viteListeners) {
                listener.call(httpServer, request, socket, head);
              }
            }
          });

          console.log('[collab] WebSocket dev server initialized');
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn('[collab] Dev WebSocket init failed:', msg);
        }
      };

      // Init after server starts listening (when Vite has registered its handlers)
      if (httpServer.listening) {
        initCollab();
      } else {
        httpServer.once('listening', initCollab);
      }
    },
  };
}

export default defineConfig({
  server: {
    host: true,
    port: 5174,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'home-macmini'
    ]
  },
  plugins: [
    tailwindcss(),
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['localStorage', 'baseLocale'],
    }),
    collabDevPlugin(),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
