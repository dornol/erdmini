import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import type { Plugin } from 'vite';

function collabDevPlugin(): Plugin {
  return {
    name: 'collab-ws-dev',
    configureServer(server) {
      if (process.env.PUBLIC_STORAGE_MODE !== 'server') return;

      const httpServer = server.httpServer;
      if (!httpServer) return;

      const initCollab = async () => {
        try {
          const Database = (await import('better-sqlite3')).default;
          const dbPath = process.env.DB_PATH || 'data/erdmini.db';
          const db = new Database(dbPath, { readonly: false });
          db.pragma('journal_mode = WAL');
          db.pragma('foreign_keys = ON');

          const { createCollabHandler } = await import('./collab-server.js');
          const { handleUpgrade } = createCollabHandler(db);

          // Take over upgrade handling to prevent conflict with Vite's HMR WebSocket.
          // Save Vite's existing upgrade listeners, remove them, then add a single
          // unified handler that dispatches /collab to our handler and everything
          // else to Vite's original handlers.
          const viteListeners = httpServer.listeners('upgrade').slice();
          httpServer.removeAllListeners('upgrade');

          httpServer.on('upgrade', (request, socket, head) => {
            // Always add error handler to prevent crash on ECONNRESET etc.
            if (!socket.listenerCount('error')) {
              socket.on('error', (err) => {
                console.warn('[collab] Socket error:', (err as Error).message);
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
