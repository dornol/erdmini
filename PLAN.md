# erdmini — ERD Web Application Plan

## 1. Project Overview

A web application for visually authoring ERDs (Entity-Relationship Diagrams) in the browser, with DDL (Data Definition Language) import/export support.

**Goal:** An ERD editor that works directly in the browser without any installation. In server mode, it also supports authentication, team collaboration, and MCP integration.

**Tech stack:** SvelteKit 2, Svelte 5 Runes, TypeScript, Tailwind CSS v4, d3-force

### Overall System Architecture

```
  Local mode (default)              Server mode (monolithic SvelteKit)
 ┌─────────────────┐            ┌──────────────────────────────┐
 │  erdmini SPA    │            │  erdmini (Node.js)            │
 │  (adapter-static)│            │  (adapter-node)               │
 │                 │            │                              │
 │  StorageProvider│            │  StorageProvider              │
 │  └─ IndexedDB   │            │  └─ fetch → API routes        │
 └─────────────────┘            │       ↓                      │
                                │  hooks.server.ts (auth)       │
                                │       ↓                      │
                                │  /api/storage/* (CRUD)        │
                                │  /mcp (MCP Streamable HTTP)   │
                                │       ↓                      │
                                │  SQLite (WAL)                │
                                │       ↑                      │
                                │  WebSocket (collab-server)    │
                                └──────────────────────────────┘
```

---

## 2. Implementation Progress

### ✅ Phase 1 — Basic Editor

- [x] Canvas rendering (HTML+CSS `transform`-based, zoom/panning)
- [x] Add / delete tables
- [x] Add / edit / delete columns (name, type, PK/NN/UQ/AI)
- [x] Drag to move tables
- [x] Canvas zoom in/out (mouse wheel, cursor-centered) / panning
- [x] IndexedDB auto-save (ERD persists after tab is closed)

### ✅ Phase 2 — Relationships and DDL

- [x] FK relationship setup UI (TableEditor FK section)
- [x] Relationship line rendering (SVG bezier + crow's foot notation)
- [x] Delete FK line by clicking it
- [x] DDL Export — MySQL / PostgreSQL
- [x] DDL Import — node-sql-parser, schema prefix stripping, ALTER TABLE FK handling

### ✅ Phase 3 — Convenience Features and UX Improvements

- [x] JSON Export / Import
- [x] COMMENT parsing during DDL import → applied to table/column comments
- [x] Three auto-layout options (grid / hierarchical / radial d3-force)
- [x] FK add modal (FkModal)
- [x] Column double-click floating edit popup (ColumnEditPopup)
- [x] Ctrl/Cmd + click multi-select / bulk delete
- [x] Column domain system (reusable templates, propagation on edit)
- [x] Nullable FK dashed line / not-null FK solid line
- [x] Docker deployment (nginx SPA, adapter-static)

### ✅ Phase 4 — Advanced Features

- [x] Sidebar (search / sort / group view / collapse)
- [x] DDL in 4 dialects (MySQL, PostgreSQL, MariaDB, MSSQL)
- [x] Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, up to 50 steps)
- [x] Minimap (click-to-navigate)
- [x] Image export (PNG, SVG)
- [x] Table duplication
- [x] Column drag to reorder
- [x] Composite Unique Key / Index management modal
- [x] Table/column comments, CHECK constraints
- [x] Table color (preset palette) / groups
- [x] JSON Import/Export, URL sharing

### ✅ Phase 5 — Internationalization

- [x] Paraglide i18n (Korean / English / Japanese / Chinese)
- [x] ~270 message keys

### ✅ Phase 6 — Themes

- [x] 4 themes: Modern, Classic, Blueprint, Minimal
- [x] CSS variable-based (canvas area)
- [x] Dark mode

### ✅ Phase 7 — Selection and Interaction

- [x] Rubber band selection (left-click + drag)
- [x] Ctrl+drag to add to selection
- [x] Multi-table group drag to move
- [x] Space + left-click + drag to pan
- [x] Keyboard zoom/pan (+/-, arrow keys)
- [x] Fit to Window
- [x] Command Palette (Ctrl+K)
- [x] localStorage capacity warning + emergency JSON export

### ✅ Phase 8 — Improvements

- [x] Save canvas position per project
- [x] Ctrl+A select all / Ctrl+D duplicate
- [x] Sidebar column name search
- [x] Grid snap (20px, toggle)
- [x] Align / distribute tools
- [x] FK edit modal
- [x] Auto-layout after DDL import
- [x] ENUM type, DECIMAL precision/scale
- [x] Full project backup / restore
- [x] Save sidebar width
- [x] Table position lock
- [x] Mermaid / PlantUML export
- [x] RelationLines memoization, minimap render throttling

### ✅ Phase 9 — Dual Storage

- [x] StorageProvider interface + Local/Server implementations
- [x] `PUBLIC_STORAGE_MODE` environment variable (`local` / `server`)
- [x] Server mode: SvelteKit API + SQLite (better-sqlite3, WAL)
- [x] Docker support (`Dockerfile.server`, `docker-compose.yml`)

### ✅ Phase 10 — Authentication System

- [x] Local authentication (username/password, argon2 hashing)
- [x] Multiple OIDC providers (Keycloak, Auth0, Google, etc.)
- [x] Admin UI (user CRUD, OIDC provider management)
- [x] Session management (HttpOnly cookie, 30-day default)
- [x] Auto-creation of initial admin account (`ADMIN_USERNAME`/`ADMIN_PASSWORD`)

### ✅ Phase 11 — Permission Management

- [x] Per-project roles: owner / editor / viewer
- [x] Sharing UI (user search → grant permissions)
- [x] Read-only mode (viewer role)

### ✅ Phase 12 — Real-time Collaboration

- [x] WebSocket-based real-time synchronization
- [x] Display other users' cursors / selections (presence)
- [x] LWW conflict resolution
- [x] Auto-reconnect on disconnect + schema synchronization

### ✅ Phase 13 — Additional Tools

- [x] Schema validation/linting (8 rules, LintPanel)
- [x] PDF export (jsPDF + svg2pdf.js)
- [x] Bulk table edit / bulk lock-unlock
- [x] DDL export format options (indentation, quoting, keywords, included items)
- [x] Undo history panel (visual timeline, click to jump)
- [x] Column display mode (all / PK&FK only / name only)
- [x] Schema version diff (history/file upload, color-coded)

### ✅ Phase 14 — MCP Server

- [x] MCP (Model Context Protocol) Streamable HTTP endpoint (`/mcp`)
- [x] API key authentication (`erd_` prefix + SHA-256 hash, CRUD in Admin UI)
- [x] 14 tools: list_projects, get_schema, export_ddl, lint_schema, export_diagram, add/update/delete table/column, add/delete foreign_key, import_ddl
- [x] `createMcpServer(db, keyInfo)` factory pattern
- [x] SvelteKit API route (`src/routes/mcp/+server.ts`), no separate bundle required
- [x] Collab server integration (WebSocket notification on schema change)

---

## 3. Core Data Model

```typescript
interface Column {
  id: string;
  name: string;
  domainId?: string;
  type: ColumnType;
  length?: number;
  scale?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
  check?: string;
  enumValues?: string[];
}

interface ForeignKey {
  id: string;
  columnIds: string[];              // Composite FK support
  referencedTableId: string;
  referencedColumnIds: string[];
  onDelete: ReferentialAction;      // CASCADE | SET NULL | RESTRICT | NO ACTION
  onUpdate: ReferentialAction;
}

interface Table {
  id: string;
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  uniqueKeys: UniqueKey[];
  indexes: TableIndex[];
  position: { x: number; y: number };
  comment?: string;
  color?: string;
  group?: string;
  locked?: boolean;
}

interface ERDSchema {
  version: string;
  tables: Table[];
  domains: ColumnDomain[];
  groupColors?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
```

The schema is persisted via `StorageProvider`. Local mode: IndexedDB. Server mode: SQLite (via API).

---

## 4. Technical Decisions

| Item | Decision | Rationale |
|---|---|---|
| Canvas rendering | HTML+CSS `div` + `transform` | Table cards managed directly as DOM elements; drag/selection is straightforward to implement |
| Relationship line rendering | SVG `position: absolute; overflow: visible` | Placed inside the canvas world div; coordinate calculation is simple |
| State management | Svelte 5 Runes (`$state`, `.svelte.ts`) | Built into the framework; no additional library needed |
| Auto-layout | Grid/hierarchical: custom implementation / Radial: d3-force | Grid/hierarchical are simple enough to implement directly; radial benefits from force simulation for natural clustering |
| DDL parser | node-sql-parser | Supports MySQL/PG/MariaDB/MSSQL dialects |
| Styling | Tailwind CSS v4 | Utility classes, JIT |
| Deployment | Docker — static SPA (nginx) or server mode (Node.js + SQLite) | Switched via `PUBLIC_STORAGE_MODE` |
| Authentication | Local + OIDC | Standard protocol, supports multiple IdPs |
| Real-time collaboration | WebSocket (ws) + LWW | Bidirectional communication, low latency |
| PDF export | jsPDF + svg2pdf.js | Dynamic import to minimize bundle size |
| MCP | @modelcontextprotocol/sdk + Streamable HTTP | Integrated into SvelteKit route; no separate process required |

---

## 5. File Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── Canvas.svelte            Viewport transform (zoom/pan), theme CSS variables
│   │   ├── TableCard.svelte         Draggable table card, column display mode
│   │   ├── ColumnEditPopup.svelte   Column double-click floating edit popup
│   │   ├── TableEditor.svelte       Right panel — table name/comment/column CRUD/FK management
│   │   ├── RelationLines.svelte     FK SVG overlay (bezier + crow's foot)
│   │   ├── Sidebar.svelte           Table list, multi-select, groups, search
│   │   ├── Toolbar.svelte           Logo, new table, DDL/domain/auto-layout/theme/language, etc.
│   │   ├── Minimap.svelte           Canvas minimap
│   │   ├── DdlModal.svelte          Import/Export tab modal + DDL format options
│   │   ├── DomainModal.svelte       Domain management (tabular view)
│   │   ├── FkModal.svelte           FK add/edit modal
│   │   ├── LintPanel.svelte         Schema lint results panel
│   │   ├── HistoryPanel.svelte      Undo history panel
│   │   ├── SchemaDiffModal.svelte   Schema version diff modal
│   │   ├── BulkEditModal.svelte     Bulk table edit modal
│   │   ├── CollabIndicator.svelte   Real-time collaboration participant indicator
│   │   ├── ShareProjectModal.svelte Project sharing modal
│   │   └── DialogModal.svelte       Confirm/cancel dialog
│   ├── server/
│   │   ├── db.ts                    SQLite (better-sqlite3) singleton + migration runner
│   │   ├── migrate.ts               Flyway-style DB migration runner
│   │   ├── migrations/              Versioned SQL files (V001__, V002__, ...)
│   │   ├── auth/api-key.ts          API key authentication (SHA-256 hash)
│   │   ├── collab-notify.ts         Collab schema change notification
│   │   └── mcp/
│   │       ├── server.ts            MCP server factory (createMcpServer)
│   │       ├── db-helpers.ts        Schema/project DB helpers
│   │       └── schema-ops.ts        Schema transformation pure functions
│   ├── storage/
│   │   ├── types.ts                 StorageProvider interface
│   │   ├── local-storage-provider.ts  IndexedDB implementation
│   │   ├── server-storage-provider.ts fetch-based server implementation
│   │   └── index.ts                 Provider factory
│   ├── store/
│   │   ├── erd.svelte.ts            ERDStore + CanvasState ($state-based)
│   │   ├── project.svelte.ts        ProjectStore (async, delegates to provider)
│   │   ├── theme.svelte.ts          Theme store (4 themes)
│   │   ├── language.svelte.ts       Language store (4 languages)
│   │   ├── auth.svelte.ts           Auth store
│   │   ├── permission.svelte.ts     Permission store
│   │   ├── collab.svelte.ts         Real-time collaboration store
│   │   └── dialog.svelte.ts         Dialog store
│   ├── types/
│   │   └── erd.ts                   Column, Table, ERDSchema, ForeignKey types
│   └── utils/
│       ├── auto-layout.ts           Grid / hierarchical / radial algorithms
│       ├── ddl-export.ts            4-dialect DDL generation + format options
│       ├── ddl-import.ts            DDL parsing → ERDSchema
│       ├── schema-lint.ts           Schema validation (8 rules)
│       ├── schema-diff.ts           Schema version comparison
│       ├── svg-export.ts            SVG export
│       ├── pdf-export.ts            PDF export
│       ├── diagram-export.ts        Mermaid / PlantUML export
│       └── url-share.ts             URL sharing (compress/decompress)
├── routes/
│   ├── api/storage/                 Schema/canvas/project CRUD API
│   ├── api/auth/                    Auth API (login, logout, OIDC)
│   ├── api/admin/                   Admin API (users, OIDC providers, API keys)
│   ├── mcp/+server.ts               MCP Streamable HTTP endpoint
│   ├── admin/+page.svelte           Admin page
│   ├── login/+page.svelte           Login page
│   └── +page.svelte                 Root page — full layout composition
├── collab-server.js                 WebSocket collaboration server
└── messages/
    ├── ko.json, en.json, ja.json, zh.json
```

---

## 6. Relationship Line Notation

| Relationship | Notation | Implementation |
|---|---|---|
| 1:N | Crow's foot (on N side) | SVG path + polyline |
| Nullable FK | Dashed line | `stroke-dasharray: 5 3` |
| Not-null FK | Solid line | Default stroke |

FK lines update in real time as tables are moved. Clicking a line deletes it.

---

## 7. Server Mode Architecture

Monolithic SvelteKit structure — authentication, API, and MCP are all handled within SvelteKit, with no separate API server.

- Session / API key authentication in `hooks.server.ts` (HttpOnly cookie + `Authorization: Bearer` header)
- Local authentication (username/password, argon2 hashing)
- Multiple OIDC provider integration (Keycloak, Auth0, Google, etc.)
- Operates in IndexedDB mode without authentication (guest mode preserved)
- Admin UI: user CRUD, OIDC providers, API key management
- Per-project permissions: owner / editor / viewer
- Real-time collaboration: WebSocket, participant cursors, LWW conflict resolution
- MCP: Streamable HTTP (`/mcp`), 14 tools, collab integration

```
[Browser] → [SvelteKit hooks.server.ts] → [OIDC Provider / Local Auth]
                     ↓ session cookie
             [SvelteKit API routes]
                     ↓
                [SQLite DB]
                     ↑
             [WebSocket (collab-server)]

[AI tool] → [/mcp (Streamable HTTP)] → [API key auth]
                     ↓
             [MCP Server (14 tools)]
                     ↓
                [SQLite DB] → [Collab notification]
```

---

## 8. Tests

11 test files, 247 tests — all passing.

| File | Test count | Coverage |
|------|-----------|------|
| `auto-layout.test.ts` | 20 | 3 layout types, per-group placement |
| `ddl-export.test.ts` | 53 | 4 dialects + format options |
| `ddl-import.test.ts` | 48 | 4 dialect parsing, FK/UQ/INDEX |
| `diagram-export.test.ts` | 19 | Mermaid + PlantUML |
| `svg-export.test.ts` | 12 | SVG export |
| `schema-lint.test.ts` | 18 | 8 lint rules |
| `schema-diff.test.ts` | 21 | Table/column/FK/index comparison |
| Other | 56 | common, table-color, url-share |
