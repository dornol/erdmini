# Feature Specification

Full feature specification for erdmini, organized by area.

---

## 1. Canvas

Infinite canvas running in the browser. Based on HTML div + CSS `transform`.

### Viewport

| Item | Spec |
|---|---|
| Zoom range | 0.05x ~ 3.0x (5% ~ 300%) |
| Zoom step | ×1.1 (zoom in) / ×0.9 (zoom out) per wheel tick |
| Zoom anchor | Mouse cursor position (cursor stays fixed) |
| Touch zoom | Pinch gesture supported (same range) |
| Keyboard zoom | `+`/`=` zoom in, `-` zoom out (0.2x ~ 3.0x range) |

### Pan (Move)

| Method | Behavior |
|---|---|
| Right-click drag | Always pans |
| Space + left-click drag | Pan (cursor changes to grab → grabbing) |
| Arrow keys | Move 60px per press |

Left-click drag on the background performs rubber band (marquee) selection, not panning.

### Grid Snap

- Grid size: 20px fixed
- Toggle from CanvasBottomBar
- When enabled, table/memo positions snap to 20px increments

### Minimap

- Displayed at bottom-right of canvas
- Renders all tables + memos in miniature
- Click to move viewport to that location
- Shows current viewport area

### Fit to Window

- Auto-adjusts zoom/position so all tables/memos fit on screen

### FK Line Visibility

- Toggle FK line show/hide from CanvasBottomBar

---

## 2. Table

### CRUD

- **Create**: Placed at viewport center, auto-named (`table_1`, `table_2`, ...)
- **Rename**: Inline editing via header double-click
- **Delete**: Select + Delete/Backspace, confirmation dialog. FK references auto-cleaned
- **Duplicate**: Ctrl+D, placed next to the original
- **Templates**: 5 predefined templates (users, audit_log, settings, files, tags)

### Properties

| Property | Description |
|---|---|
| `name` | Table name |
| `comment` | Description (optional) |
| `color` | Header color — 14-color palette (red, orange, amber, green, teal, blue, purple, pink, lime, cyan, indigo, rose, slate, brown) |
| `group` | Group name (free text, datalist autocomplete) |
| `locked` | Lock — prevents drag/delete, shows lock icon on card |
| `schema` | Schema namespace (optional) |

### Drag

- Left-click drag to move
- Grid Snap: snaps to 20px increments when enabled
- Locked tables cannot be dragged

### Column Display Mode

Controls which columns are visible on the card:

| Mode | Display |
|---|---|
| `all` | All columns |
| `pk-fk-only` | PK + FK columns only |
| `names-only` | Column names only (type/badges omitted) |

Switch from CanvasBottomBar. Saved to `localStorage`.

### Table Card Info

- Unique key / Index info tooltip on card hover
- Attached memo badge on table header
- Filtered columns indicator ("filtered")

### Cross-Project Copy/Paste

- Ctrl+C/V to copy selected tables to another project
- IDs auto-remapped

---

## 3. Column

### CRUD

- Add/edit/delete from the right-side TableEditor panel
- Double-click a column in the card → ColumnEditPopup floating editor
- "+" button appears at table bottom on hover → quick column add
- Drag to reorder
- Column duplication (within the same table)

### Types

16 types supported:

| Category | Types |
|---|---|
| Integer | `INT`, `BIGINT`, `SMALLINT` |
| Float | `FLOAT`, `DOUBLE`, `DECIMAL` (precision + scale) |
| String | `VARCHAR` (length), `CHAR` (length), `TEXT` |
| Date | `DATE`, `DATETIME`, `TIMESTAMP` |
| Other | `BOOLEAN`, `JSON`, `UUID`, `ENUM` (value list management) |

### Constraints

| Constraint | Badge | Description |
|---|---|---|
| Primary Key | PK (gold) | Primary key |
| Foreign Key | FK (blue) | Foreign key (auto-assigned on FK relationship) |
| Nullable | — | NULL allowed |
| Unique | UQ (purple) | Unique constraint |
| Auto Increment | AI (green) | Auto increment |
| CHECK | CK (yellow) | CHECK constraint expression |
| Default Value | — | Default value expression. Type-specific presets (NOW(), CURRENT_TIMESTAMP, UUID(), 0, etc.) |

### Composite Constraints

- Composite Unique Key: Multi-column unique constraint (managed via ConstraintModal)
- Index: Multi-column index (managed via ConstraintModal)

### Hover Tooltip

Hovering over a column on the card shows detailed info: type, nullable, badges, comment, etc.

---

## 4. Foreign Key

### CRUD

- Add/edit via FkModal: select source column → referenced table/column
- Composite FK support (multiple column pairs)
- FK drag creation: drag from column handle → target column
- FK popover: click FK line → view info, edit label, edit FK, or delete
- FK label: Optional relationship description displayed on the FK line (double-click to inline edit)

### Referential Actions

ON DELETE / ON UPDATE configured separately:

| Action | Description |
|---|---|
| `CASCADE` | Child changes/deletes when parent changes/deletes |
| `SET NULL` | Child set to NULL when parent deleted |
| `RESTRICT` | Prevents parent change if children exist (default) |
| `NO ACTION` | Similar to RESTRICT (DBMS-specific behavior) |

### Relation Lines

SVG bezier curves + crow's foot notation:

| Relationship | Representation |
|---|---|
| 1:N | Crow's foot on N side |
| 1:1 | Ticks on both sides (when FK column is Unique) |
| Nullable FK | Dashed line (`stroke-dasharray: 5 3`) |
| Not-null FK | Solid line |

3 line styles: bezier / straight / orthogonal (switch from CanvasBottomBar)

- Real-time update as tables move
- Both related columns highlighted on FK line hover
- Multiple FKs between same table pair auto-spaced
- Self-referencing FK loop support
- FK line show/hide toggle

---

## 5. Domain

Column property templates. Changes to a domain auto-propagate to all linked columns.

### Properties

Properties managed by domains:

| Category | Fields |
|---|---|
| Column attributes | `type`, `length`, `scale`, `nullable`, `primaryKey`, `unique`, `autoIncrement`, `defaultValue`, `check`, `enumValues`, `comment` |
| Organization | `group`, `parentId` (hierarchy) |
| Documentation | `description`, `alias`, `dataStandard`, `example`, `validRange`, `owner`, `tags` |

### Behavior

- CRUD in DomainModal (table-style UI)
- Link column to domain: domain properties copied to column
- Domain edit: changes auto-propagate to all linked columns
- Manual column edit: domain link auto-removed
- Group-based organization (collapse/expand)
- Unused domain filter (showUnusedOnly toggle)

### Hierarchy

- `parentId` field for parent/child domain relationships
- Circular reference detection (lint rule 9)

### Coverage & Dictionary

- **Coverage Dashboard**: Domain-linked column ratio, per-group statistics
- **Dictionary Export**: HTML, Markdown, XLSX formats
- **Domain Import/Export**: XLSX bulk import/export

---

## 6. Sticky Memo

Post-it style cards on the canvas.

### CRUD

- Add from Toolbar → placed at viewport center, enters edit mode immediately
- Double-click for inline editing (textarea)
- Escape or blur to end editing

### Properties

| Property | Description |
|---|---|
| `content` | Text content |
| `color` | 6 colors (yellow, blue, green, pink, purple, orange). Color picker shown at bottom |
| `position` | Canvas coordinates |
| `width`, `height` | Size (resize via bottom-right handle, min 120x80) |
| `locked` | Lock — prevents drag/resize/edit |
| `schema` | Schema namespace (optional) |
| `attachedTableId` | Attached table ID (optional) |

### Table Attachment

- Drag memo onto a table to attach
- Attached memo moves with the table
- Pin badge displayed

### Selection

- Ctrl/Cmd+click for multi-select
- Included in rubber band selection
- Group drag after multi-select

---

## 7. Schema Namespace

### Schema Tabs

- Assign tables/memos to schemas (e.g., `public`, `auth`, `billing`)
- SchemaTabBar: (All) + per-schema tabs (delete x + add +)
- Per-schema viewport position saved/restored on switch
- Schema filter applies to: canvas, sidebar, minimap, FK lines

### DDL Integration

- Export: `CREATE SCHEMA IF NOT EXISTS` + `schema.table` format
- Import: Auto-extracts schema from SQL statements, assigns to active schema tab

---

## 8. Import / Export

### Import

| Format | Description |
|---|---|
| DDL (SQL) | 7 dialects: MySQL, PostgreSQL, MariaDB, MSSQL, SQLite, Oracle, H2 |
| Prisma | Prisma schema parsing (enum, model, @ignore, @@ignore, @updatedAt, enum @map) |
| DBML | Custom DBML parser (Table, Column, Enum, Ref, Indexes) |

- node-sql-parser based DDL parsing
- COMMENT parsing → applied to table/column comments
- ALTER TABLE FK handling
- Schema prefix auto-stripping
- Auto-layout after import (FK relations → hierarchical, otherwise grid)
- i18n error messages

### Export — DDL

7 dialects: MySQL, PostgreSQL, MariaDB, MSSQL, SQLite, Oracle, H2

**Format options**:

| Option | Values | Default |
|---|---|---|
| `indent` | `2spaces` / `4spaces` / `tab` | `2spaces` |
| `quoteStyle` | `none` / `backtick` / `double` / `bracket` | Dialect-specific default |
| `includeComments` | boolean | true |
| `includeIndexes` | boolean | true |
| `includeForeignKeys` | boolean | true |
| `includeDomains` | boolean | false |
| `upperCaseKeywords` | boolean | true |

Format options saved to `localStorage`.

### Export — Other Formats

| Format | Description |
|---|---|
| Prisma | Prisma schema generation |
| DBML | DBML format generation |
| Mermaid | erDiagram format text |
| PlantUML | @startuml/@enduml format text |

### Export — Image

| Format | Implementation |
|---|---|
| PNG | Raster conversion via Canvas API |
| SVG | Tables + memos + FK lines as SVG |
| PDF | jsPDF + svg2pdf.js (dynamic import to minimize bundle) |

All image formats include memos.

### Export — Data

| Format | Description |
|---|---|
| JSON | Full ERDSchema JSON (single project) |
| JSON Backup | All projects bulk backup/restore |
| URL | Schema DEFLATE compressed + base64url encoded → URL hash |

---

## 9. SQL Playground

- In-browser SQL execution via sql.js (WASM)
- Current ERD schema auto-synchronized (CREATE TABLE)
- Dummy data generation (topological sort respecting FK order)
- Query history

---

## 10. Schema Tools

### Lint (Validation)

13 rules:

| Rule | Severity | Description |
|---|---|---|
| `no-pk` | warning | Table has no primary key |
| `fk-target-missing` | error | FK references non-existent table/column |
| `set-null-not-nullable` | warning | SET NULL on NOT NULL column |
| `duplicate-column-name` | error | Duplicate column names in same table |
| `duplicate-table-name` | error | Duplicate table names |
| `duplicate-index` | warning | Duplicate index with same column combination |
| `circular-fk` | warning | Circular FK reference (DFS detection) |
| `empty-table` | info | Table with no columns |
| `domain-circular-hierarchy` | error | Domain hierarchy circular reference |
| `fk-type-mismatch` | warning | FK column type incompatible with referenced column (compat groups: integer, string, numeric, temporal) |
| `nullable-pk` | warning | PK column that is nullable |
| `fk-column-count-mismatch` | error | FK columnIds and referencedColumnIds have different lengths |
| `fk-references-non-unique` | warning | FK references columns that are not PK or unique |

LintPanel displays results. Click an issue to navigate to the affected table.

### Schema Diff

Compare two schema versions:
- Source: previous version from undo history or file upload
- Color-coded: added (green) / removed (red) / modified (yellow)
- Compared: tables, columns, FKs, indexes

### Migration SQL

- Auto-generate ALTER TABLE DDL from snapshot diffs
- Per-dialect output support

### Schema Snapshots

- Manual save (name + description)
- Auto-snapshot (5-minute interval, max 50)
- Restore / compare (diff) / delete

### URL Share

- Schema DEFLATE compressed → base64url encoded → URL hash (`#s=<encoded>`)
- Includes project name
- Auto-loads on receipt

---

## 11. Auto Layout

3 layout algorithms:

| Type | Algorithm | Characteristics |
|---|---|---|
| **Grid** | BFS ordering | BFS traversal from root tables, FK-linked tables placed adjacent |
| **Hierarchical** | Barycenter | FK direction-based top-down hierarchy, barycenter optimization |
| **Radial** | d3-force | FK link + collision avoidance + repulsion simulation |

**Layout constants**: gap 60px, margin 40px, group gap 80px

**Group Layout**: When `groupByGroup` option enabled, independent layout per group followed by meta-grid placement.

### Align & Distribute

Available when 2+ items selected:
- **Align**: Left / center / right / top / middle / bottom
- **Distribute**: Horizontal / vertical equal spacing

---

## 12. Sidebar

Left panel. Table list + memo section.

### Search

Basic search: table name, column name, column comment, table comment, FK referenced table name, group name (case-insensitive)

**Prefix filters** (7 types):

| Prefix | Description | Example |
|---|---|---|
| `fk:` | Tables with FKs | `fk:` |
| `group:` | Filter by group name | `group:auth` |
| `locked:` | Locked tables | `locked:` |
| `type:` | Column type filter | `type:varchar` |
| `has:` | Has attribute filter | `has:pk`, `has:fk`, `has:index`, `has:comment`, `has:domain`, `has:unique`, `has:auto`, `has:default`, `has:color`, `has:enum`, `has:locked` |
| `no:` | Missing attribute filter | `no:pk`, `no:fk` |
| `color:` | Table color filter | `color:blue` |

Search hint dropdown (click / arrow key selection).

### Sort

| Mode | Behavior |
|---|---|
| `creation` | Creation order (default) |
| `name` | Alphabetical |

### Group View

- Collapse/expand per group
- Collapsed state saved to `localStorage`

### Memos Section

- Color dot + content preview
- Click to select memo + move viewport

### Virtual Scroll

Handles 1000+ tables. VirtualList component (binary search, overscan, scrollToIndex).

---

## 13. Project

### Multi-Project

- Create / rename / duplicate / delete / switch
- Dropdown shows modified time + table count
- Per-project canvas position (x, y, scale) saved

### Backup / Restore

- All projects JSON bulk export/import

### Auto-Save

- 300ms debounced auto-save on schema change
- Storage capacity warning + emergency JSON download
- Legacy data auto-migration

### Command Palette

- `Ctrl+K` / `Ctrl+F` toggle (macOS: `Cmd+K` / `Cmd+F`)
- Search table/column names (case-insensitive)
- Arrow key navigation, Enter to select table + move viewport

---

## 14. Selection & Interaction

### Selection Methods

| Method | Behavior |
|---|---|
| Left-click | Single select (table or memo) |
| Ctrl/Cmd + click | Toggle selection |
| Left-click + drag (background) | Rubber band area selection |
| Ctrl + drag (background) | Keep existing selection + add area |
| Ctrl+A | Select all tables + memos |
| Escape | Cancel rubber band → deselect all |

### Multi-Select Operations

- Group drag to move
- Bulk delete (confirmation dialog)
- Bulk Edit: color, group, comment, schema for selected tables
- Bulk Lock/Unlock

### Keyboard Shortcuts

| Shortcut | macOS | Action |
|---|---|---|
| `F` | `F` | Toggle fullscreen |
| `Escape` | `Escape` | Exit fullscreen → deselect |
| `Ctrl+K` / `Ctrl+F` | `Cmd+K` / `Cmd+F` | Toggle command palette |
| `Ctrl+Z` | `Cmd+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | `Cmd+Y` / `Cmd+Shift+Z` | Redo |
| `Ctrl+A` | `Cmd+A` | Select all |
| `Ctrl+D` | `Cmd+D` | Duplicate selected tables |
| `Ctrl+C` / `Ctrl+V` | `Cmd+C` / `Cmd+V` | Copy/paste tables (cross-project) |
| `Delete` / `Backspace` | `Delete` / `Backspace` | Delete selected items |
| `+` / `=` | `+` / `=` | Zoom in |
| `-` | `-` | Zoom out |
| Arrow keys | Arrow keys | Pan canvas (60px) |
| `?` | `?` | Keyboard shortcuts help panel |

---

## 15. Undo / Redo

- Max 200 history steps
- Snapshot approach: stores entire schema as JSON before each change
- Duplicate snapshot prevention
- Remote operations (`_isRemoteOp`) are not recorded in history

### History Panel

- Visual timeline (Undo past / current / Redo future distinction)
- Each entry has label + detail (table name, column name, etc.)
- Click to jump to a specific point

---

## 16. Theme & i18n

### Theme

4 canvas themes:

| Theme | Description |
|---|---|
| **Modern** | Rounded corners, soft shadows, dark header (default) |
| **Classic** | Sharp corners, paper tone, traditional ERD style |
| **Blueprint** | Right angles, thin outlines, blueprint style |
| **Minimal** | Slightly rounded corners, minimal shadows, clean light tone |

- CSS variable based (`data-theme` attribute)
- 14-color table palette has per-theme color mappings
- **Dark Mode**: Applied to Toolbar / Sidebar / modals

### i18n

- Compile-time i18n via Paraglide JS v2
- 4 languages: Korean / English / Japanese / Chinese
- Language switching from Toolbar

### Canvas Bottom Bar

Control bar at the bottom center of the canvas:
- Auto-layout selector (Grid / Hierarchical / Radial)
- Column display mode (All / PK & FK only / Names only)
- Line style (Bezier / Straight / Orthogonal)
- Theme selector
- FK line show/hide toggle
- Grid toggle / Snap toggle
- Align/distribute tools

---

## 17. Server Mode

Activated with `PUBLIC_STORAGE_MODE=server`. Features not available in local mode.

### Authentication

| Method | Description |
|---|---|
| Local Auth | Username + password (argon2 hashing) |
| OIDC | Multi-provider (Keycloak, Auth0, Google, etc.). PKCE flow. Managed in Admin UI |
| LDAP | LDAP/AD authentication. Managed in Admin UI |

- Session: `erdmini_session` HttpOnly cookie, 30-day default
- Admin account auto-created on first run

### Groups

- User group management
- Per-project group permissions
- OIDC/LDAP group auto-sync on login
- Admin group mapping (auto promote/demote)

### Permission

Per-project roles:

| Role | Read | Write | Manage |
|---|---|---|---|
| viewer | O | X | X |
| editor | O | O | X |
| owner | O | O | O |
| admin (user role) | O | O | O (all projects) |

Per-user permission flags: `can_create_project`, `can_create_api_key`, `can_create_embed`

### Sharing

- User/group search → project permission grant modal
- Viewer role has full read-only mode (editing UI disabled)

### Real-time Collaboration

- WebSocket-based real-time synchronization
- 41 operation types (tables/columns/FKs/UKs/indexes/domains/groups/memos/layout/schemas)
- LWW (Last-Writer-Wins) conflict resolution
- Connected user cursor/selection display (Presence)
- Auto-reconnect on disconnect + schema sync (exponential backoff)

### MCP

Streamable HTTP endpoint (`/mcp`). API key authentication. 66 tools.

See [docs/mcp/](../mcp/) for details.

### Admin UI

- User CRUD + permission flags
- Group management
- OIDC/LDAP provider management
- API key management
- Project management
- Embed token management
- Audit log viewer
- Backup/restore
- Site branding (site name, logo URL, login message)

### Embed

- Read-only iframe embed
- Token-based access
- Optional password protection

### Audit Trail

- Action logging (auth, schema changes, admin operations)
- Configurable retention period (default 720 days)
- Viewable in Admin UI
