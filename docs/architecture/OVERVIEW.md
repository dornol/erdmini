# Architecture Overview

## System Architecture

erdmini runs in two modes controlled by the `PUBLIC_STORAGE_MODE` environment variable.

```
  Local mode (default)                Server mode
 ┌───────────────────┐            ┌─────────────────────────────────┐
 │  SPA (browser)    │            │  SvelteKit (Node.js)            │
 │  adapter-static   │            │  adapter-node                   │
 │                   │            │                                 │
 │  StorageProvider  │            │  StorageProvider                │
 │  └─ IndexedDB     │            │  └─ fetch → /api/storage/*      │
 │                   │            │                                 │
 │  No auth          │            │  hooks.server.ts (session/auth) │
 │  No collaboration │            │  /api/auth/* (login, OIDC)      │
 └───────────────────┘            │  /api/admin/* (user CRUD)       │
                                  │  /mcp (MCP Streamable HTTP)     │
                                  │       ↓                         │
                                  │  SQLite (WAL mode)              │
                                  │       ↑                         │
                                  │  WebSocket (collab-server.js)   │
                                  └─────────────────────────────────┘
```

The build adapter is selected dynamically in `svelte.config.js`:
- `server` → `@sveltejs/adapter-node`
- otherwise → `@sveltejs/adapter-static` with SPA fallback

---

## Data Model

```
ERDSchema
├── version: string
├── tables: Table[]
│   ├── id, name, comment?, color?, group?, locked?
│   ├── position: { x, y }
│   ├── columns: Column[]
│   │   ├── id, name, type (ColumnType), length?, scale?
│   │   ├── nullable, primaryKey, unique, autoIncrement
│   │   ├── defaultValue?, comment?, check?, enumValues?
│   │   └── domainId? → links to ColumnDomain
│   ├── foreignKeys: ForeignKey[]
│   │   ├── id, columnIds[], referencedTableId, referencedColumnIds[]
│   │   └── onDelete, onUpdate (CASCADE | SET NULL | RESTRICT | NO ACTION)
│   ├── uniqueKeys: UniqueKey[]
│   └── indexes: TableIndex[]
├── domains: ColumnDomain[]
│   ├── id, name, type, length?, scale?
│   ├── nullable, primaryKey, unique, autoIncrement
│   ├── defaultValue?, comment?, group?
│   └── (changes propagate to all linked columns)
├── memos: Memo[]
│   ├── id, content, color?, locked?
│   ├── position: { x, y }
│   └── width, height
├── groupColors?: Record<string, string>
├── createdAt, updatedAt
```

16 column types: `INT`, `BIGINT`, `SMALLINT`, `TINYINT`, `FLOAT`, `DOUBLE`, `DECIMAL`, `CHAR`, `VARCHAR`, `TEXT`, `DATE`, `DATETIME`, `TIMESTAMP`, `BOOLEAN`, `BLOB`, `ENUM`

---

## Canvas Rendering

Tables and memos are **DOM `div` elements** positioned with CSS `transform` — not Canvas API or WebGL.

```
Canvas.svelte (viewport)
└── div.canvas-world  [transform: translate(x, y) scale(s)]
    ├── TableCard.svelte[]     position: absolute, left/top in world coords
    ├── MemoCard.svelte[]      position: absolute, left/top in world coords
    └── RelationLines.svelte   SVG overlay (position: absolute, overflow: visible)
```

- **Zoom**: Mouse wheel → `canvasState.scale` (0.2x ~ 3x), cursor-centered
- **Pan**: Right-click drag / Space+drag / arrow keys
- **Grid snap**: Optional 20px grid, toggle from toolbar
- **FK lines**: SVG bezier curves with crow's foot notation. Dashed for nullable FK.

Layout constants (`src/lib/constants/layout.ts`):
| Constant | Value | Usage |
|---|---|---|
| `TABLE_W` | 220px | Table card width |
| `HEADER_H` | 37px | Table header height |
| `ROW_H` | 26px | Column row height |
| `COMMENT_H` | 26px | Comment row height |
| `BOTTOM_PAD` | 8px | Bottom padding |

---

## State Management

All stores use **Svelte 5 Runes** (`.svelte.ts` files with `$state`). They are singleton class instances exported directly — no Svelte stores API.

### ERDStore (`src/lib/store/erd.svelte.ts`)

Central store. Manages:
- Schema data (tables, columns, FKs, domains, memos)
- Selection state (selectedTableId/Ids, selectedMemoId/Ids)
- Undo/redo history (max 50 entries)
- All CRUD methods (addTable, updateColumn, deleteForeignKey, etc.)

Every mutation calls `_emitOp()` to publish a `CollabOperation` for real-time sync. Flags:
- `_isRemoteOp` — suppresses undo history for remote changes
- `_isUndoRedoing` — suppresses undo snapshot during undo/redo

### CanvasState (`src/lib/store/erd.svelte.ts`)

Viewport transform and display settings:
- `x`, `y`, `scale` — viewport position/zoom
- `gridSnap` — snap to 20px grid
- `columnDisplayMode` — `'all'` | `'pk-fk-only'` | `'names-only'`

### Other Stores

| Store | File | Responsibility |
|---|---|---|
| `projectStore` | `project.svelte.ts` | Multi-project management, delegates to StorageProvider |
| `collabStore` | `collab.svelte.ts` | WebSocket connection state, peers, remote cursors |
| `authStore` | `auth.svelte.ts` | Current user session |
| `permissionStore` | `permission.svelte.ts` | Project permission level, read-only flag |
| `themeStore` | `theme.svelte.ts` | 4 themes + dark mode |
| `languageStore` | `language.svelte.ts` | 4 languages (KO/EN/JA/ZH) |
| `dialogStore` | `dialog.svelte.ts` | Confirm/cancel dialog queue |
| `fkDragStore` | `fk-drag.svelte.ts` | FK drag-to-create state |

---

## Storage Layer

`StorageProvider` interface (`src/lib/storage/types.ts`) with two implementations:

```typescript
interface StorageProvider {
  loadIndex(): Promise<ProjectIndex | null>;
  saveIndex(index: ProjectIndex): Promise<void>;
  loadSchema(projectId: string): Promise<ERDSchema | null>;
  saveSchema(projectId: string, schema: ERDSchema): Promise<void>;
  deleteSchema(projectId: string): Promise<void>;
  loadCanvasState(projectId: string): Promise<CanvasData | null>;
  saveCanvasState(projectId: string, data: CanvasData): Promise<void>;
  deleteCanvasState(projectId: string): Promise<void>;
  loadLegacySchema(): Promise<string | null>;
  deleteLegacyKey(): Promise<void>;
}
```

| Implementation | Storage | Details |
|---|---|---|
| `LocalStorageProvider` | IndexedDB (`erdmini` DB) | 3 object stores: `projects`, `schemas`, `canvas`. Auto-migrates from legacy localStorage. |
| `ServerStorageProvider` | REST → SQLite | Calls `/api/storage/*` endpoints. Server uses better-sqlite3 in WAL mode. |

Factory in `src/lib/storage/index.ts` selects implementation based on `PUBLIC_STORAGE_MODE`.

---

## Server Mode

### Authentication

Two auth methods, both session-based (HttpOnly cookie `erdmini_session`, 30-day default):

**Local auth**: Username/password with argon2 hashing.

**OIDC**: Multi-provider support (Keycloak, Auth0, Google, etc.) via PKCE flow. Providers are configured in Admin UI, not env vars.

**API keys**: For MCP access. Format `erd_` + 64 hex chars. SHA-256 hash stored in DB. Optional per-project scoped permissions.

### Permission Model

3-level hierarchy per project:

```
viewer (read-only) < editor (read+write) < owner (full control)
```

Admin role bypasses all permission checks. Every project creator automatically gets owner.

### Database Migrations

Flyway-style migration runner (`src/lib/server/migrate.ts`):

- Files: `V###__description.sql` in `src/lib/server/migrations/`
- Tracking: `schema_migrations` table with SHA-256 checksums
- Baseline detection for existing databases
- SAVEPOINT transactions with rollback on failure

Current migrations:
| Version | Description |
|---|---|
| V001 | Initial schema (users, sessions, OIDC, projects, permissions, API keys) |
| V002 | Add user_id column to project_index |
| V003 | Backfill owner permissions from project data |

### Real-time Collaboration

WebSocket-based (`collab-server.js`, plain JS):

```
Browser A ──ws──┐
Browser B ──ws──┤── collab-server (room manager)
Browser C ──ws──┘        │
                    session auth + permission check
```

- **Room model**: One room per project. Join/leave on project switch.
- **Operation sync**: 34 operation types covering all schema mutations. Broadcast to all peers in room.
- **Conflict resolution**: Last-Writer-Wins (LWW) based on `updatedAt` timestamp.
- **Presence**: Remote cursor positions and selected table IDs.
- **Reconnect**: Exponential backoff. On reconnect, `request-sync` fetches latest schema.

Client: `src/lib/collab/collab-client.ts`
Bridge: `src/lib/collab/operation-bridge.ts` (translates CollabOperation to erdStore mutations, sets `_isRemoteOp`)

### MCP Server

Stateless MCP endpoint at `/mcp` route. Fresh `McpServer` instance per POST request.

```
[AI tool] → POST /mcp → Authorization: Bearer erd_xxx
                ↓
         SvelteKit route handler
                ↓
         createMcpServer(db, keyInfo)
                ↓
         22 tools (read + write)
                ↓
         SQLite ←→ Collab notification
```

Architecture:
- `src/routes/mcp/+server.ts` — SvelteKit route (GET=SSE, POST=request, DELETE=session end)
- `src/lib/server/mcp/server.ts` — `createMcpServer()` factory, tool definitions
- `src/lib/server/mcp/db-helpers.ts` — Schema/project DB access
- `src/lib/server/mcp/schema-ops.ts` — Pure schema transformation functions

Write operations call `notifyCollabSchemaChange()` via `globalThis.__erdmini_notifySchemaChange` to push changes to connected WebSocket clients.

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Canvas rendering | HTML+CSS `div` + `transform` | DOM elements for table cards; drag/selection is straightforward |
| FK lines | SVG with `overflow: visible` | Inside canvas world div; simple coordinate calculation |
| State management | Svelte 5 Runes (`$state`) | Built into framework; no external library |
| Auto-layout | Grid/hierarchical: custom, Radial: d3-force | Simple algorithms custom-built; radial benefits from force simulation |
| DDL parser | node-sql-parser | Multi-dialect support (MySQL/PG/MariaDB/MSSQL) |
| Server DB | SQLite (better-sqlite3, WAL) | Single-file, zero-config, sufficient for collaboration scale |
| Auth | Local + OIDC (PKCE) | Standard protocol, multi-provider support |
| Collaboration | WebSocket + LWW | Low latency, simple conflict resolution |
| MCP | Streamable HTTP in SvelteKit route | No separate process; integrated into existing server |
| i18n | Paraglide JS v2 | Compile-time, type-safe, 4 languages |
| Themes | CSS variables per theme | Canvas-only theming; table colors have per-theme mappings |

---

## File Structure

```
src/
├── lib/
│   ├── components/         UI components (Canvas, TableCard, MemoCard, Sidebar, etc.)
│   ├── store/              Svelte 5 rune stores (.svelte.ts)
│   ├── storage/            StorageProvider interface + implementations
│   ├── server/             Server-only code (auth, DB, migrations, MCP)
│   │   ├── auth/           Password, session, API key, OIDC, permissions
│   │   ├── migrations/     Versioned SQL files
│   │   └── mcp/            MCP server factory + tools
│   ├── collab/             Collaboration client + operation bridge
│   ├── types/              TypeScript types (erd.ts, collab.ts, auth.ts)
│   ├── utils/              Pure utility functions (DDL, layout, export, lint, diff)
│   ├── constants/          Layout dimensions, table colors
│   └── paraglide/          Generated i18n code
├── routes/
│   ├── +page.svelte        Main page (orchestrates all top-level effects)
│   ├── api/storage/        Schema/canvas/project CRUD API
│   ├── api/auth/           Auth API (login, logout, OIDC callbacks)
│   ├── api/admin/          Admin API (users, OIDC providers, API keys)
│   ├── mcp/                MCP Streamable HTTP endpoint
│   ├── admin/              Admin page
│   └── login/              Login page
├── collab-server.js        WebSocket room manager (plain JS)
└── messages/               i18n message files (ko/en/ja/zh.json)
```
