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
- Mouse wheel zoom (5% ~ 300%, cursor-centered)
- **Right-click drag** / **Space + left-click drag** panning
- Left-click on background: rubber band (marquee) selection
- Table card drag-to-move (with grid snap option)
- Minimap (click to move viewport)
- Undo / Redo (Ctrl+Z / Ctrl+Y, macOS: Cmd+Z / Cmd+Y, up to 200 steps)
- History panel (visual timeline, click to jump to a specific point)
- Align and distribute tools (left/center/right/top/middle/bottom align, horizontal/vertical equal distribution)
- Image export (PNG, SVG, PDF)
- Fit to Window (fit all tables to screen)
- FK line show/hide toggle
- Arrow key panning

### Themes
4 canvas themes supported (toggle from bottom bar):

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
- Table duplication (Ctrl+D) / position locking
- **Single select**: card / sidebar click
- **Multi-select**: Ctrl/Cmd + click, rubber band drag
- **Bulk operations**: delete, bulk edit color/group/comment/schema, lock/unlock
- **Table templates**: Quick-create common tables (users, audit_log, settings, files, tags)
- **Cross-project copy/paste**: Ctrl+C/V to copy selected tables between projects (IDs auto-remapped)
- Unique key and index info tooltips on table card hover
- Attached memo badge on table header

### Column Management
- CRUD from the right-side TableEditor panel
- **Double-click a column in the card** to edit in a floating popup (with delete button)
- **Quick add**: "+" button appears at table bottom on hover
- Drag to reorder columns
- Badges: PK (gold), FK (blue), UQ (purple), AI (green), CK (yellow)
- 16 column types: INT, BIGINT, SMALLINT, VARCHAR, CHAR, TEXT, BOOLEAN, DATE, DATETIME, TIMESTAMP, DECIMAL, FLOAT, DOUBLE, JSON, UUID, ENUM
- ENUM type (manage value lists)
- DECIMAL precision / scale separation
- CHECK constraints
- Column display mode: all / PK & FK only / name only

### Foreign Keys
- Add/edit FK modal: source column -> referenced table/column, ON DELETE / ON UPDATE actions
- **Crow's Foot Notation** relation lines (bezier / straight / orthogonal)
  - Dashed lines for nullable FK, mandatory tick distinction
  - Automatic 1:1 (unique FK) / 1:N detection
- Both columns highlighted on FK line hover
- **FK popover** on click: view FK info, edit label, edit FK, or delete
- **FK label**: Optional relationship description displayed on the FK line (double-click to inline edit)

### Domain Management
- Define reusable column property templates (type, length, nullable, default, etc.)
- Changes to a domain are immediately reflected on all linked columns
- Domain link is automatically removed when a column is manually edited
- **Hierarchy**: Parent/child domain relationships with circular reference detection
- **Grouping**: Organize domains by group with collapsible sections
- **Documentation fields**: description, alias, data standard, example, valid range, owner, tags
- **Coverage analysis**: Dashboard showing domain usage statistics across tables
- **Dictionary export**: HTML, Markdown, XLSX formats
- **Domain import/export**: XLSX bulk import/export
- **Unused domain filter**: Toggle to show only unused domains

### Schema Namespace
- Assign tables and memos to schemas (e.g., `public`, `auth`, `billing`)
- Schema tab bar to switch between schemas or view all
- Per-schema canvas viewport persistence
- DDL export: `CREATE SCHEMA` + schema-qualified table names
- DDL import: auto-extract schema from parsed statements

### Import / Export

**Import formats:**
- DDL (SQL) — 7 dialects: MySQL, PostgreSQL, MariaDB, MSSQL, SQLite, Oracle, H2
- Prisma schema
- DBML

**Export formats:**
- DDL (SQL) — 7 dialects with options: indentation, quoting, keyword case, include/exclude comments/indexes/FKs
- Prisma schema
- DBML
- Mermaid (diagram)
- PlantUML (diagram)
- JSON (full schema backup)
- PNG / SVG / PDF (image)

### SQL Playground
- In-browser SQL execution via sql.js (WASM)
- Schema auto-synchronized from current ERD
- Dummy data generation (topological sort for FK order)
- Query history

### Schema Tools
- **Schema validation / linting**: 9 rules (missing PK, missing FK target, duplicates, circular FKs, domain circular hierarchy, etc.)
- **Schema version diff**: Compare against history or uploaded file, color-coded
- **Schema snapshots**: Named save / restore / diff / auto-snapshot (5 min interval, max 50)
- **Migration SQL generation**: ALTER TABLE DDL from snapshot diffs (per dialect)
- **URL sharing**: Compress schema and share via URL hash
- **Command palette** (Ctrl+K / Ctrl+F, macOS: Cmd+K / Cmd+F): Search tables and columns

### Sticky Memos
- Canvas sticky notes (add / edit / delete / drag / resize)
- 6 color options (yellow, blue, green, pink, purple, orange)
- Inline editing (double-click -> textarea)
- **Table attachment**: Drag memo onto a table to attach; memo moves with table, pin badge indicates attachment
- Multi-select, group drag, lock support
- Visible in sidebar (double-click to navigate & edit), minimap, and image exports

### Sidebar
- Table list search (name + column name + comment)
- Memos section (color dot + content preview)
- Sort (by name / by creation order)
- Collapse / expand by group
- Table summary info (column count, FK count)
- Virtual scrolling for large schemas

### Auto Layout

| Type | Description |
|---|---|
| **Grid** | BFS-ordered arrangement, FK-linked tables placed adjacent |
| **Hierarchical** | Top-down hierarchy based on FK direction, barycenter optimization |
| **Radial** | d3-force simulation — FK-linked clustering, repulsion + gravity balance |

When groups are defined, independent layout per group followed by meta-grid placement is supported.

### Canvas Bottom Bar
- Auto-layout selector (Grid / Hierarchical / Radial)
- Column display mode (All / PK & FK only / Names only)
- Line style (Bezier / Straight / Orthogonal)
- Theme selector
- FK line visibility toggle
- Grid toggle / Snap toggle
- Align and distribute tools

---

## Dual Storage Modes

| Mode | Storage | Auth | Collaboration |
|---|---|---|---|
| **Local** (default) | IndexedDB | None | None |
| **Server** | SQLite (WAL) | Local + OIDC + LDAP | WebSocket real-time |

Switch via the `PUBLIC_STORAGE_MODE` environment variable (`local` / `server`).

### Server Mode Features
- **Authentication**: Local auth (username/password) + multiple OIDC providers + LDAP
- **Groups**: User groups with per-project group permissions, OIDC/LDAP group auto-sync on login, admin group mapping (auto promote/demote)
- **Permissions**: Per-project roles (owner / editor / viewer) for users and groups; per-user permission flags (can create project/API key/embed)
- **Sharing**: User/group search -> grant permissions, read-only mode
- **Real-time collaboration**: WebSocket sync, connected user cursor display, LWW conflict resolution
- **Admin**: User CRUD, Group management, OIDC/LDAP provider management, API key management, site branding (site name, logo, login message)
- **MCP**: Streamable HTTP endpoint (`/mcp`), API key auth, 66 tools (tables, columns, FKs, memos, domains, DDL, diagrams, linting, domain analysis/dictionary, schema namespaces, snapshots, bulk ops, search, table templates), collab integration
- **Audit trail**: Action logging (auth, schema changes, admin ops), configurable retention, admin UI
- **Embed**: Read-only iframe embed with token-based access and optional password protection
- **Structured logging**: JSON Lines (`LOG_FORMAT=json`) or text output, `LOG_LEVEL` filtering — 12-factor app compatible

---

## Data Model

```
ERDSchema
+-- tables: Table[]
|   +-- id, name, comment, color, group, locked, schema?
|   +-- position: { x, y }
|   +-- columns: Column[]
|   |   +-- id, name, type, length, scale
|   |   +-- nullable, primaryKey, unique, autoIncrement
|   |   +-- defaultValue, comment, check
|   |   +-- enumValues[]
|   |   +-- domainId?
|   +-- foreignKeys: ForeignKey[]
|   |   +-- columnIds[] -> referencedTableId.referencedColumnIds[]
|   |   +-- onDelete, onUpdate
|   |   +-- label?
|   +-- uniqueKeys: UniqueKey[]
|   +-- indexes: TableIndex[]
+-- domains: ColumnDomain[]
|   +-- id, name, type, length, scale, nullable, ...
|   +-- group?, parentId?
|   +-- description?, alias?, dataStandard?, example?, validRange?, owner?, tags?
+-- memos: Memo[]
|   +-- id, content, color?, locked?, schema?
|   +-- position: { x, y }
|   +-- width, height
|   +-- attachedTableId?
+-- schemas?: string[]
+-- groupColors?: Record<string, string>
```

---

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000 (local mode)
pnpm dev:server   # server mode (SQLite + Auth)
pnpm build        # output static files to build/
pnpm build:server # server build (adapter-node, includes MCP)
pnpm test         # vitest (53 files, 2073 tests)
pnpm check        # svelte-check type checking
```

---

## Docker Deployment

### Server Mode (SQLite + Auth + Real-time Collaboration)

```bash
docker run -d \
  --name erdmini \
  -p 3000:3000 \
  -v erdmini-data:/data \
  ghcr.io/dornol/erdmini:latest-server
```

On first run, an admin account is created automatically. Check the container logs for the generated password:
```bash
docker logs erdmini | grep Password
```

Or set an explicit password:
```bash
docker run -d --name erdmini -p 3000:3000 -v erdmini-data:/data \
  -e ADMIN_PASSWORD=your-secure-password \
  ghcr.io/dornol/erdmini:latest-server
```

### Static SPA (Local Mode)

```bash
docker run -d --name erdmini-local -p 8080:80 ghcr.io/dornol/erdmini:latest
```

### Docker Compose

A `docker-compose.yml` is also included for convenience. See [DOCKER.md](DOCKER.md) for details on volume management, reverse proxy, environment variables, and MCP configuration.

### Building for ARM64

The CI publishes `linux/amd64` images. To build for ARM64 (e.g., Apple Silicon, Raspberry Pi), build locally:

```bash
docker compose build erdmini        # uses host architecture
# or explicitly:
docker build --platform linux/arm64 -f Dockerfile.server -t erdmini-server .
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_STORAGE_MODE` | `local` | `local` (SPA + IndexedDB) or `server` (Node.js + SQLite) |
| `DB_PATH` | `data/erdmini.db` | SQLite file path (server mode) |
| `PORT` | `3000` | HTTP port (server mode) |
| `ADMIN_USERNAME` | `admin` | Initial admin username |
| `ADMIN_PASSWORD` | auto-generated | Initial admin password (printed to logs on first run) |
| `BASE_PATH` | -- | Subdirectory deployment path (e.g., `/erdmini`) |
| `PUBLIC_SITE_URL` | -- | Canonical URL for SEO |
| `PUBLIC_APP_URL` | `http://localhost:5173` | App URL for OIDC redirect URIs |
| `SESSION_MAX_AGE_DAYS` | `30` | Session cookie expiry in days |
| `AUDIT_RETENTION_DAYS` | `720` | Audit log retention period in days |
| `AUDIT_CLEANUP_HOUR` | `3` | Hour (0-23) for daily audit log cleanup |
| `LOG_FORMAT` | `text` | `json` (structured JSON Lines to stdout) or `text` (bracket prefix) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

---

## Security

- **XSS**: Svelte auto-escaping for all user input; `{@html}` used only for JSON-LD with `</` escape
- **CSRF**: JSON-only APIs (SvelteKit origin validation), session cookie `httpOnly` + `sameSite: lax` + `secure`
- **WebSocket**: Origin header validation + session authentication
- **MCP**: Bearer token auth (not cookie-based, immune to CSRF)
- **Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (except `/embed`), `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy`

---

For the full feature list, see [docs/prd/FEATURES.md](docs/prd/FEATURES.md)
