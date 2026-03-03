# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

erdmini is a browser-based ERD (Entity Relationship Diagram) editor built with SvelteKit 2 + Svelte 5 Runes + Tailwind CSS v4. It runs in two modes controlled by `PUBLIC_STORAGE_MODE`:

- **Local mode** (default): Pure SPA with IndexedDB storage, no auth, no server
- **Server mode**: Node.js + SQLite, authentication (local + OIDC), WebSocket collaboration, MCP integration

## Commands

```bash
# Development
pnpm dev              # Local mode dev server (port 3000)
pnpm dev:server       # Server mode dev server (with auth + collab + SQLite)

# Build
pnpm build            # Static SPA build (adapter-static → build/)
pnpm build:server     # Server mode build (adapter-node → build/)
pnpm start:server     # Run production server (after build:server)

# Type checking
pnpm check            # svelte-check with strict TypeScript

# Testing (vitest)
pnpm test             # Run all tests once
pnpm test:watch       # Watch mode
npx vitest run src/lib/utils/ddl-export.test.ts          # Single test file
npx vitest run -t "test name pattern"                     # Single test by name
```

## Architecture

### Dual-Mode Build

`svelte.config.js` dynamically selects the adapter based on `PUBLIC_STORAGE_MODE`:
- `server` → `@sveltejs/adapter-node`
- otherwise → `@sveltejs/adapter-static` with SPA fallback

### State Management

All stores use **Svelte 5 Runes** (`.svelte.ts` files with `$state`). They are singleton class instances — no legacy Svelte stores API.

- **`erd.svelte.ts`**: Central store. Two exports: `erdStore` (schema, selection, undo/redo stack, all CRUD methods) and `canvasState` (viewport transform, grid snap, display mode). Every mutation calls `_emitOp()` to publish a `CollabOperation`.
- **`project.svelte.ts`**: Multi-project management. Delegates to the injected `StorageProvider`.
- **`collab.svelte.ts`**: WebSocket connection state, peers, remote cursors/selections.
- **`auth.svelte.ts`**, **`permission.svelte.ts`**, **`theme.svelte.ts`**, **`language.svelte.ts`**, **`dialog.svelte.ts`**, **`fk-drag.svelte.ts`**

### Storage Layer (`src/lib/storage/`)

`StorageProvider` interface with two implementations:
- `LocalStorageProvider` — IndexedDB (`erdmini` database)
- `ServerStorageProvider` — REST calls to `/api/storage/*`

Factory in `index.ts` selects based on `PUBLIC_STORAGE_MODE`.

### Server-Side (`src/lib/server/`)

Only loaded in server mode. Includes:
- **`db.ts`**: Singleton SQLite (better-sqlite3, WAL mode). Calls `runMigrations()` on first access.
- **`migrate.ts`**: Flyway-style migration runner. Auto-discovers `migrations/*.sql` via `import.meta.glob`, tracks versions in `schema_migrations` table with SHA-256 checksums, supports baseline detection for existing DBs.
- **`migrations/`**: Versioned SQL files (`V001__initial_schema.sql`, etc.). Add new `V###__description.sql` files for schema changes — never modify applied migrations.
- **`auth/`**: Password hashing (argon2), sessions (30-day, cookie-based), API keys (`erd_` prefix + SHA-256), OIDC (PKCE flow via openid-client), permission hierarchy (viewer < editor < owner, admin bypasses).
- **`mcp/`**: Stateless MCP server at `/mcp` route. Fresh `McpServer` per POST request. `Authorization: Bearer` token auth with scoped API key permissions. Read tools (list/get/export) and write tools (add/update/delete tables/columns/FKs/memos). Write ops call `notifyCollabSchemaChange()`.

### Real-time Collaboration

- **`collab-server.js`** (plain JS, not TypeScript): WebSocket room manager. Runs in Vite dev plugin and production `server.js`. Handles join/leave/operation/presence/sync messages with session auth and permission checks.
- **`src/lib/collab/collab-client.ts`**: Browser WebSocket client with auto-reconnect (exponential backoff).
- **`src/lib/collab/operation-bridge.ts`**: Translates `CollabOperation` ↔ `erdStore` mutations. Sets `_isRemoteOp` flag to suppress undo history for remote changes.
- **`globalThis.__erdmini_notifySchemaChange`**: Bridges TypeScript server code → JS collab server without circular imports.

### Canvas Rendering

Tables and memos are DOM `div` elements with CSS `transform` (not Canvas/WebGL). FK lines are SVG overlaid on the canvas. Memos are sticky note cards (`MemoCard.svelte`) with drag, resize, inline editing, and color selection. This makes drag/selection/editing straightforward.

### i18n

Paraglide JS v2 with four languages: Korean, English, Japanese, Chinese. Message files in `messages/`. Auto-generated code in `src/lib/paraglide/` (excluded from TypeScript).

## Key Patterns

- **`PUBLIC_STORAGE_MODE` env var** gates everything: adapter selection, storage provider, auth middleware, collab features
- **`hooks.server.ts`** dynamically imports server modules to avoid loading them in static builds
- All utility functions in `src/lib/utils/` are pure and have corresponding `.test.ts` files
- 34 collab operation types in `src/lib/types/collab.ts` covering all schema mutations (tables, columns, FKs, domains, memos)
- `_isRemoteOp` and `_isUndoRedoing` flags on `erdStore` prevent unwanted undo history entries
- The main page (`src/routes/+page.svelte`) orchestrates all top-level effects: collab lifecycle, undo snapshots, debounced auto-save, keyboard shortcuts

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_STORAGE_MODE` | `local` | `local` or `server` |
| `DB_PATH` | `data/erdmini.db` | SQLite file path (server mode) |
| `PORT` | `3000` | HTTP port (server mode) |
| `ADMIN_USERNAME` | `admin` | Initial admin username |
| `ADMIN_PASSWORD` | auto-generated | Initial admin password |
| `BASE_PATH` | — | Subdirectory deployment path |
| `PUBLIC_SITE_URL` | — | Canonical URL for SEO |
