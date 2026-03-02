# erdmini — ERD 웹 애플리케이션 기획서

## 1. 프로젝트 개요

브라우저에서 ERD(Entity-Relationship Diagram)를 시각적으로 작성하고, DDL(Data Definition Language)을 import/export 할 수 있는 웹 애플리케이션.

**목표:** 설치 없이 브라우저에서 바로 쓸 수 있는 ERD 에디터. 추후 API 서버 연동, 팀 협업, OIDC 인증으로 확장.

**기술 스택:** SvelteKit 2, Svelte 5 Runes, TypeScript, Tailwind CSS v4, d3-force

### 전체 시스템 아키텍처

```
  Local 모드 (기본)                Server 모드 (모놀리식 SvelteKit)
 ┌─────────────────┐            ┌──────────────────────────┐
 │  erdmini SPA    │            │  erdmini (Node.js)        │
 │  (adapter-static)│            │  (adapter-node)           │
 │                 │            │                          │
 │  StorageProvider│            │  StorageProvider          │
 │  └─ IndexedDB   │            │  └─ fetch → API routes    │
 └─────────────────┘            │       ↓                  │
                                │  hooks.server.ts (인증)   │
                                │       ↓                  │
                                │  /api/storage/* (CRUD)    │
                                │       ↓                  │
                                │  SQLite (WAL)            │
                                └──────────────────────────┘
```

---

## 2. 구현 우선순위 및 진행 상황

### ✅ Phase 1 — 기본 편집기 (완료)

- [x] 캔버스 렌더링 (HTML+CSS `transform` 기반, 줌/패닝)
- [x] 테이블 추가 / 삭제
- [x] 컬럼 추가 / 수정 / 삭제 (이름, 타입, PK/NN/UQ/AI)
- [x] 테이블 드래그 이동
- [x] 캔버스 줌 인/아웃 (마우스 휠, 커서 기준) / 패닝
- [x] IndexedDB 자동 저장 (탭 닫아도 ERD 유지)

### ✅ Phase 2 — 관계 및 DDL (완료)

- [x] FK 관계 설정 UI (TableEditor FK 섹션)
- [x] 관계선 렌더링 (SVG bezier + crow's foot 표기)
- [x] FK 라인 클릭으로 삭제
- [x] DDL Export — MySQL / PostgreSQL (`CREATE TABLE`, `ALTER TABLE … FOREIGN KEY`)
- [x] DDL Import — 정규식 파싱, 스키마 prefix 제거, `ALTER TABLE FK` 처리

### ✅ Phase 3 — 편의 기능 및 UX 개선 (완료)

#### 데이터 / 저장
- [x] JSON Export / Import — ERD 스키마 전체를 `.erd.json` 파일로 저장/불러오기
- [x] DDL Import 시 `COMMENT` 절 파싱 → Table/Column comment 자동 반영

#### 자동 배치 (Auto Layout)
- [x] **격자(Grid)**: 알파벳 순 정렬, 정사각형 그리드
- [x] **계층(Hierarchical)**: FK 방향 기반 상하 트리 (BFS 레벨 배정, 사이클 처리)
- [x] **방사형(Radial)**: d3-force 시뮬레이션
  - `forceLink` — FK 연결 테이블 간 인력 (distance ≈ 230px)
  - `forceManyBody(-350)` — 반발력
  - `forceX/Y(0.08)` — 중심 인력 (비연결 테이블 이탈 방지)
  - `forceCollide` — 바운딩박스 기반 겹침 방지
  - 300틱 동기 시뮬레이션

#### FK 모달
- [x] FK 추가를 독립 모달(FkModal)로 분리 — 소스 컬럼, 참조 테이블/컬럼, ON DELETE/UPDATE 선택

#### 테이블 카드 UX
- [x] 테이블 코멘트 표시 (헤더 아래 별도 행)
- [x] 컬럼 PK(금) / FK(파랑) / UQ / AI 배지 표시
- [x] 컬럼 hover 툴팁 — 타입, Nullable, FK 참조 대상, 기본값, 코멘트
- [x] **컬럼 더블클릭 → 플로팅 팝업 편집** (ColumnEditPopup)
  - 이름, 타입, 길이, PK/NN/UQ/AI, 기본값, 코멘트 즉시 수정
  - 뷰포트 경계 자동 조정, Esc / 외부 클릭 닫기

#### 다중 선택 및 일괄 삭제
- [x] Ctrl/Cmd + 클릭으로 테이블 다중 선택 (카드 + 사이드바)
- [x] 2개 이상 선택 시 사이드바에 "선택 삭제(N)" 버튼 표시
- [x] 일괄 삭제 시 관련 FK 참조 전부 제거

#### 컬럼 도메인 (Domain)
- [x] 재사용 가능한 컬럼 속성 템플릿 정의
- [x] 도메인 → 컬럼 적용 시 타입·제약 조건 일괄 동기화
- [x] 도메인 수정 시 연결된 모든 컬럼에 즉시 반영
- [x] 컬럼 수동 편집 시 도메인 연결 자동 해제
- [x] DomainModal 표 형태 뷰 (이름/타입/길이/NULL/PK/UQ/AI/기본값/설명)

#### 관계선 스타일
- [x] nullable FK 컬럼: 점선 (`stroke-dasharray`)
- [x] not null FK 컬럼: 실선

#### 배포
- [x] Dockerfile — 멀티스테이지 빌드 (node:22-alpine 빌드 → nginx:alpine 서빙)
- [x] nginx SPA 설정 (`try_files`, 정적 자산 1년 캐시)
- [x] `@sveltejs/adapter-static` + `fallback: 'index.html'`

---

### Phase 7 — 개선 및 추가 기능 (검토 중)

#### A. 데이터 안전성 (높은 우선순위)

| # | 항목 | 문제 | 난이도 |
|---|------|------|--------|
| 1 | ~~**localStorage 용량 경고**~~ | ~~스키마가 커지면 5~10MB 한도 초과 시 데이터 무손실 유실~~ | ~~낮음~~ ✅ |
| 2 | ~~**도메인 삭제 경고**~~ | ~~도메인 삭제 시 연결된 컬럼이 있어도 경고 없이 삭제됨~~ | ~~낮음~~ ✅ |
| 3 | ~~**FK 삭제 경고**~~ | ~~컬럼 삭제 시 관련 FK가 자동 삭제되지만 사용자 알림 없음~~ | ~~낮음~~ ✅ |

#### B. UX 개선 (중간 우선순위)

| # | 항목 | 설명 | 난이도 |
|---|------|------|--------|
| 4 | ~~**Fit to Window**~~ | ~~모든 테이블이 보이도록 자동 줌/이동~~ | ~~낮음~~ ✅ |
| 5 | ~~**Command Palette (Cmd+K)**~~ | ~~테이블/컬럼 빠른 검색 및 이동~~ | ~~중간~~ ✅ |
| 6 | ~~**관계선 카디널리티 라벨**~~ | ~~crow's foot 위에 "1:1"/"1:N" 텍스트 라벨 표시~~ | ~~낮음~~ ✅ |
| 7 | ~~**테이블 추가/삭제 애니메이션**~~ | ~~카드 등장/사라짐 scale/fade 트랜지션~~ | ~~낮음~~ ✅ |
| 8 | ~~**키보드 줌/팬**~~ | ~~Arrow키 팬, +/-로 줌~~ | ~~낮음~~ ✅ |

#### C. 내보내기/가져오기 확장

| # | 항목 | 설명 | 난이도 |
|---|------|------|--------|
| 9 | ~~**SVG 내보내기**~~ | ~~html2canvas(PNG)는 래스터 — 벡터 SVG 추가~~ | ~~중간~~ ✅ |
| 10 | ~~**Mermaid/PlantUML 내보내기**~~ | ~~DDL모달에 포맷 선택 (DDL/Mermaid/PlantUML)~~ | ~~낮음~~ ✅ |
| 11 | ~~**DDL 임포트 에러 핸들링 강화**~~ | ~~파싱 실패 시 무손실 폴백, 타입 정규화 경고~~ | ~~중간~~ ✅ |

#### D. 성능 최적화

| # | 항목 | 설명 | 난이도 |
|---|------|------|--------|
| 12 | ~~**RelationLines 메모이제이션**~~ | ~~FK 경로 프리컴퓨팅 + $derived.by 캐시~~ | ~~낮음~~ ✅ |
| 13 | ~~**미니맵 렌더 스로틀**~~ | ~~rAF 기반 렌더 스로틀~~ | ~~낮음~~ ✅ |
| 14 | ~~**localStorage 저장 디바운스**~~ | ~~300ms 디바운스 적용~~ | ~~낮음~~ ✅ |

#### E. 기능 확장 (장기)

| # | 항목 | 설명 | 난이도 |
|---|------|------|--------|
| 15 | ~~**INDEX 정의 UI**~~ | ~~테이블별 인덱스 생성/편집~~ | ~~높음~~ ✅ |
| 16 | ~~**도메인 사용처 리포트**~~ | ~~DomainModal에 사용 카운트/미사용 표시~~ | ~~낮음~~ ✅ |
| 17 | ~~**CHECK 제약조건**~~ | ~~컬럼 레벨 제약조건 UI~~ | ~~중간~~ ✅ |
| 18 | ~~**URL 기반 스키마 공유**~~ | ~~deflate+base64url 압축, 공유 링크 생성, URL 해시로 로드~~ | ~~중간~~ ✅ |

---

### ✅ Phase 4 — 듀얼 스토리지 모드 (완료)

- [x] 스토리지 레이어 추상화 (`StorageProvider` 인터페이스 + Local/Server 구현체)
- [x] `PUBLIC_STORAGE_MODE` 환경변수로 `local`(기본) / `server` 모드 선택
- [x] 서버 모드: SvelteKit API + SQLite (better-sqlite3, WAL 모드)
- [x] `projectStore` 비동기화 (`async init(provider)`, 모든 I/O 메서드 async)
- [x] `svelte.config.js` 조건부 어댑터 (adapter-static / adapter-node)
- [x] Docker 지원 (`Dockerfile.server`, `docker-compose.yml`)
- [x] 정적 빌드(`pnpm build`) / 서버 빌드(`pnpm build:server`) 모두 정상 동작 확인

### ✅ Phase 5 — 인증 시스템 (완료)

- [x] 로컬 인증 (username/password)
- [x] 다중 OIDC 프로바이더 지원
- [x] 관리자 UI (사용자 CRUD, OIDC 프로바이더 관리)
- [x] 세션 관리 (HttpOnly 쿠키, 30일 기본)
- [x] 초기 관리자 자동 생성 (`ADMIN_USERNAME`/`ADMIN_PASSWORD`)

### ✅ Phase 6 — 권한 관리 (완료)

- [x] 프로젝트별 역할: owner / editor / viewer
- [x] 공유 UI (사용자 검색 → 권한 부여)
- [x] 읽기 전용 모드 (viewer 역할)

### ✅ Phase 7 — 실시간 협업 (완료)

- [x] WebSocket 기반 실시간 동기화
- [x] 다른 사용자 커서 / 선택 표시 (presence)
- [x] LWW 충돌 해결
- [x] 연결 끊김 시 자동 재접속 + 스키마 동기화

### ✅ Phase 8 — 추가 도구 (완료)

- [x] 스키마 검증/린팅 (8가지 규칙, LintPanel)
- [x] PDF 내보내기 (jsPDF + svg2pdf.js)
- [x] 테이블 일괄 편집 / 일괄 잠금·해제
- [x] DDL 내보내기 포맷 옵션 (들여쓰기, 따옴표, 키워드, 포함 항목)
- [x] 실행취소 히스토리 패널 (시각적 타임라인, 클릭 점프)
- [x] 컬럼 표시 모드 (전체 / PK&FK만 / 이름만)
- [x] 스키마 버전 비교 Diff (히스토리/파일 업로드, 색상 코딩)

### ✅ Phase 9 — MCP 서버 (완료)

- [x] MCP (Model Context Protocol) Streamable HTTP 엔드포인트 (`/mcp`)
- [x] API Key 인증 (`erd_` prefix + SHA-256 해시, Admin UI에서 CRUD)
- [x] 14개 도구: list_projects, get_schema, export_ddl, lint_schema, export_diagram, add/update/delete table/column, add/delete foreign_key, import_ddl
- [x] `createMcpServer(db, keyInfo)` 팩토리 패턴
- [x] SvelteKit API route (`src/routes/mcp/+server.ts`), 별도 번들 불필요

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
| DDL 파서 | node-sql-parser | MySQL/PG/MSSQL 방언 지원 |
| 스타일링 | Tailwind CSS v4 | 이미 설치됨, 유틸리티 클래스 |
| 배포 | Docker — 정적 SPA(nginx) 또는 서버 모드(Node.js + SQLite) | `PUBLIC_STORAGE_MODE`로 전환 |
| 인증 | 로컬 + OIDC | 표준 프로토콜, 다양한 IdP 지원 |
| 실시간 협업 | WebSocket (ws) + LWW | 양방향 통신, 낮은 레이턴시 |
| PDF 내보내기 | jsPDF + svg2pdf.js | 동적 임포트로 번들 크기 최소화 |

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

## 7. 인증 시스템 (구현 완료)

SvelteKit 모놀리식 구조 — 별도 API 서버 없이 SvelteKit 내에서 인증 처리.

- `hooks.server.ts`에서 세션 검증 (HttpOnly 쿠키 기반)
- 로컬 인증 (username/password, bcrypt 해싱)
- 다중 OIDC Provider (Keycloak, Auth0, Google 등) 연동
- 인증 없이도 IndexedDB 모드로 동작 (게스트 모드 유지)
- 관리자 UI: 사용자 CRUD, OIDC 프로바이더 관리
- 프로젝트별 권한: owner / editor / viewer
- 실시간 협업: WebSocket, 접속자 커서, LWW 충돌 해결

```
[브라우저] → [SvelteKit hooks.server.ts] → [OIDC Provider / 로컬 인증]
                     ↓ 세션 쿠키
             [SvelteKit API routes]
                     ↓
                [SQLite DB]
                     ↑
             [WebSocket (collab-server)]
```
