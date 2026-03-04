# erdmini

A lightweight, browser-based ERD (Entity Relationship Diagram) editor.
Built with SvelteKit + Svelte 5 Runes + Tailwind CSS v4.
Supports both local mode (IndexedDB) and server mode (SQLite + authentication + real-time collaboration).

> This project was developed using [Claude Code](https://claude.ai/claude-code) (Anthropic CLI).

---

## Stack

| Category | Technology |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 (Runes) |
| Styling | Tailwind CSS v4 |
| Build | Vite 7 |
| Language | TypeScript |
| Package Manager | pnpm |
| i18n | Paraglide JS v2 (KO / EN / JA / ZH) |
| Layout Library | d3-force |
| DB (server mode) | SQLite (better-sqlite3, WAL) |
| Real-time | WebSocket (ws) |
| MCP | Streamable HTTP (`/mcp` endpoint) |
| Deployment | Docker (static SPA / Node.js server) |

---

## Features

### Canvas
- Mouse wheel zoom (0.2x ~ 3x)
- Background left-click drag / **right-click drag** / **Space+drag** panning
- Table card drag-to-move (with grid snap option)
- Minimap (click to move viewport)
- Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, up to 50 steps)
- History panel (visual timeline, click to jump to a specific point)
- Align and distribute tools (left/center/right/top/middle/bottom align, horizontal/vertical equal distribution)
- Image export (PNG, SVG, PDF)
- Fit to Window (fit all tables to screen)

### Themes
4 canvas themes supported (toggle from toolbar):

| Theme | Description |
|---|---|
| **Modern** | Rounded corners, soft shadows, dark header (default) |
| **Classic** | Sharp corners, paper tone, classic ERD feel |
| **Blueprint** | Right angles, thin outlines, blueprint style |
| **Minimal** | Slightly rounded, minimal shadows, clean light tone |

### Internationalization (i18n)
- Korean / English / Japanese / Chinese switching (toolbar)
- Based on Paraglide JS v2

### Table Management
- Add new tables (placed at viewport center)
- Inline table name editing via header double-click
- Table comment, color, and group settings
- Table duplication / position locking
- **Single select**: card / sidebar click
- **Multi-select**: Ctrl/Cmd + click, rubber band drag
- **Bulk operations**: delete, bulk edit color/group/comment, lock/unlock
- **Column display mode**: all / PK & FK only / name only

### Column Management
- CRUD from the right-side TableEditor panel
- **Double-click a column in the card** to edit immediately in a floating popup
- Drag to reorder columns
- PK (gold) / FK (blue) / UQ / AI badge display
- Detailed tooltip on column hover
- ENUM type (manage value lists)
- DECIMAL precision / scale separation
- CHECK constraints

### Foreign Keys
- Add/edit FK modal: source column → referenced table/column, ON DELETE / ON UPDATE actions
- **Crow's Foot Notation** relation lines (bezier / straight / orthogonal)
  - Dashed lines for nullable FK, mandatory tick distinction
  - Automatic 1:1 (unique FK) / 1:N detection
- Both columns highlighted on FK line hover
- Delete FK by clicking the line

### Domain Management
- Define reusable column property templates
- Changes to a domain are immediately reflected on all linked columns
- Domain link is automatically removed when a column is manually edited

### Schema Namespace
- Assign tables and memos to schemas (e.g., `public`, `auth`, `billing`)
- Schema tab bar to switch between schemas or view all
- Per-schema canvas viewport persistence
- DDL export: `CREATE SCHEMA` + schema-qualified table names
- DDL import: auto-extract schema from parsed statements

### DDL Import / Export
- **4 dialects supported**: MySQL / PostgreSQL / MariaDB / MSSQL
- **Export options**: indentation, quoting style, keyword case, include/exclude comments/indexes/FKs
- **Import**: DDL parsing → automatic table/column generation, auto-layout after import
- **Diagram export**: Mermaid, PlantUML

### Schema Tools
- **Schema validation / linting**: 8 rules (missing PK, missing FK target, duplicates, circular FKs, etc.)
- **Schema version diff**: compare against history or uploaded file, color-coded
- **URL sharing**: compress schema → share via URL hash

### Sticky Memos
- Canvas sticky notes (add / edit / delete / drag / resize)
- 6 color options (yellow, blue, green, pink, purple, orange)
- Inline editing (double-click → textarea)
- **Table attachment**: drag memo onto a table to attach; memo moves with table, pin badge indicates attachment
- Multi-select, group drag, lock support
- Visible in sidebar (double-click to navigate & edit), minimap, and image exports

### Sidebar
- Table list search (name + column name + comment)
- Memos section (color dot + content preview)
- Sort (by name / by creation order)
- Collapse / expand by group
- Table summary info (column count, FK count)

### Auto Layout

| Type | Description |
|---|---|
| **Grid** | BFS-ordered arrangement, FK-linked tables placed adjacent |
| **Hierarchical** | Top-down hierarchy based on FK direction, barycenter optimization |
| **Radial** | d3-force simulation — FK-linked clustering, repulsion + gravity balance |

When groups are defined, independent layout per group followed by meta-grid placement is supported.

### Project Management
- Multiple projects (create/rename/duplicate/delete/switch)
- Per-project canvas position saved
- Full project backup/restore (JSON)
- Command palette (Ctrl+K)
- Keyboard shortcut reference (? button)

---

## Dual Storage Modes

| Mode | Storage | Auth | Collaboration |
|---|---|---|---|
| **Local** (default) | IndexedDB | None | None |
| **Server** | SQLite (WAL) | Local + OIDC | WebSocket real-time |

Switch via the `PUBLIC_STORAGE_MODE` environment variable (`local` / `server`).

### Server Mode Features
- **Authentication**: Local auth (username/password) + multiple OIDC providers
- **Permissions**: Per-project roles (owner / editor / viewer)
- **Sharing**: User search → grant permissions, read-only mode
- **Real-time collaboration**: WebSocket sync, connected user cursor display, LWW conflict resolution
- **Admin**: User CRUD, OIDC provider management, API key management
- **MCP**: Streamable HTTP endpoint (`/mcp`), API key auth, 32 tools (tables, columns, FKs, memos, domains, DDL, diagrams, linting, domain analysis/dictionary, schema namespaces), collab integration

---

## Data Model

```
ERDSchema
├── tables: Table[]
│   ├── id, name, comment, color, group, locked, schema?
│   ├── position: { x, y }
│   ├── columns: Column[]
│   │   ├── id, name, type, length, scale
│   │   ├── nullable, primaryKey, unique, autoIncrement
│   │   ├── defaultValue, comment, check
│   │   ├── enumValues[]
│   │   └── domainId?
│   ├── foreignKeys: ForeignKey[]
│   │   ├── columnIds[] → referencedTableId.referencedColumnIds[]
│   │   └── onDelete, onUpdate
│   ├── uniqueKeys: UniqueKey[]
│   └── indexes: TableIndex[]
├── domains: ColumnDomain[]
├── memos: Memo[]
│   ├── id, content, color?, locked?, schema?
│   ├── position: { x, y }
│   ├── width, height
│   └── attachedTableId?
├── schemas?: string[]
└── groupColors?: Record<string, string>
```

---

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000 (local mode)
pnpm dev:server   # server mode (SQLite + Auth)
pnpm build        # output static files to build/
pnpm build:server # server build (adapter-node, includes MCP)
pnpm test         # vitest (366 tests)
pnpm check        # svelte-check type checking
```

---

## Docker Deployment

### Server Mode (SQLite + Auth + Real-time Collaboration)
```bash
docker compose up -d
# On first run, an admin account is created automatically and a random password is printed to the logs
docker compose logs erdmini | grep Password
```

### Static SPA (Local Mode)
```bash
docker compose --profile local up -d erdmini-local
```

For details on environment variables, volume management, reverse proxy, and MCP configuration, see [DOCKER.md](DOCKER.md)

For the full feature list, see [docs/prd/FEATURES.md](docs/prd/FEATURES.md)
