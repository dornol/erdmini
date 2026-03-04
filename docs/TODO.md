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
- ~~8 rules: missing PK, missing FK target, SET NULL + NOT NULL, duplicate columns / tables / indexes, circular FK, empty table~~
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

### 17. Accessibility (A11y) Improvements
- ARIA labels, keyboard navigation, screen reader support
- Difficulty: Large

### ~~18. FK Line Type Selection~~ ✅
- ~~Allow users to choose FK line rendering style: curved (current bezier), straight, orthogonal (right-angle)~~
- ~~Add `lineType` setting to canvasState~~
- ~~Line type switcher in Toolbar or settings~~
- ~~Difficulty: Medium~~

### 19. Memo-Table Attachment
- Drag & drop a memo onto a table to attach it
- Attached memo shows as a small icon on the table header
- Hover icon to display memo content tooltip
- Memo moves with the table; drop on empty space to detach
- Add `attachedTableId` field to Memo type
- Difficulty: Medium

### ~~20. API Key Permission Edit & Usage Tracking~~ ✅
- ~~Allow permission changes after API key creation (API + Admin UI)~~
- ~~Add `last_used_at` column to `api_keys` table (migration)~~
- ~~Update `last_used_at` on each API key authentication~~
- ~~Display last used timestamp in Admin API Keys UI~~
- ~~Difficulty: Small~~

### 21. Admin Page Enhancements
- Project management: member list per project, owner transfer, project delete/archive
- Users tab: display auth provider (local / OIDC) per user with icon or label
- Full backup & restore: SQLite `.backup` API snapshot → zip download, zip upload → validate & restore
- Admin UI "Backup & Restore" tab
- Difficulty: Large

### ~~22. cross-env for Windows Compatibility~~ ✅
- ~~Add `cross-env` package for cross-platform env var support in npm scripts~~
- ~~Apply to `PUBLIC_STORAGE_MODE=server` and other env-dependent scripts~~
- ~~Difficulty: Small~~

---

## Large-Scale Improvements

### 23. Audit Trail Logging
- Log key activities in server mode: schema changes, MCP operations, admin settings, API key issuance, user registration/login
- Design log storage format (DB table + query API + Admin UI)
- Difficulty: Large

### 24. DDL Dialect Expansion (Oracle, H2, SQLite)
- Oracle: NUMBER, VARCHAR2, CLOB type mappings
- H2: MySQL-compatible mode considerations
- SQLite: INTEGER, TEXT, REAL simple type system
- Extend Dialect type, update ddl-export.ts / ddl-import.ts / MCP dialect options
- Add tests per dialect
- Difficulty: Large

---

## Long-Term Vision

### 25. AI Schema Generation
- Automatically generate a schema from a natural language description (e.g., "Create a blog system")
- Requires LLM integration
- Difficulty: Large

### 26. Live DB Connection & Reverse Engineering
- Connect to a live database and automatically extract the schema
- Currently only DDL text import is supported
- Difficulty: Large

### 27. Schema Snapshots / Branching
- Create named snapshots and switch between schema variants after experimentation (like git branches)
- Difficulty: Large

### 28. Schema Namespace (Multi-Schema per Project)
- Add `schema` field to tables (e.g., `public`, `auth`, `billing`)
- Schema tab bar at the top of the canvas to switch between schemas
- Each schema tab renders only its own tables and FK lines
- Per-schema canvas viewport state, minimap, selection, auto-layout
- DDL export: `CREATE SCHEMA` + schema-qualified table names (`auth.users`)
- Primarily useful for PostgreSQL multi-schema projects
- Difficulty: Medium
