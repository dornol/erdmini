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

      // Lazy init: attach WebSocket to the Vite dev server's HTTP server
      const httpServer = server.httpServer;
      if (!httpServer) return;

      const initCollab = async () => {
        try {
          const Database = (await import('better-sqlite3')).default;
          const dbPath = process.env.DB_PATH || 'data/erdmini.db';
          const db = new Database(dbPath, { readonly: false });
          db.pragma('journal_mode = WAL');
          db.pragma('foreign_keys = ON');

          const { initCollabServer } = await import('./collab-server.js');
          initCollabServer(httpServer, db);
          console.log('[collab] WebSocket dev server initialized');
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn('[collab] Dev WebSocket init failed:', msg);
        }
      };

      // Init immediately if already listening, otherwise wait
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
