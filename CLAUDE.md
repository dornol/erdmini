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

# Type checking (no linter/formatter configured — svelte-check is the only code quality tool)
pnpm check            # svelte-check with strict TypeScript

# Testing (vitest, configured in vite.config.ts)
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

- **`erd.svelte.ts`**: Central store. Two exports: `erdStore` (schema, selection, undo/redo stack, all CRUD methods) and `canvasState` (viewport transform, grid snap, display mode, active schema). Every mutation calls `_emitOp()` to publish a `CollabOperation`.
- **`project.svelte.ts`**: Multi-project management. Delegates to the injected `StorageProvider`.
- **`collab.svelte.ts`**: WebSocket connection state, peers, remote cursors/selections.
- **`memo-drag.svelte.ts`**: Memo drag hover state for memo-table attachment.
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
- **`mcp/`**: Stateless MCP server at `/mcp` route. Fresh `McpServer` per POST request. `Authorization: Bearer` token auth with scoped API key permissions. 48 tools: CRUD for tables/columns/FKs/memos/domains, FK update, unique key/index CRUD, column reorder, table duplicate, memo attach/detach, auto-layout, group/schema rename, schema read/export/lint/diagram/DDL, domain analysis/coverage/dictionary, schema namespace listing, snapshots. Write ops call `notifyCollabSchemaChange()`.
- **`embed.ts`**: Embed token CRUD — `generateEmbedToken()` (32-byte hex), `createEmbedToken()`, `validateEmbedToken()`, `verifyEmbedPassword()` (argon2), `listEmbedTokens()`, `deleteEmbedToken()`, `deleteProjectEmbedTokens()`. Migration V009 creates `embed_tokens` table.
- **`logger.ts`**: Structured logger — `LOG_FORMAT=json` outputs JSON Lines to stdout, `LOG_FORMAT=text` (default) outputs `[module] message`. `LOG_LEVEL` filters (debug/info/warn/error). Uses `process.env` (not `$env`) for compatibility with plain JS files. Companion `logger.js` at project root for `server.js`/`collab-server.js`.

### Real-time Collaboration

- **`collab-server.js`** (plain JS, not TypeScript): WebSocket room manager. Runs in Vite dev plugin and production `server.js`. Handles join/leave/operation/presence/sync messages with session auth, permission checks, and Origin header validation (CSRF defense-in-depth).
- **`src/lib/collab/collab-client.ts`**: Browser WebSocket client with auto-reconnect (exponential backoff).
- **`src/lib/collab/operation-bridge.ts`**: Translates `CollabOperation` ↔ `erdStore` mutations. Sets `_isRemoteOp` flag to suppress undo history for remote changes.
- **`globalThis.__erdmini_notifySchemaChange`**: Bridges TypeScript server code → JS collab server without circular imports.

### Canvas Rendering

Tables and memos are DOM `div` elements with CSS `transform` (not Canvas/WebGL). FK lines are SVG overlaid on the canvas. Memos are sticky note cards (`MemoCard.svelte`) with drag, resize, inline editing, color selection, and table attachment (drag onto table to attach, moves with table). Schema namespaces filter visible tables/memos/FK lines via `SchemaTabBar.svelte`. This makes drag/selection/editing straightforward.

### i18n

Paraglide JS v2 with four languages: Korean (base locale), English, Japanese, Chinese. Message files in `messages/`. Auto-generated code in `src/lib/paraglide/` (excluded from TypeScript). Locale strategy: `localStorage` → browser preference → Korean fallback.

## Key Patterns

- **`PUBLIC_STORAGE_MODE` env var** gates everything: adapter selection, storage provider, auth middleware, collab features
- **`hooks.server.ts`** dynamically imports server modules to avoid loading them in static builds
- All utility functions in `src/lib/utils/` are pure; most have corresponding `.test.ts` files (34 test files, 1273 tests)
- 41 collab operation types in `src/lib/types/collab.ts` covering all schema mutations (tables, columns, FKs, domains, memos, schemas)
- `_isRemoteOp` and `_isUndoRedoing` flags on `erdStore` prevent unwanted undo history entries
- The main page (`src/routes/+page.svelte`) orchestrates all top-level effects: collab lifecycle, undo snapshots, debounced auto-save, keyboard shortcuts
- **Layout constants** in `src/lib/constants/layout.ts`: `TABLE_W=220`, `HEADER_H=37`, `ROW_H=26` — used for FK line routing, auto-layout, and SVG export
- **ID generation** uses 8-char alphanumeric (`Math.random().toString(36).slice(2,10)`), not UUIDs
- **Tailwind CSS v4** — config via CSS (no `tailwind.config.js`)
- **Migration system** is checksum-verified on startup — never modify applied SQL migration files, only add new `V###__description.sql` files
- **TODO list** in `docs/TODO.md` — feature improvement backlog; check remaining items when asked about pending work

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
| `PUBLIC_APP_URL` | `http://localhost:5173` | App URL for OIDC redirect URIs |
| `SESSION_MAX_AGE_DAYS` | `30` | Session cookie expiry in days |
| `AUDIT_RETENTION_DAYS` | `720` | Audit log retention period in days |
| `AUDIT_CLEANUP_HOUR` | `3` | Hour (0-23) for daily audit log cleanup |
| `LOG_FORMAT` | `text` | `json` (structured JSON Lines) or `text` (bracket prefix) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

## Security

### XSS Protection
- Svelte default text rendering — all user input (table/column names, memos, comments) auto-escaped
- `{@html}` used only in `+layout.svelte` for JSON-LD structured data, with `</` escape (`safeJsonLd()`)
- No `innerHTML`, `eval()`, `document.write()` usage in codebase
- Response headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (except `/embed`), `Referrer-Policy: strict-origin-when-cross-origin`

### CSRF Protection
- All state-changing APIs use JSON bodies — SvelteKit origin validation covers these automatically
- Session cookie: `httpOnly`, `sameSite: lax`, `secure` (HTTPS)
- WebSocket upgrade: Origin header validation + session authentication
- MCP endpoint: Bearer token auth (not cookie-based, immune to CSRF)
- No `Access-Control-Allow-Origin` headers set (same-origin only)

### Local Mode Security
- Schema data stored in IndexedDB (browser same-origin policy)
- localStorage stores UI preferences only (theme, grid, line type) — no schema data
- Server mode: schema stored in SQLite only, no browser persistence of schema data
