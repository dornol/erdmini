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

### ~~17. Accessibility (A11y) Improvements~~ — Won't Do
- ~~ARIA labels, keyboard navigation, screen reader support~~
- Skipped: ERD 편집기는 캔버스 기반 시각적 도구로 완전한 스크린 리더 지원이 비현실적. 모달/드롭다운/커맨드 팔레트 등 실용적 접근성은 이미 구현됨.

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
- ~~ddl-import.ts 방언별 모듈 분리 (ddl-import-mssql.ts, ddl-import-oracle.ts, ddl-import-types.ts)~~
- ~~Difficulty: Large~~

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

### ~~27. Schema Snapshots~~ ✅
- ~~Named snapshots: save current schema state, list/restore/delete, diff comparison~~
- ~~Storage: IndexedDB (local mode), SQLite (server mode), REST API, MCP tools~~
- ~~Branching (병행 편집) excluded — snapshots only~~

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
- ~~읽기 전용 다이어그램 뷰를 iframe으로 외부 사이트에 삽입~~
- ~~`/embed/[token]` 라우트: 캔버스 + 테이블 + FK 라인 + 메모 + SchemaTabBar 렌더링 (Toolbar/Sidebar/Editor 제거)~~
- ~~줌/패닝만 가능, 편집 불가 (permissionStore → viewer)~~
- ~~서버 모드 전용: 토큰 기반 접근 + 선택적 비밀번호 보호 (argon2) + 만료일 설정~~
- ~~EmbedModal: 토큰 생성/삭제, URL/iframe 코드 복사~~
- ~~embed_tokens SQLite 테이블 (V009 마이그레이션), hooks.server.ts X-Frame-Options 조건부 해제~~
- ~~프로젝트 삭제 시 embed 토큰 cascade 삭제~~
- Difficulty: Medium

### 31. DBML Import / Export
- [DBML (Database Markup Language)](https://dbml.dbdiagram.io/) 포맷 지원
- **Import**: DBML 텍스트 → ERDSchema 변환 파서
  - Table, Column (타입, PK, unique, not null, default, note), Ref (1-1, 1-n, n-n), Enum, TableGroup, indexes
  - DdlModal의 Import 탭에 DBML 포맷 옵션 추가
- **Export**: ERDSchema → DBML 텍스트 생성
  - DdlModal의 Export 탭에 DBML 포맷 옵션 추가
  - 도메인 → Enum 매핑, 그룹 → TableGroup 매핑
- `src/lib/utils/dbml-import.ts`, `src/lib/utils/dbml-export.ts` 신규 모듈
- dbdiagram.io 사용자 마이그레이션 경로 제공
- Difficulty: Large

### 32. ORM / Framework Schema Import
- ORM 및 프레임워크 스키마 파일에서 직접 ERD 생성
- ~~**Prisma** (`schema.prisma`): model, @id, @relation, @unique, enum 파싱~~ ✅ (Import + Export 구현 완료)
- **Rails** (`schema.rb`): create_table, t.string/integer/references, add_index, add_foreign_key 파싱
- **Django** (`models.py`): class Model, CharField, ForeignKey, ManyToManyField, Meta.unique_together 파싱
- **TypeORM / Sequelize** (TypeScript): @Entity, @Column, @ManyToOne, @JoinColumn 데코레이터 파싱
- DdlModal의 Import 탭에 포맷 선택 드롭다운 추가 (DDL / DBML / Prisma / Rails / Django)
- 각 포맷별 `src/lib/utils/orm-import-{format}.ts` 모듈
- Difficulty: Large
