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
- MCP 서버(61 tools)가 이미 구현되어 있으므로, AI 클라이언트(Claude 등)가 `add_table`, `add_column`, `add_foreign_key` 등을 직접 호출하여 스키마 생성 가능
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

### ~~32. ORM / Framework Schema Import~~ — Won't Do (Rails/Django/TypeORM)
- ORM 및 프레임워크 스키마 파일에서 직접 ERD 생성
- ~~**Prisma** (`schema.prisma`): model, @id, @relation, @unique, enum 파싱~~ ✅ (Import + Export 구현 완료)
- ~~**Rails** (`schema.rb`)~~ — Won't Do: DDL 7방언 + DBML + Prisma import로 충분. 사용층 겹침 낮음
- ~~**Django** (`models.py`)~~ — Won't Do: 동일 사유
- ~~**TypeORM / Sequelize** (TypeScript)~~ — Won't Do: 동일 사유

### ~~33. SQL Playground (Browser SQLite via WASM)~~ ✅
- ~~브라우저에서 SQLite WASM(`sql.js`)으로 현재 스키마를 실제 DB로 생성하고 SQL 쿼리 실행~~
- ~~**스키마 동기화**: 현재 ERD → `exportDDL(schema, 'sqlite')` → CREATE TABLE 자동 실행~~
- ~~**SQL 에디터**: 쿼리 입력 → 실행 → 결과 테이블 표시 (SELECT, INSERT, UPDATE, DELETE)~~
- ~~**더미 데이터 자동 생성**: 컬럼 타입 기반 값 생성, FK 위상 정렬 순 INSERT, 테이블당 N행 조절~~
- ~~**구현**: `sql.js` WASM lazy load, `SqlPlaygroundModal.svelte`, `dummy-data.ts` (위상 정렬 + 타입별 더미값 + INSERT 생성)~~
- ~~Toolbar > Tools > SQL Playground, 쿼리 히스토리 (localStorage, max 20), Ctrl/Cmd+Enter 실행~~
- ~~70 tests (unit + integration: E-commerce, Blog, HR, edge cases)~~
- Difficulty: Medium

### ~~34. Migration SQL Generation (Schema Diff → DDL)~~ ✅
- ~~기존 `schema-diff.ts`의 `SchemaDiff` 결과를 dialect별 `ALTER TABLE` DDL로 변환~~
- ~~`generateMigrationSQL(diff: SchemaDiff, dialect: Dialect, options?, currTables?): string`~~
- ~~**지원 명령**: CREATE/DROP TABLE, RENAME TABLE, ADD/DROP/ALTER COLUMN, ADD/DROP FK/INDEX/UNIQUE KEY~~
- ~~**dialect별 차이 처리**: MySQL MODIFY COLUMN, PG ALTER COLUMN TYPE/SET/DROP, SQLite recreate-table, Oracle MODIFY, MSSQL ALTER COLUMN~~
- ~~**SchemaDiffModal 통합**: dialect 드롭다운 + "Export Migration SQL" 버튼 + SQL 미리보기 + 복사/다운로드~~
- ~~71 tests (unit + dialect + integration)~~
- Difficulty: Large

### ~~35. DDL Export 품질 개선 (Minor Gaps)~~ ✅
- ~~**PostgreSQL ENUM**: `CREATE TYPE ... AS ENUM(...)` 생성 (현재 VARCHAR 폴백)~~
- ~~**PostgreSQL SMALLSERIAL**: `SMALLINT + autoIncrement` → `SMALLSERIAL` 매핑~~
- ~~**Schema Diff 누락 항목**: UniqueKey 변경, enumValues 변경 비교 추가~~
- ~~**MSSQL schema-qualified comments**: `sp_addextendedproperty`에서 `dbo` 하드코딩 → 실제 스키마명 사용~~
- ~~**Import normalizeType**: `DATETIME` → 내부 `DATETIME` 유지 (현재 `TIMESTAMP`로 통일됨)~~
- ~~**Import SMALLSERIAL**: `SMALLSERIAL` → `SMALLINT` + autoIncrement 매핑 추가~~
- Difficulty: Medium

### ~~36. UX Improvements (Phase 38)~~ ✅
- ~~**FK Labels**: `ForeignKey.label?: string` — FK 라인에 관계 설명 텍스트 표시 (dblclick 인라인 편집, FkModal 라벨 필드, SVG export, MCP update_foreign_key label 파라미터)~~
- ~~**Canvas Search**: Ctrl+F / Ctrl+K → CommandPalette 바인딩 (테이블/컬럼 검색 + 캔버스 네비게이션)~~
- ~~**Inline Column Add**: TableCard hover 시 "+" 버튼 (max-height 슬라이드 애니메이션), 클릭 시 즉시 ColumnEditPopup 열림~~
- ~~**Table Templates**: Tools 드롭다운에 5개 프리셋 (users, audit_log, settings, files, tags), 이름 충돌 자동 회피~~
- ~~**Cross-Project Copy/Paste**: Ctrl+C 선택 테이블 JSON 복사, Ctrl+V 붙여넣기 (ID 전체 재생성, FK 재매핑, UK/Index 재매핑, 이름 충돌 회피)~~
- ~~**Column Delete in Popup**: ColumnEditPopup에 🗑 삭제 버튼 추가~~
- ~~**Embed CommandPalette**: 임베드 모드에서도 Ctrl+F/K 캔버스 검색 지원~~
- ~~**FK Popover**: FK 라인 클릭 시 정보 팝오버 + 라벨 편집/FK 편집/삭제 액션 (기존 single-click-to-delete 대체)~~
- ~~**Bulk Schema Change**: 멀티선택 테이블의 스키마 일괄 변경 (BulkEditModal 스키마 드롭다운)~~
- ~~**Shortcuts Panel Update**: Ctrl+F 검색, Ctrl+C/V 복사/붙여넣기 키보드 단축키 추가~~
- 26 new tests (14 table-templates + 5 SVG FK label + 5 DDL FK label + 2 schema-diff FK label)
- Difficulty: Medium

### Phase 39 — Site Branding (Admin)
- ~~**Site Name**: 툴바 로고 텍스트 + 로그인 페이지 h1 + `<title>` 태그 + OG meta~~
- ~~**Logo URL**: 커스텀 로고 이미지 URL (Toolbar + Login 페이지)~~
- ~~**Login Message**: 로그인 페이지 로고 아래 안내 메시지~~
- ~~DB: `site_settings` key-value 테이블 (V014 migration)~~
- ~~서버: 메모리 캐시 + 수정 시 즉시 갱신 (재시작 불필요)~~
- ~~Admin UI: Branding 탭~~
- ~~**Browser Title**: `<title>` 태그 + `<meta description>` 동적 반영~~
- ~~**Favicon Override**: logo_url 설정 시 favicon도 교체~~
- ~~**Embed Branding**: 임베드 헤더에 로고 + 사이트명 표시~~
- 11 new tests (site-settings CRUD + validation)
- Difficulty: Easy

### Phase 39b — FK Line Polish
- ~~**FK Line Visual**: stroke-linecap/linejoin round, 두께 조정 (1.6/2.4), crow's foot V자형으로 개선~~
- ~~**FK Line Toggle**: canvasState.showRelationLines 토글 (CanvasBottomBar 아이콘 버튼, localStorage 저장)~~
- ~~마커 간격/크기 정리 (tick 7px, circle r4.5, participation 15px offset)~~
- 13 new tests (canvas defaults + FK marker geometry)
- Difficulty: Easy

### Phase 39c — Admin UX Improvements
- ~~**API Key User Picker**: Create API Key에서 사용자 검색 UI (이름/유저네임/이메일 검색, 역할 배지, 드롭다운)~~
- ~~**Embed Admin Tab**: 전체 프로젝트 임베드 토큰 관리 탭 (목록, URL 복사, 삭제)~~
- ~~**Tab Counts**: Embeds/Projects 탭에 개수 표시 (Branding/Backup/Audit 제외)~~
- 41 new tests (embed token CRUD + validation)
- Difficulty: Easy

### Phase 39d — Per-User Permissions & Admin i18n
- ~~**Per-User Permission Flags**: `can_create_project`, `can_create_api_key`, `can_create_embed` 컬럼 (V015 migration)~~
- ~~**Site-Wide Defaults**: `site_settings`에 `default_can_create_*` 키 3개, Branding 탭에서 관리~~
- ~~**requirePermission() Guard**: admin 바이패스, 첫 프로젝트 예외 허용~~
- ~~**Enforcement**: 프로젝트 생성, API 키 발급, 임베드 토큰 생성 엔드포인트에 권한 체크~~
- ~~**OIDC/LDAP Integration**: 신규 사용자 생성 시 site default 권한 적용~~
- ~~**Admin UI**: 사용자 편집 시 권한 체크박스, 사용자 목록에 권한 배지~~
- ~~**Admin Full-Width Layout**: max-width 제거, 전체 너비 레이아웃~~
- ~~**Admin i18n**: ~156개 새 키 (ko/en/ja/zh), 모든 관리자 탭 컴포넌트 국제화~~
- 10 new tests (getDefaultPermissions + requirePermission logic)
- Difficulty: Medium
