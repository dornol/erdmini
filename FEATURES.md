# erdmini — Feature List

## Phase 1: Core Features
- Canvas (HTML div + CSS transform, infinite scroll)
- Table CRUD (add / edit / delete)
- Column CRUD (add / edit / delete, 16 data types)
- Table drag-to-move
- Mouse wheel zoom / right-click drag pan

## Phase 2: FK & DDL
- FK management UI (add / delete inside TableEditor, modal)
- Relationship line SVG overlay (Bezier curves + crow's foot notation)
- Relationship line click-to-delete
- DDL Import / Export (node-sql-parser based)
- FK drag-to-create (column right-handle → target column)

## Phase 3: Convenience Features
- Domain system (reusable column type presets with propagation)
- Ctrl+click multi-select / bulk delete
- Column double-click popup edit (ColumnEditPopup)
- Radial auto-layout (d3-force)

## Phase 4: Advanced Features
- Sidebar (search / sort / group view / table info badges / collapse)
- DDL in 4 dialects (MySQL, PostgreSQL, MariaDB, MSSQL)
- Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, up to 50 steps, labeled history)
- Minimap (click-to-navigate)
- Image export (PNG, SVG)
- Table duplication
- Column drag-to-reorder
- Composite Unique Key / Index management (modal)
- Table comments, column comments
- Column CHECK constraints
- Table color (preset palette)
- Table groups (text + datalist)
- 3 auto-layout modes (grid / hierarchical / radial)
- JSON Import / Export
- URL sharing (schema compressed → URL hash, includes project name)

## Phase 5: Internationalization
- Paraglide i18n (Korean / English / Japanese / Chinese)
- ~270 message keys

## Phase 6: Themes
- 4 themes: Modern (default), Classic (sepia), Blueprint (blueprint), Minimal (grayscale)
- CSS variable-based (applied to canvas area only)
- Dark mode (CSS custom properties, applied across Toolbar / Sidebar / modals)

## Phase 7: Selection & Interaction
- Rubber band selection (left-click + drag → select tables within area)
- Ctrl+drag to add to selection (preserves existing selection)
- Multi-table group drag-to-move
- Space + left-click + drag pan
- Escape to cancel marquee (restores previous selection)

## Phase 8: Improvements
- Per-project canvas position persistence (x / y / scale retained on project switch)
- Ctrl+A select all / Ctrl+D duplicate shortcuts
- DDL Import i18n (localized error messages)
- Sidebar column name search (unified table name + column name search)
- Grid snap (20px grid, Toolbar toggle)
- Align and distribute tools (left / center / right / top / middle / bottom align, horizontal / vertical even distribution)
- FK edit modal (change columns / references of existing FKs)
- Auto-layout after DDL Import (FK relationships → hierarchical layout, fallback to grid)
- ENUM type support (value list management, DDL export / import)
- DECIMAL precision / scale split (separate precision + scale fields)
- Full project backup / restore (bulk JSON export / import across all projects)
- Project metadata display (modified date / table count in dropdown)
- Sidebar width persistence
- Table position lock (drag prevention, lock icon indicator)

## Phase 9: Dual Storage
- Storage mode switch: IndexedDB (default) / Server + SQLite
- Mode selected via `PUBLIC_STORAGE_MODE` environment variable
- Server mode: SvelteKit API routes + SQLite (better-sqlite3, WAL)
- Docker support (Dockerfile.server + docker-compose.yml)

## Phase 10: Authentication
- Local authentication (username / password) + multiple OIDC providers
- Server mode only (no authentication in local mode)
- Admin UI (user CRUD, OIDC provider management)
- Session management (HttpOnly cookie, 30-day default)

## Phase 11: Permission Management
- Per-project roles: owner / editor / viewer
- Sharing UI (user search → permission grant)
- Read-only mode (viewer role)

## Phase 12: Real-Time Collaboration
- WebSocket-based real-time synchronization
- LWW (Last-Writer-Wins) conflict resolution
- Connected user cursor display (presence)
- Auto-reconnect on disconnect + schema sync

## Phase 13: Additional Tools
- Schema validation / linting (8 rules, LintPanel, click-to-navigate to table)
- PDF export (jsPDF + svg2pdf.js)
- Bulk table edit (multi-select → bulk update color, group, comment)
- Bulk table lock / unlock
- DDL export format options (indentation, quoting, keyword casing, included elements)
- Undo history panel (visual timeline, click-to-jump)
- Column display mode (all / PK & FK only / name only)
- Schema version diff comparison (history or file upload, color-coded)

## Phase 14: MCP Server
- MCP (Model Context Protocol) Streamable HTTP endpoint (`/mcp`)
- Integrated as a SvelteKit API route (no separate build or process required)
- `Authorization: Bearer` token authentication (`erd_` prefix API Key, SHA-256 hash, generated and managed in Admin UI)
- 14 tools: list_projects, get_schema, export_ddl, lint_schema, export_diagram, add / update / delete table / column, add / delete foreign_key, import_ddl
- Integration with AI assistants such as Claude Desktop, Claude Code, and Cursor

## Future Improvement Candidates
- FK line smart routing (overlap prevention, obstacle avoidance, self-referencing loops)
- Sidebar virtual scroll (support for 1000+ tables)

## Other Features
- Multi-project management (create / rename / duplicate / delete / switch)
- IndexedDB auto-save (300ms debounce)
- Storage quota exceeded warning + emergency JSON export
- Legacy data migration
- Command palette (Ctrl+K, table / column search)
- Keyboard shortcuts reference panel (? button)
- Column hover tooltip (type, nullable, badges, comment)
- FK hover highlights related columns
- Keyboard zoom (+/- keys) / arrow key pan
- Diagram export (Mermaid, PlantUML)
