# erdmini — ERD 웹 애플리케이션 기획서

## 1. 프로젝트 개요

브라우저에서 ERD(Entity-Relationship Diagram)를 시각적으로 작성하고, DDL(Data Definition Language)을 import/export 할 수 있는 웹 애플리케이션.

**목표:** 설치 없이 브라우저에서 바로 쓸 수 있는 ERD 에디터. 서버 모드에서 인증, 팀 협업, MCP 연동까지 지원.

**기술 스택:** SvelteKit 2, Svelte 5 Runes, TypeScript, Tailwind CSS v4, d3-force

### 전체 시스템 아키텍처

```
  Local 모드 (기본)                Server 모드 (모놀리식 SvelteKit)
 ┌─────────────────┐            ┌──────────────────────────────┐
 │  erdmini SPA    │            │  erdmini (Node.js)            │
 │  (adapter-static)│            │  (adapter-node)               │
 │                 │            │                              │
 │  StorageProvider│            │  StorageProvider              │
 │  └─ IndexedDB   │            │  └─ fetch → API routes        │
 └─────────────────┘            │       ↓                      │
                                │  hooks.server.ts (인증)       │
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

## 2. 구현 진행 상황

### ✅ Phase 1 — 기본 편집기

- [x] 캔버스 렌더링 (HTML+CSS `transform` 기반, 줌/패닝)
- [x] 테이블 추가 / 삭제
- [x] 컬럼 추가 / 수정 / 삭제 (이름, 타입, PK/NN/UQ/AI)
- [x] 테이블 드래그 이동
- [x] 캔버스 줌 인/아웃 (마우스 휠, 커서 기준) / 패닝
- [x] IndexedDB 자동 저장 (탭 닫아도 ERD 유지)

### ✅ Phase 2 — 관계 및 DDL

- [x] FK 관계 설정 UI (TableEditor FK 섹션)
- [x] 관계선 렌더링 (SVG bezier + crow's foot 표기)
- [x] FK 라인 클릭으로 삭제
- [x] DDL Export — MySQL / PostgreSQL
- [x] DDL Import — node-sql-parser, 스키마 prefix 제거, ALTER TABLE FK 처리

### ✅ Phase 3 — 편의 기능 및 UX 개선

- [x] JSON Export / Import
- [x] DDL Import 시 COMMENT 파싱 → Table/Column comment 반영
- [x] 자동 배치 3종 (격자 / 계층 / 방사형 d3-force)
- [x] FK 추가 모달 (FkModal)
- [x] 컬럼 더블클릭 플로팅 편집 팝업 (ColumnEditPopup)
- [x] Ctrl/Cmd + 클릭 다중 선택 / 일괄 삭제
- [x] 컬럼 도메인 시스템 (재사용 템플릿, 수정 전파)
- [x] nullable FK 점선 / not null FK 실선
- [x] Docker 배포 (nginx SPA, adapter-static)

### ✅ Phase 4 — 고급 기능

- [x] 사이드바 (검색/정렬/그룹 뷰/접기)
- [x] DDL 4개 방언 (MySQL, PostgreSQL, MariaDB, MSSQL)
- [x] Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, 최대 50단계)
- [x] 미니맵 (클릭 네비게이션)
- [x] 이미지 내보내기 (PNG, SVG)
- [x] 테이블 복제
- [x] 컬럼 드래그 순서 변경
- [x] 복합 Unique Key / Index 관리 모달
- [x] 테이블/컬럼 코멘트, CHECK 제약조건
- [x] 테이블 컬러 (프리셋 팔레트) / 그룹
- [x] JSON Import/Export, URL 공유

### ✅ Phase 5 — 국제화

- [x] Paraglide i18n (한국어 / 영어 / 일본어 / 중국어)
- [x] ~270개 메시지 키

### ✅ Phase 6 — 테마

- [x] 4개 테마: Modern, Classic, Blueprint, Minimal
- [x] CSS 변수 기반 (캔버스 영역)
- [x] 다크 모드

### ✅ Phase 7 — 선택 & 인터랙션

- [x] Rubber band 선택 (좌클릭+드래그)
- [x] Ctrl+드래그 추가 선택
- [x] 다중 테이블 그룹 드래그 이동
- [x] Space+좌클릭+드래그 팬
- [x] 키보드 줌/팬 (+/-, 화살표)
- [x] Fit to Window
- [x] Command Palette (Ctrl+K)
- [x] localStorage 용량 경고 + 긴급 JSON 내보내기

### ✅ Phase 8 — 개선 작업

- [x] 프로젝트별 캔버스 위치 저장
- [x] Ctrl+A 전체 선택 / Ctrl+D 복제
- [x] 사이드바 컬럼명 검색
- [x] 그리드 스냅 (20px, 토글)
- [x] 정렬/분배 도구
- [x] FK 수정 모달
- [x] DDL Import 후 자동 레이아웃
- [x] ENUM 타입, DECIMAL precision/scale
- [x] 프로젝트 전체 백업/복원
- [x] 사이드바 너비 저장
- [x] 테이블 위치 잠금
- [x] Mermaid / PlantUML 내보내기
- [x] RelationLines 메모이제이션, 미니맵 렌더 스로틀

### ✅ Phase 9 — 듀얼 스토리지

- [x] StorageProvider 인터페이스 + Local/Server 구현체
- [x] `PUBLIC_STORAGE_MODE` 환경변수 (`local` / `server`)
- [x] 서버 모드: SvelteKit API + SQLite (better-sqlite3, WAL)
- [x] Docker 지원 (`Dockerfile.server`, `docker-compose.yml`)

### ✅ Phase 10 — 인증 시스템

- [x] 로컬 인증 (username/password, argon2 해싱)
- [x] 다중 OIDC 프로바이더 (Keycloak, Auth0, Google 등)
- [x] 관리자 UI (사용자 CRUD, OIDC 프로바이더 관리)
- [x] 세션 관리 (HttpOnly 쿠키, 30일 기본)
- [x] 초기 관리자 자동 생성 (`ADMIN_USERNAME`/`ADMIN_PASSWORD`)

### ✅ Phase 11 — 권한 관리

- [x] 프로젝트별 역할: owner / editor / viewer
- [x] 공유 UI (사용자 검색 → 권한 부여)
- [x] 읽기 전용 모드 (viewer 역할)

### ✅ Phase 12 — 실시간 협업

- [x] WebSocket 기반 실시간 동기화
- [x] 다른 사용자 커서 / 선택 표시 (presence)
- [x] LWW 충돌 해결
- [x] 연결 끊김 시 자동 재접속 + 스키마 동기화

### ✅ Phase 13 — 추가 도구

- [x] 스키마 검증/린팅 (8가지 규칙, LintPanel)
- [x] PDF 내보내기 (jsPDF + svg2pdf.js)
- [x] 테이블 일괄 편집 / 일괄 잠금·해제
- [x] DDL 내보내기 포맷 옵션 (들여쓰기, 따옴표, 키워드, 포함 항목)
- [x] 실행취소 히스토리 패널 (시각적 타임라인, 클릭 점프)
- [x] 컬럼 표시 모드 (전체 / PK&FK만 / 이름만)
- [x] 스키마 버전 비교 Diff (히스토리/파일 업로드, 색상 코딩)

### ✅ Phase 14 — MCP 서버

- [x] MCP (Model Context Protocol) Streamable HTTP 엔드포인트 (`/mcp`)
- [x] API Key 인증 (`erd_` prefix + SHA-256 해시, Admin UI에서 CRUD)
- [x] 14개 도구: list_projects, get_schema, export_ddl, lint_schema, export_diagram, add/update/delete table/column, add/delete foreign_key, import_ddl
- [x] `createMcpServer(db, keyInfo)` 팩토리 패턴
- [x] SvelteKit API route (`src/routes/mcp/+server.ts`), 별도 번들 불필요
- [x] Collab 서버 연동 (스키마 변경 시 WebSocket 알림)

---

## 3. 핵심 데이터 모델

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
  columnIds: string[];              // 복합 FK 지원
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

스키마는 `StorageProvider`를 통해 저장. Local 모드: IndexedDB, Server 모드: SQLite (API 경유).

---

## 4. 기술 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 캔버스 렌더링 | HTML+CSS `div` + `transform` | 테이블 카드를 DOM 요소로 직접 관리, 드래그/선택 구현 용이 |
| 관계선 렌더링 | SVG `position: absolute; overflow: visible` | Canvas world div 안에 배치, 좌표 계산 단순 |
| 상태 관리 | Svelte 5 Runes (`$state`, `.svelte.ts`) | 프레임워크 내장, 별도 라이브러리 불필요 |
| 자동 배치 | 격자·계층: 직접 구현 / 방사형: d3-force | 격자·계층은 단순 알고리즘으로 충분; 방사형은 force simulation이 자연스러운 클러스터링 제공 |
| DDL 파서 | node-sql-parser | MySQL/PG/MariaDB/MSSQL 방언 지원 |
| 스타일링 | Tailwind CSS v4 | 유틸리티 클래스, JIT |
| 배포 | Docker — 정적 SPA(nginx) 또는 서버 모드(Node.js + SQLite) | `PUBLIC_STORAGE_MODE`로 전환 |
| 인증 | 로컬 + OIDC | 표준 프로토콜, 다양한 IdP 지원 |
| 실시간 협업 | WebSocket (ws) + LWW | 양방향 통신, 낮은 레이턴시 |
| PDF 내보내기 | jsPDF + svg2pdf.js | 동적 임포트로 번들 크기 최소화 |
| MCP | @modelcontextprotocol/sdk + Streamable HTTP | SvelteKit route 통합, 별도 프로세스 불필요 |

---

## 5. 파일 구조

```
src/
├── lib/
│   ├── components/
│   │   ├── Canvas.svelte            뷰포트 변환 (zoom/pan), 테마 CSS 변수
│   │   ├── TableCard.svelte         드래그 가능한 테이블 카드, 컬럼 표시 모드
│   │   ├── ColumnEditPopup.svelte   컬럼 더블클릭 플로팅 편집 팝업
│   │   ├── TableEditor.svelte       우측 패널 — 테이블명/코멘트/컬럼 CRUD/FK 관리
│   │   ├── RelationLines.svelte     FK SVG 오버레이 (베지어 + crow's foot)
│   │   ├── Sidebar.svelte           테이블 목록, 다중 선택, 그룹, 검색
│   │   ├── Toolbar.svelte           로고, 새 테이블, DDL/도메인/자동배치/테마/언어 등
│   │   ├── Minimap.svelte           캔버스 미니맵
│   │   ├── DdlModal.svelte          Import/Export 탭 모달 + DDL 포맷 옵션
│   │   ├── DomainModal.svelte       도메인 관리 (표 형태)
│   │   ├── FkModal.svelte           FK 추가/수정 모달
│   │   ├── LintPanel.svelte         스키마 린트 결과 패널
│   │   ├── HistoryPanel.svelte      실행취소 히스토리 패널
│   │   ├── SchemaDiffModal.svelte   스키마 버전 비교 모달
│   │   ├── BulkEditModal.svelte     테이블 일괄 편집 모달
│   │   ├── CollabIndicator.svelte   실시간 협업 접속자 표시
│   │   ├── ShareProjectModal.svelte 프로젝트 공유 모달
│   │   └── DialogModal.svelte       확인/취소 다이얼로그
│   ├── server/
│   │   ├── db.ts                    SQLite (better-sqlite3) 모듈
│   │   ├── auth/api-key.ts          API 키 인증 (SHA-256 해시)
│   │   ├── collab-notify.ts         Collab 스키마 변경 알림
│   │   └── mcp/
│   │       ├── server.ts            MCP 서버 팩토리 (createMcpServer)
│   │       ├── db-helpers.ts        스키마/프로젝트 DB 헬퍼
│   │       └── schema-ops.ts        스키마 변환 순수 함수
│   ├── storage/
│   │   ├── types.ts                 StorageProvider 인터페이스
│   │   ├── local-storage-provider.ts  IndexedDB 구현체
│   │   ├── server-storage-provider.ts fetch 기반 서버 구현체
│   │   └── index.ts                 Provider 팩토리
│   ├── store/
│   │   ├── erd.svelte.ts            ERDStore + CanvasState ($state 기반)
│   │   ├── project.svelte.ts        ProjectStore (async, provider 위임)
│   │   ├── theme.svelte.ts          테마 스토어 (4종)
│   │   ├── language.svelte.ts       언어 스토어 (4개 언어)
│   │   ├── auth.svelte.ts           인증 스토어
│   │   ├── permission.svelte.ts     권한 스토어
│   │   ├── collab.svelte.ts         실시간 협업 스토어
│   │   └── dialog.svelte.ts         다이얼로그 스토어
│   ├── types/
│   │   └── erd.ts                   Column, Table, ERDSchema, ForeignKey 타입
│   └── utils/
│       ├── auto-layout.ts           grid / hierarchical / radial 알고리즘
│       ├── ddl-export.ts            4개 방언 DDL 생성 + 포맷 옵션
│       ├── ddl-import.ts            DDL 파싱 → ERDSchema
│       ├── schema-lint.ts           스키마 검증 (8가지 규칙)
│       ├── schema-diff.ts           스키마 버전 비교
│       ├── svg-export.ts            SVG 내보내기
│       ├── pdf-export.ts            PDF 내보내기
│       ├── diagram-export.ts        Mermaid / PlantUML 내보내기
│       └── url-share.ts             URL 공유 (압축/해제)
├── routes/
│   ├── api/storage/                 스키마/캔버스/프로젝트 CRUD API
│   ├── api/auth/                    인증 API (login, logout, OIDC)
│   ├── api/admin/                   관리자 API (사용자, OIDC 프로바이더, API 키)
│   ├── mcp/+server.ts               MCP Streamable HTTP 엔드포인트
│   ├── admin/+page.svelte           관리자 페이지
│   ├── login/+page.svelte           로그인 페이지
│   └── +page.svelte                 루트 페이지 — 전체 레이아웃 조합
├── collab-server.js                 WebSocket 협업 서버
└── messages/
    ├── ko.json, en.json, ja.json, zh.json
```

---

## 6. 관계선 표현

| 관계 | 표기 | 구현 |
|---|---|---|
| 1:N | 까마귀발 (N쪽) | SVG path + polyline |
| nullable FK | 점선 | `stroke-dasharray: 5 3` |
| not null FK | 실선 | 기본 stroke |

FK 라인은 테이블 이동 시 실시간 업데이트. 라인 클릭 시 삭제.

---

## 7. 서버 모드 아키텍처

SvelteKit 모놀리식 구조 — 별도 API 서버 없이 SvelteKit 내에서 인증, API, MCP를 모두 처리.

- `hooks.server.ts`에서 세션/API Key 인증 (HttpOnly 쿠키 + `x-api-key` 헤더)
- 로컬 인증 (username/password, argon2 해싱)
- 다중 OIDC Provider (Keycloak, Auth0, Google 등) 연동
- 인증 없이도 IndexedDB 모드로 동작 (게스트 모드 유지)
- 관리자 UI: 사용자 CRUD, OIDC 프로바이더, API Key 관리
- 프로젝트별 권한: owner / editor / viewer
- 실시간 협업: WebSocket, 접속자 커서, LWW 충돌 해결
- MCP: Streamable HTTP (`/mcp`), 14개 도구, Collab 연동

```
[브라우저] → [SvelteKit hooks.server.ts] → [OIDC Provider / 로컬 인증]
                     ↓ 세션 쿠키
             [SvelteKit API routes]
                     ↓
                [SQLite DB]
                     ↑
             [WebSocket (collab-server)]

[AI 도구] → [/mcp (Streamable HTTP)] → [API Key 인증]
                     ↓
             [MCP Server (14 tools)]
                     ↓
                [SQLite DB] → [Collab 알림]
```

---

## 8. 테스트

11개 테스트 파일, 247개 테스트 전체 통과.

| 파일 | 테스트 수 | 내용 |
|------|-----------|------|
| `auto-layout.test.ts` | 20 | 3종 레이아웃, 그룹별 배치 |
| `ddl-export.test.ts` | 53 | 4 dialect + 포맷 옵션 |
| `ddl-import.test.ts` | 48 | 4 dialect 파싱, FK/UQ/INDEX |
| `diagram-export.test.ts` | 19 | Mermaid + PlantUML |
| `svg-export.test.ts` | 12 | SVG 내보내기 |
| `schema-lint.test.ts` | 18 | 8가지 린트 규칙 |
| `schema-diff.test.ts` | 21 | 테이블/컬럼/FK/인덱스 비교 |
| 기타 | 56 | common, table-color, url-share |
