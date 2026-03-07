# erdmini Feature Improvement List

## Quick Wins (Small Scope, High Impact)

### ~~1. Keyboard Shortcut Help Panel~~ ✅
- ~~Display a shortcut list modal via the `?` key or a help button~~

### ~~2. Locked Table Canvas Indicator~~ ✅
- ~~Show a lock icon/badge on TableCard~~

### ~~3. Persist Sidebar Group Collapse State~~ ✅
- ~~Save collapsed group list to localStorage and restore on page reload~~

### ~~4. FK Referential Integrity Warning~~ ✅
- ~~Included in schema linting (set-null-not-nullable rule)~~

### ~~5. Sidebar Search Expansion~~ ✅
- ~~7 prefix filters: fk:, group:, locked:, type:, has:, no:, color:~~
- ~~Search hint dropdown (clickable / keyboard arrow key selection)~~
- ~~Include column comments in basic search~~

### ~~6. Column Copy / Duplicate~~ ✅
- ~~Duplicate a column within the same table (column_duplicate feature)~~

### ~~7. Column Default Value Presets~~ ✅
- ~~Type-specific common default value dropdown (NOW(), CURRENT_TIMESTAMP, UUID(), 0, etc.)~~

---

## Medium-Scale Improvements

### ~~8. Bulk Table Edit~~ ✅
- ~~Dialog to modify color, group, and comment for multiple selected tables at once~~
- ~~Includes bulk lock / unlock functionality~~

### ~~9. Schema Validation / Linting~~ ✅
- ~~9 rules: missing PK, missing FK target, SET NULL + NOT NULL, duplicate columns / tables / indexes, circular FK, empty table, domain circular hierarchy~~
- ~~LintPanel: severity icons, click to navigate to the affected table~~

### ~~10. PDF Export~~ ✅
- ~~Based on jsPDF + svg2pdf.js; converts SVG output to PDF~~

### ~~11. DDL Export Format Options~~ ✅
- ~~Indentation (2 spaces / 4 spaces / tab), quoting (none / backtick / double / bracket), keyword casing~~
- ~~Toggle inclusion of comments / indexes / FKs; saved to localStorage~~

### ~~12. Undo History Panel~~ ✅
- ~~Scrollable history list with Redo (future) / current / Undo (past) distinction~~
- ~~Click to jump to a specific point in time; i18n labels + detail display~~

### ~~13. Column Display Mode~~ ✅
- ~~3 modes: All / PK & FK only / Name only~~
- ~~Integrated with FK relation lines, minimap, and canvas height calculation~~

### ~~14. Schema Version Diff~~ ✅
- ~~Select a previous version from history or via file upload~~
- ~~Color-coded display of added / removed / modified tables, columns, FKs, and indexes~~

---

## Large-Scale Improvements

### ~~15. FK Line Smart Routing~~ ✅
- ~~Prevent FK line overlaps; optimize spline paths~~
- ~~Auto-spread FK lines between the same table pair, avoid intermediate table obstacles, self-referencing loops~~
- ~~Extracted into a `fk-routing.ts` module; shared by RelationLines + svg-export~~

### ~~16. Sidebar Virtual Scroll for Large Schemas~~ ✅
- ~~Optimize DOM rendering for 1000+ tables~~
- ~~Generic VirtualList.svelte component (binary search, overscan, scrollToIndex)~~
- ~~Sidebar: flatten into VirtualRow and apply virtual scroll~~

### ~~17. Accessibility (A11y) Improvements~~ — Won't Do
- ~~ARIA labels, keyboard navigation, screen reader support~~
- Skipped: ERD editor is a canvas-based visual tool where full screen reader support is impractical. Practical accessibility for modals/dropdowns/command palette is already implemented.

### ~~18. FK Line Type Selection~~ ✅
- ~~Allow users to choose FK line rendering style: curved (current bezier), straight, orthogonal (right-angle)~~
- ~~Add `lineType` setting to canvasState~~
- ~~Line type switcher in Toolbar or settings~~
- ~~Difficulty: Medium~~

### ~~19. Memo-Table Attachment~~ ✅
- ~~Drag & drop a memo onto a table to attach it~~
- ~~Attached memo shows as a pin badge on memo header + chip above table card~~
- ~~Memo moves with the table; drop on empty space to detach~~
- ~~`attachedTableId` field on Memo type; drag threshold to prevent accidental detach~~
- ~~Sidebar memo double-click to navigate and edit~~
- ~~Difficulty: Medium~~

### ~~20. API Key Permission Edit & Usage Tracking~~ ✅
- ~~Allow permission changes after API key creation (API + Admin UI)~~
- ~~Add `last_used_at` column to `api_keys` table (migration)~~
- ~~Update `last_used_at` on each API key authentication~~
- ~~Display last used timestamp in Admin API Keys UI~~
- ~~Difficulty: Small~~

### ~~21. Admin Page Enhancements~~ ✅
- ~~Project management: member list per project, owner transfer, project delete~~
- ~~Users tab: auth provider badges (Local / OIDC provider name)~~
- ~~Backup & Restore: DB download (WAL checkpoint + copy), upload restore with validation & rollback~~
- ~~Admin UI: Projects tab + Backup tab added~~
- ~~i18n: 21 new keys across 4 languages (ko/en/ja/zh)~~
- ~~Difficulty: Large~~

### ~~22. cross-env for Windows Compatibility~~ ✅
- ~~Add `cross-env` package for cross-platform env var support in npm scripts~~
- ~~Apply to `PUBLIC_STORAGE_MODE=server` and other env-dependent scripts~~
- ~~Difficulty: Small~~

---

## Large-Scale Improvements

### ~~23. Audit Trail Logging~~ ✅
- ~~Log key activities in server mode: schema changes, MCP operations, admin settings, API key issuance, user registration/login~~
- ~~Design log storage format (DB table + query API + Admin UI)~~
- Difficulty: Large

### ~~24. DDL Dialect Expansion (Oracle, H2, SQLite)~~ ✅
- ~~Oracle: NUMBER, VARCHAR2, CLOB type mappings~~
- ~~H2: MySQL-compatible mode considerations~~
- ~~SQLite: INTEGER, TEXT, REAL simple type system~~
- ~~Extend Dialect type, update ddl-export.ts / ddl-import.ts / MCP dialect options~~
- ~~Add tests per dialect~~
- ~~DDL import module split by dialect (ddl-import-mssql.ts, ddl-import-oracle.ts, ddl-import-types.ts)~~
- ~~Difficulty: Large~~

---

## Long-Term Vision

### ~~25. AI Schema Generation~~ ✅ (Replaced by MCP)
- ~~Automatically generate a schema from a natural language description (e.g., "Create a blog system")~~
- MCP server (66 tools) is already implemented, so AI clients (Claude, etc.) can directly call `add_table`, `add_column`, `add_foreign_key` to generate schemas
- No separate LLM integration needed — MCP infrastructure fulfills this role

### ~~26. Live DB Connection & Reverse Engineering~~ — Won't Do
- ~~Connect to a live database and automatically extract the schema~~
- Excluded: Does not fit erdmini's "mini" philosophy. DB credential management creates security burden, DB driver dependencies increase bundle size. DDL/Prisma/DBML import provides sufficient reverse engineering paths.

### ~~27. Schema Snapshots~~ ✅
- ~~Named snapshots: save current schema state, list/restore/delete, diff comparison~~
- ~~Storage: IndexedDB (local mode), SQLite (server mode), REST API, MCP tools~~
- ~~Branching (parallel editing) excluded — snapshots only~~

### ~~28. Schema Namespace (Multi-Schema per Project)~~ ✅
- ~~`schema` field on tables/memos (e.g., `public`, `auth`, `billing`)~~
- ~~Schema tab bar at the top of the canvas to switch between schemas~~
- ~~Each schema tab renders only its own tables, memos, and FK lines~~
- ~~Per-schema canvas viewport state persistence~~
- ~~DDL export: `CREATE SCHEMA` + schema-qualified table names (`auth.users`)~~
- ~~DDL import: extracts schema from parsed statements~~
- ~~MCP: `list_schemas` tool, schema filter on `list_tables`/`list_memos`~~
- ~~Difficulty: Medium~~

### ~~29. Auto-Snapshot + History Extension~~ ✅
- ~~Periodic auto-snapshots (5-minute interval) with `isAuto` flag~~
- ~~Auto-pruning: keeps max 50 auto-snapshots, manual snapshots untouched~~
- ~~SnapshotPanel: Auto badge, filter toggle (All / Manual / Auto)~~
- ~~MAX_HISTORY expanded from 50 to 200~~
- ~~SQLite migration V008: `is_auto` column on `schema_snapshots`~~
- ~~Collab mode: only lexicographically first peer creates auto-snapshots~~

### ~~30. iframe Embed (Read-Only View)~~ ✅
- ~~Read-only diagram view embeddable via iframe on external sites~~
- ~~`/embed/[token]` route: canvas + tables + FK lines + memos + SchemaTabBar rendering (Toolbar/Sidebar/Editor removed)~~
- ~~Zoom/panning only, no editing (permissionStore → viewer)~~
- ~~Server mode only: token-based access + optional password protection (argon2) + expiration date~~
- ~~EmbedModal: token create/delete, URL/iframe code copy~~
- ~~embed_tokens SQLite table (V009 migration), hooks.server.ts conditional X-Frame-Options bypass~~
- ~~Cascade delete embed tokens on project deletion~~
- Difficulty: Medium

### ~~31. DBML Import / Export~~ ✅
- ~~[DBML (Database Markup Language)](https://dbml.dbdiagram.io/) format support~~ ✅ (Import + Export implemented)
- ~~**Import**: DBML text → ERDSchema conversion parser~~ ✅
- ~~**Export**: ERDSchema → DBML text generation~~ ✅
- `src/lib/utils/dbml-import.ts`, `src/lib/utils/dbml-export.ts`, DdlModal integration, MCP tools (export_dbml, import_dbml)
- 89 tests (53 import + 36 export)

### ~~32. ORM / Framework Schema Import~~ — Won't Do (Rails/Django/TypeORM)
- ORM and framework schema file → ERD generation
- ~~**Prisma** (`schema.prisma`): model, @id, @relation, @unique, enum parsing~~ ✅ (Import + Export implemented)
- ~~**Rails** (`schema.rb`)~~ — Won't Do: DDL 7 dialects + DBML + Prisma import is sufficient. Low user overlap
- ~~**Django** (`models.py`)~~ — Won't Do: Same reason
- ~~**TypeORM / Sequelize** (TypeScript)~~ — Won't Do: Same reason

### ~~33. SQL Playground (Browser SQLite via WASM)~~ ✅
- ~~In-browser SQLite WASM (`sql.js`) to create current schema as an actual DB and execute SQL queries~~
- ~~**Schema sync**: Current ERD → `exportDDL(schema, 'sqlite')` → auto-execute CREATE TABLE~~
- ~~**SQL editor**: Query input → execute → result table display (SELECT, INSERT, UPDATE, DELETE)~~
- ~~**Dummy data auto-generation**: Type-based value generation, FK topological sort order INSERT, adjustable N rows per table~~
- ~~**Implementation**: `sql.js` WASM lazy load, `SqlPlaygroundModal.svelte`, `dummy-data.ts` (topological sort + type-based dummy values + INSERT generation)~~
- ~~Toolbar > Tools > SQL Playground, query history (localStorage, max 20), Ctrl/Cmd+Enter to execute~~
- ~~70 tests (unit + integration: E-commerce, Blog, HR, edge cases)~~
- Difficulty: Medium

### ~~34. Migration SQL Generation (Schema Diff → DDL)~~ ✅
- ~~Convert existing `schema-diff.ts` `SchemaDiff` results to per-dialect `ALTER TABLE` DDL~~
- ~~`generateMigrationSQL(diff: SchemaDiff, dialect: Dialect, options?, currTables?): string`~~
- ~~**Supported commands**: CREATE/DROP TABLE, RENAME TABLE, ADD/DROP/ALTER COLUMN, ADD/DROP FK/INDEX/UNIQUE KEY~~
- ~~**Per-dialect handling**: MySQL MODIFY COLUMN, PG ALTER COLUMN TYPE/SET/DROP, SQLite recreate-table, Oracle MODIFY, MSSQL ALTER COLUMN~~
- ~~**SchemaDiffModal integration**: dialect dropdown + "Export Migration SQL" button + SQL preview + copy/download~~
- ~~71 tests (unit + dialect + integration)~~
- Difficulty: Large

### ~~35. DDL Export Quality Improvements (Minor Gaps)~~ ✅
- ~~**PostgreSQL ENUM**: `CREATE TYPE ... AS ENUM(...)` generation (was VARCHAR fallback)~~
- ~~**PostgreSQL SMALLSERIAL**: `SMALLINT + autoIncrement` → `SMALLSERIAL` mapping~~
- ~~**Schema Diff gaps**: Added UniqueKey changes, enumValues comparison~~
- ~~**MSSQL schema-qualified comments**: `sp_addextendedproperty` uses actual schema name instead of hardcoded `dbo`~~
- ~~**Import normalizeType**: `DATETIME` → internal `DATETIME` preserved (was being unified to `TIMESTAMP`)~~
- ~~**Import SMALLSERIAL**: `SMALLSERIAL` → `SMALLINT` + autoIncrement mapping added~~
- Difficulty: Medium

### ~~36. UX Improvements (Phase 38)~~ ✅
- ~~**FK Labels**: `ForeignKey.label?: string` — Relationship description text on FK lines (dblclick inline edit, FkModal label field, SVG export, MCP update_foreign_key label parameter)~~
- ~~**Canvas Search**: Ctrl+F / Ctrl+K → CommandPalette binding (table/column search + canvas navigation)~~
- ~~**Inline Column Add**: TableCard hover "+" button (max-height slide animation), click opens ColumnEditPopup immediately~~
- ~~**Table Templates**: 5 presets in Tools dropdown (users, audit_log, settings, files, tags), auto-avoids name conflicts~~
- ~~**Cross-Project Copy/Paste**: Ctrl+C selected tables JSON copy, Ctrl+V paste (full ID regeneration, FK remapping, UK/Index remapping, name conflict avoidance)~~
- ~~**Column Delete in Popup**: Added delete button to ColumnEditPopup~~
- ~~**Embed CommandPalette**: Ctrl+F/K canvas search supported in embed mode~~
- ~~**FK Popover**: FK line click shows info popover + label edit/FK edit/delete actions (replaces single-click-to-delete)~~
- ~~**Bulk Schema Change**: Bulk schema change for multi-selected tables (BulkEditModal schema dropdown)~~
- ~~**Shortcuts Panel Update**: Added Ctrl+F search, Ctrl+C/V copy/paste keyboard shortcuts~~
- 26 new tests (14 table-templates + 5 SVG FK label + 5 DDL FK label + 2 schema-diff FK label)
- Difficulty: Medium

### Phase 39 — Site Branding (Admin)
- ~~**Site Name**: Toolbar logo text + login page h1 + `<title>` tag + OG meta~~
- ~~**Logo URL**: Custom logo image URL (Toolbar + Login page)~~
- ~~**Login Message**: Message displayed below logo on login page~~
- ~~DB: `site_settings` key-value table (V014 migration)~~
- ~~Server: memory cache + instant refresh on update (no restart needed)~~
- ~~Admin UI: Branding tab~~
- ~~**Browser Title**: Dynamic `<title>` tag + `<meta description>` update~~
- ~~**Favicon Override**: Favicon replaced when logo_url is set~~
- ~~**Embed Branding**: Logo + site name displayed in embed header~~
- 11 new tests (site-settings CRUD + validation)
- Difficulty: Easy

### Phase 39b — FK Line Polish
- ~~**FK Line Visual**: stroke-linecap/linejoin round, thickness adjustment (1.6/2.4), crow's foot improved to V-shape~~
- ~~**FK Line Toggle**: canvasState.showRelationLines toggle (CanvasBottomBar icon button, localStorage save)~~
- ~~Marker spacing/sizing cleanup (tick 7px, circle r4.5, participation 15px offset)~~
- 13 new tests (canvas defaults + FK marker geometry)
- Difficulty: Easy

### Phase 39c — Admin UX Improvements
- ~~**API Key User Picker**: User search UI in Create API Key (search by name/username/email, role badges, dropdown)~~
- ~~**Embed Admin Tab**: Full project embed token management tab (list, URL copy, delete)~~
- ~~**Tab Counts**: Count badges on Embeds/Projects tabs (Branding/Backup/Audit excluded)~~
- 41 new tests (embed token CRUD + validation)
- Difficulty: Easy

### Phase 39d — Per-User Permissions & Admin i18n
- ~~**Per-User Permission Flags**: `can_create_project`, `can_create_api_key`, `can_create_embed` columns (V015 migration)~~
- ~~**Site-Wide Defaults**: 3 `default_can_create_*` keys in `site_settings`, managed in Branding tab~~
- ~~**requirePermission() Guard**: admin bypass, first project exception allowed~~
- ~~**Enforcement**: Permission checks on project create, API key create, embed token create endpoints~~
- ~~**OIDC/LDAP Integration**: Site default permissions applied on new user creation~~
- ~~**Admin UI**: Permission checkboxes on user edit, permission badges on user list~~
- ~~**Admin Full-Width Layout**: max-width removed, full-width layout~~
- ~~**Admin i18n**: ~156 new keys (ko/en/ja/zh), all admin tab components internationalized~~
- 10 new tests (getDefaultPermissions + requirePermission logic)
- Difficulty: Medium

### Phase 39e — Permission Hardening & Shared Project Bugfixes
- ~~**Stale Shared Project Pruning**: Auto-remove revoked shared projects (loadProjectSchema null detection → index pruning → switch to next project or no-project screen)~~
- ~~**ensureOwnerPermission Security Fix**: Prevent owner permission re-creation when saving shared project index (check schemas table existence)~~
- ~~**Empty Index + Permission Granted**: Auto-create default project when empty index + canCreateProject permission~~
- ~~**ReadOnly UI Enforcement**: Block write actions in viewer mode for Import, Undo/Redo, DomainModal, SnapshotPanel, HistoryPanel~~
- ~~**Permission-Based UI**: Hide/disable buttons when canCreateProject/canCreateApiKey/canCreateEmbed is false~~
- ~~**No-Project Screen**: Show minimal Toolbar + info screen for users with no projects~~
- ~~**Grid Zoom Scaling**: Grid line width gradually decreases with sqrt(scale) curve on zoom out~~
- ~~**DBML Export Quote Escaping**: Escape single quotes in default values~~
- 21 new tests (project-logic: pruning/migrate/ensureOwnerPermission guard)
- Difficulty: Medium

### Phase 40 — Code Refactoring (Utility Extraction & Deduplication)
- ~~**clipboard.ts**: copyToClipboard() shared utility — navigator.clipboard + textarea fallback (10+ file deduplication)~~
- ~~**ddl-options.ts**: DIALECT_OPTIONS + loadDdlOptions/saveDdlOptions shared (DdlModal, SchemaDiffModal deduplication)~~
- ~~**column-filter.ts**: getFilteredColumns/getFilteredColumnCount shared (Canvas, RelationLines, Minimap triple deduplication)~~
- ~~**canvas-persistence.ts**: restoreCanvasSettings + persist* functions extracted (6 $effect blocks cleaned up from +page.svelte)~~
- ~~**keyboard-shortcuts.ts**: handleKeydown 200-line pure function extracted (+page.svelte script reduced by 236 lines)~~
- ~~**sidebar-search.ts**: filterTables + tableHasAttr + getTableMeta extracted (Sidebar.svelte reduced by 92 lines)~~
- ~~**TableCard drag unification**: mouse/touch handlers → unified startDrag/continueDrag/endDrag (45 lines reduced)~~
- ~~**erd.svelte.ts helpers**: _t/_m/_d private lookup helpers (26+6+2=34 .find() pattern cleanups)~~
- 139 new tests (clipboard 7, keyboard-shortcuts 41, canvas-persistence 25, ddl-options 11, sidebar-search 45, column-filter 10)
- 0 errors, 2070 tests pass (53 test files)
- Difficulty: Medium

### Phase 41 — Security Hardening (4-Agent Audit)
- ~~**High — 5 UI readOnly guard fixes**~~
  - ~~TableCard: hide delete button + FK drag handle from viewers~~
  - ~~Sidebar: move bulk delete button inside readOnly guard, add memo delete guard~~
  - ~~SidebarTableRow: add readOnly guard for Duplicate/Delete actions~~
- ~~**Medium — 6 server/client security fixes**~~
  - ~~Embed password: GET query → POST body transition (prevent URL logging)~~
  - ~~Admin user create/update: role value validation (`admin`/`user` only)~~
  - ~~Content-Security-Policy header added (embed allows frame-ancestors *)~~
  - ~~Admin initial password: not logged when set via env, only shown when auto-generated~~
  - ~~ColumnEditPopup: readOnly guard + hide write buttons~~
- ~~**Low — 3 defense hardening items**~~
  - ~~Embed token delete IDOR: project_id scoping added~~
  - ~~logo_url: URL format validation added~~
  - ~~WebSocket presence: 4KB size limit added~~
- Audit results: Critical 0, High 0 (server API side), no SQL injection, all admin routes confirmed with requireAdmin()
- Difficulty: Medium

### Phase 42 — Comprehensive Security Audit (6-Agent)
- ~~**Critical — LDAP injection fix**: RFC 4515 escape for username in LDAP search filter (`ldap.ts`)~~
- ~~**High — WebSocket hardening**: top-level try-catch in handleMessage, JSON.parse protection for request-sync, projectId type validation (`collab-server.js`)~~
- ~~**Medium — Auth hardening (4 fixes)**~~
  - ~~Embed password rate limiting (10 attempts / 15 min)~~
  - ~~Session invalidation on password change + new session issuance~~
  - ~~Cookie maxAge linked to SESSION_MAX_AGE_DAYS (3 login routes)~~
  - ~~API key expiresAt date validation (3 routes)~~
- ~~**Medium — MCP hardening (3 fixes)**~~
  - ~~Snapshot count limit (max 50 per project)~~
  - ~~Numeric input bounds (length, scale, x, y, width, height)~~
  - ~~FK column ID existence validation~~
- ~~**Medium — Client-side fixes (2 fixes)**~~
  - ~~DDL import ReDoS fix: `[\s\S]*?` regex → paren depth tracking parser (ddl-import.ts, ddl-import-oracle.ts)~~
  - ~~logo_url validation: reject `data:` / `javascript:` protocols~~
- ~~**Low — DB & misc (5 fixes)**~~
  - ~~migrate.ts baseline V3 conditional logic fix~~
  - ~~V016 migration: sessions.user_id + project_permissions.user_id indexes~~
  - ~~MCP error message sanitization (filter SQLITE / node_modules details)~~
  - ~~User deletion: transfer groups.created_by to admin~~
  - ~~SESSION_MAX_AGE_DAYS exported from session.ts~~
- 11 new tests (LDAP escape 8, validateLogoUrl 8, baseline V3 1, ReDoS resilience 2) — minus overlap with existing
- 54 test files, 2092 tests total, svelte-check 0 errors
- Difficulty: Medium
