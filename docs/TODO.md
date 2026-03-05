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

### ~~25. AI Schema Generation~~ ✅ (MCP로 대체)
- ~~Automatically generate a schema from a natural language description (e.g., "Create a blog system")~~
- MCP 서버(48 tools)가 이미 구현되어 있으므로, AI 클라이언트(Claude 등)가 `add_table`, `add_column`, `add_foreign_key` 등을 직접 호출하여 스키마 생성 가능
- 별도 LLM 연동 기능 불필요 — MCP 인프라가 이 역할을 수행

### ~~26. Live DB Connection & Reverse Engineering~~ — Won't Do
- ~~Connect to a live database and automatically extract the schema~~
- 제외 사유: erdmini의 "mini" 철학에 맞지 않음. DB 크레덴셜 관리 보안 부담, DB 드라이버 의존성으로 번들 사이즈 증가. DDL/Prisma/DBML import로 역공학 경로 이미 충분.

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

### ~~31. DBML Import / Export~~ ✅
- ~~[DBML (Database Markup Language)](https://dbml.dbdiagram.io/) 포맷 지원~~ ✅ (Import + Export 구현 완료)
- ~~**Import**: DBML 텍스트 → ERDSchema 변환 파서~~ ✅
- ~~**Export**: ERDSchema → DBML 텍스트 생성~~ ✅
- `src/lib/utils/dbml-import.ts`, `src/lib/utils/dbml-export.ts`, DdlModal 통합, MCP 도구 (export_dbml, import_dbml)
- 89 tests (53 import + 36 export)

### 32. ORM / Framework Schema Import
- ORM 및 프레임워크 스키마 파일에서 직접 ERD 생성
- ~~**Prisma** (`schema.prisma`): model, @id, @relation, @unique, enum 파싱~~ ✅ (Import + Export 구현 완료)
- **Rails** (`schema.rb`): create_table, t.string/integer/references, add_index, add_foreign_key 파싱
- **Django** (`models.py`): class Model, CharField, ForeignKey, ManyToManyField, Meta.unique_together 파싱
- **TypeORM / Sequelize** (TypeScript): @Entity, @Column, @ManyToOne, @JoinColumn 데코레이터 파싱
- DdlModal의 Import 탭에 포맷 선택 드롭다운 추가 (DDL / DBML / Prisma / Rails / Django)
- 각 포맷별 `src/lib/utils/orm-import-{format}.ts` 모듈
- Difficulty: Large

### 33. SQL Playground (Browser SQLite via WASM)
- 브라우저에서 SQLite WASM(`sql.js`)으로 현재 스키마를 실제 DB로 생성하고 SQL 쿼리 실행
- **스키마 동기화**: 현재 ERD → `exportDDL(schema, 'sqlite')` → CREATE TABLE 자동 실행
- **SQL 에디터**: 쿼리 입력 → 실행 → 결과 테이블 표시 (SELECT, INSERT, UPDATE, DELETE)
- **더미 데이터 자동 생성**:
  - 컬럼 타입 기반: INT→시퀀스, VARCHAR→`'{colName}_1'`, BOOLEAN→랜덤, DATE→최근 30일, DECIMAL→범위 내 소수, ENUM→enumValues 랜덤, UUID→랜덤
  - FK 의존 순서: 위상 정렬로 부모 테이블 먼저 INSERT → 자식에서 부모 ID 참조
  - 테이블당 N행 (기본 5~10행, 사용자 조절 가능)
  - "Generate Sample Data" 버튼 → INSERT문 자동 생성 및 실행
- **활용 시나리오**:
  - 스키마 설계 검증 (DDL이 실제로 동작하는지 확인)
  - FK 제약 조건 테스트 (PRAGMA foreign_keys = ON)
  - 더미 데이터로 JOIN/집계 쿼리 프로토타이핑
  - NOT NULL / UNIQUE 제약 조건 동작 확인
- **구현 방향**:
  - `sql.js` WASM (~1MB) lazy load (Playground 열 때만 로드)
  - Toolbar > Tools 드롭다운에 "SQL Playground" 메뉴 추가
  - 스키마 변경 시 DB 재생성 (Reset 버튼) 또는 ALTER 반영
  - 쿼리 히스토리 (최근 N개 localStorage 저장)
  - 에러 메시지 친절하게 표시 (SQLite 에러 → 한글/영문)
  - `src/lib/utils/dummy-data.ts` — 타입별 더미 값 생성 + FK 위상 정렬 INSERT
- Difficulty: Medium
