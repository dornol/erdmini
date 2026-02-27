# erdmini - ERD 웹 애플리케이션 기획서

## 1. 프로젝트 개요

브라우저에서 ERD(Entity-Relationship Diagram)를 시각적으로 작성하고, DDL(Data Definition Language)을 import/export 할 수 있는 웹 애플리케이션.

**목표:** 설치 없이 브라우저에서 바로 쓸 수 있는 ERD 에디터. 추후 API 서버 연동, 팀 협업, OIDC 인증으로 확장.

**기술 스택:** SvelteKit, TypeScript, Tailwind CSS v4

### 전체 시스템 아키텍처 (로드맵 포함)

```
                    현재 (Phase 1~3)            미래 (Phase 4~5)
                   ┌────────────────┐          ┌────────────────┐
                   │  erdmini       │          │  erdmini       │
                   │  (Frontend)    │◀────────▶│  (Frontend)    │
                   │                │   REST/  │                │
                   │  LocalStorage  │   WS     │  ┌──────────┐  │
                   └────────────────┘          │  │ API 서버  │  │
                                               │  │ (별도     │  │
                                               │  │  프로젝트)│  │
                                               │  └────┬─────┘  │
                                               │       │        │
                                               │  ┌────▼─────┐  │
                                               │  │   DB     │  │
                                               │  └──────────┘  │
                                               │                │
                                               │  OIDC Provider │
                                               │  (Auth)        │
                                               └────────────────┘
```

---

## 2. 핵심 기능

### 2.1 ERD 편집 (Canvas)
- 테이블(엔티티) 추가 / 수정 / 삭제
- 컬럼 추가 / 수정 / 삭제 (이름, 타입, 제약조건)
- 테이블 간 관계선 그리기 (FK 연결)
- 테이블 드래그로 위치 이동
- 캔버스 줌 인/아웃, 패닝(pan)
- 다중 선택 및 일괄 이동

### 2.2 DDL Export
- 현재 ERD를 SQL DDL 문으로 변환 (CREATE TABLE)
- 지원 방언(dialect): MySQL, PostgreSQL
- 클립보드 복사 또는 `.sql` 파일 다운로드

### 2.3 DDL Import
- SQL DDL 텍스트를 붙여넣거나 `.sql` 파일 업로드
- 파싱 후 ERD 캔버스에 자동 배치
- 지원 방언: MySQL, PostgreSQL

### 2.4 프로젝트 저장/불러오기
- ERD 상태를 JSON으로 로컬 파일 저장 / 불러오기
- 브라우저 LocalStorage 자동 저장 (세션 유지)
- (미래) API 서버에 프로젝트 저장 / 불러오기

---

## 3. 화면 구성 (레이아웃)

```
┌─────────────────────────────────────────────────────────┐
│  Toolbar  [New Table] [Import DDL] [Export DDL] [Save]  │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Sidebar  │              Canvas (ERD 편집 영역)           │
│          │                                              │
│ - 테이블  │   ┌─────────┐        ┌─────────┐            │
│   목록    │   │  users  │───────▶│ orders  │            │
│          │   ├─────────┤        ├─────────┤            │
│          │   │ id (PK) │        │ id (PK) │            │
│          │   │ name    │        │ user_id │            │
│          │   │ email   │        │ amount  │            │
│          │   └─────────┘        └─────────┘            │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│  Status bar: 테이블 수 / 컬럼 수 / zoom 레벨             │
└─────────────────────────────────────────────────────────┘
```

### 3.1 Toolbar
- **New Table**: 새 테이블 캔버스 중앙에 추가
- **Import DDL**: DDL import 모달 열기
- **Export DDL**: DDL export 모달 열기 (dialect 선택)
- **Save / Load**: JSON 저장 및 불러오기

### 3.2 Sidebar (테이블 목록)
- 전체 테이블 리스트 표시
- 클릭 시 해당 테이블로 캔버스 포커스 이동
- 테이블 삭제 버튼

### 3.3 Canvas (메인 편집 영역)
- SVG 또는 HTML+CSS 기반 ERD 렌더링
- 테이블 카드: 헤더(테이블명) + 컬럼 목록
- 관계선: FK 연결 시 테이블 간 선 표시
- 마우스 휠: 줌, 클릭+드래그(빈 영역): 패닝

### 3.4 Table Detail Panel (우클릭 또는 더블클릭 시 표시)
- 테이블명 편집
- 컬럼 편집 (이름, 타입, PK/NN/UQ/AI 제약조건)
- 컬럼 순서 변경 (드래그)
- FK 설정 (참조 테이블 / 컬럼 선택)

### 3.5 Import/Export 모달
- **Import**: 텍스트 입력창 + 파일 업로드 버튼, dialect 선택
- **Export**: dialect 선택 후 DDL 텍스트 표시, 복사/다운로드 버튼

---

## 4. 데이터 모델

### ERD 내부 상태 (TypeScript 타입)

```typescript
type ColumnType =
  | 'INT' | 'BIGINT' | 'SMALLINT' | 'TINYINT'
  | 'VARCHAR' | 'CHAR' | 'TEXT' | 'LONGTEXT'
  | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'TIMESTAMP'
  | 'DECIMAL' | 'FLOAT' | 'DOUBLE'
  | 'JSON' | 'UUID';

interface Column {
  id: string;
  name: string;
  type: ColumnType;
  length?: number;       // VARCHAR(255) 등
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
}

interface ForeignKey {
  id: string;
  columnId: string;          // 이 테이블의 컬럼
  refTableId: string;        // 참조 테이블
  refColumnId: string;       // 참조 컬럼
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

interface Table {
  id: string;
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  position: { x: number; y: number };
  comment?: string;
}

// Phase 3: 컬럼 도메인 (재사용 가능한 컬럼 타입 프리셋)
interface ColumnDomain {
  id: string;
  name: string;          // 예: 'PK_BIGINT', 'CREATED_AT', 'USER_ID'
  type: ColumnType;
  length?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
}

interface ERDSchema {
  version: string;
  tables: Table[];
  domains: ColumnDomain[];  // Phase 3 추가
  createdAt: string;
  updatedAt: string;
}

// 미래: API 서버 연동 시 추가될 타입
interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: ProjectMember[];
  schema: ERDSchema;
  createdAt: string;
  updatedAt: string;
}

interface ProjectMember {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
}
```

---

## 5. DDL 변환 규칙

### Export (ERD → DDL)

```sql
-- MySQL 예시
CREATE TABLE `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`)
) COMMENT='사용자 테이블';

ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_user_id`
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;
```

- FK는 CREATE TABLE 이후 ALTER TABLE로 분리 생성 (순환 참조 방지)
- dialect에 따라 backtick(MySQL) / double-quote(PostgreSQL) 사용

### Import (DDL → ERD)

- `CREATE TABLE` 구문 파싱하여 테이블/컬럼 추출
- `PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `DEFAULT` 제약조건 인식
- `FOREIGN KEY ... REFERENCES` 파싱하여 관계 자동 연결
- 파싱 실패 시 에러 메시지와 함께 부분 결과 표시

---

## 6. 관계선 표현

| 관계 유형 | 표기 |
|-----------|------|
| 1:1       | `──────` (양쪽 단선) |
| 1:N       | `──────<` (N쪽 까마귀 발) |
| N:M       | `>──────<` (양쪽 까마귀 발) |

- FK가 정의된 컬럼 ↔ 참조 컬럼 사이에 선 렌더링
- 선은 테이블 이동 시 실시간 업데이트
- 선 클릭 시 관계 정보 표시 및 삭제 가능

---

## 7. 구현 우선순위

### ✅ Phase 1 - 기본 편집기 (완료)
- [x] 캔버스 렌더링 (테이블 카드, HTML+CSS transform)
- [x] 테이블 추가 / 삭제
- [x] 컬럼 추가 / 수정 / 삭제 (이름, 타입, PK/NN/UQ/AI)
- [x] 테이블 드래그 이동
- [x] 캔버스 줌 / 패닝

### ✅ Phase 2 - 관계 및 DDL (완료)
- [x] FK 관계 설정 UI (TableEditor 내 FK 섹션)
- [x] 관계선 렌더링 (SVG bezier + crow's foot 표기)
- [x] DDL Export (MySQL / PostgreSQL)
- [x] DDL Import (정규식 파싱, 스키마 prefix 제거, ALTER TABLE FK 처리)

### Phase 3 - 편의 기능 및 UX 개선
- [ ] **JSON Export / Import** — ERD 스키마 전체를 `.erd.json` 파일로 저장/불러오기 (Toolbar에 버튼 추가)
- [ ] **테이블 자동 배치 (Auto Arrange)** — 버튼 클릭 시 레이아웃 자동 정렬. 형태 선택 가능:
  - Grid (격자형): 테이블을 균등 격자로 배치
  - Hierarchical (계층형): FK 참조 방향 기준 상→하 트리 배치
  - Radial (방사형): 중심 테이블 기준 원형 배치
- [ ] **FK 추가 UI 개선** — TableEditor의 인라인 폼을 레이어 팝업(모달)으로 교체. 더 넓은 화면에서 편집 가능하도록
- [ ] **관계선 nullable 표시** — FK 컬럼의 nullable 여부를 선 스타일로 구분
  - nullable: 점선(`stroke-dasharray`)
  - not null: 실선
- [ ] **컬럼 / 테이블 코멘트** — Column.comment, Table.comment 편집 UI 추가. DDL export 시 `COMMENT` 절 포함
- [ ] **컬럼 도메인(Domain) 정의** — 재사용 가능한 컬럼 타입 프리셋 정의 기능
  - 도메인: 이름 + 타입 + 기본 제약조건 조합 (예: `PK_BIGINT`, `CREATED_AT`, `USER_ID`)
  - 컬럼 추가 시 도메인 선택 → 자동 채우기
  - 도메인 정의는 ERDSchema에 포함되어 JSON export/import 시 함께 저장
- [ ] **Dockerfile 추가** — 빌드 및 배포용 Dockerfile (Node 빌더 + nginx 서빙 멀티스테이지)
- [ ] LocalStorage 자동 저장 (탭 닫아도 ERD 유지)

### Phase 4 - API 서버 연동 (별도 프로젝트)
- [ ] 스토리지 레이어 추상화 (LocalStorage → API 교체 가능하도록)
- [ ] 프로젝트 개념 도입 (여러 ERD를 프로젝트 단위로 관리)
- [ ] API 서버 연동 (프로젝트 CRUD)
- [ ] OIDC 인증 연동 (로그인 / 로그아웃 / 토큰 갱신)
- [ ] 프로젝트 목록 페이지 (`/projects`)
- [ ] 인증이 없는 경우 LocalStorage 모드로 폴백

### Phase 5 - 실시간 협업
- [ ] WebSocket 기반 실시간 동기화
- [ ] 다른 사용자 커서 / 선택 표시
- [ ] 동시 편집 충돌 해결 (CRDT 또는 OT)
- [ ] 멤버 초대 / 권한 관리 (owner / editor / viewer)
- [ ] 변경 이력 (History) 조회

---

## 8. 기술 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 캔버스 렌더링 | SVG | 관계선 그리기에 적합, 확대/축소 자연스러움 |
| 상태 관리 | Svelte 5 Runes (`$state`) | 프레임워크 내장, 별도 라이브러리 불필요 |
| DDL 파서 | 직접 구현 (정규식 기반) | 의존성 최소화, 경량 |
| 스타일링 | Tailwind CSS v4 | 이미 설치됨 |
| 파일 포맷 | JSON (`.erd.json`) | 사람이 읽기 쉽고 버전 관리 친화적 |
| 스토리지 레이어 | 인터페이스로 추상화 | LocalStorage / API 서버 교체 용이 |
| 인증 | OIDC (미래) | 표준 프로토콜, 다양한 IdP 지원 |
| 실시간 협업 | WebSocket (미래) | 양방향 통신, 낮은 레이턴시 |

### 스토리지 레이어 추상화 (현재부터 고려)

Phase 4 전환 비용을 최소화하기 위해, 처음부터 스토리지를 인터페이스로 분리한다.

```typescript
interface StorageAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  loadProject(id: string): Promise<ERDSchema>;
  saveProject(id: string, schema: ERDSchema): Promise<void>;
  deleteProject(id: string): Promise<void>;
}

// Phase 1~3: LocalStorage 구현체
class LocalStorageAdapter implements StorageAdapter { ... }

// Phase 4: API 서버 구현체 (나중에 추가)
class ApiStorageAdapter implements StorageAdapter { ... }
```

---

## 9. 파일 구조 (예상)

```
src/
├── lib/
│   ├── types/
│   │   ├── erd.ts               # ERD 타입 정의 (Table, Column, FK 등)
│   │   └── project.ts           # Project, ProjectMember 타입 (미래)
│   ├── storage/
│   │   ├── adapter.ts           # StorageAdapter 인터페이스
│   │   ├── local.ts             # LocalStorageAdapter 구현체
│   │   └── api.ts               # ApiStorageAdapter 구현체 (미래)
│   ├── store/
│   │   └── erd.svelte.ts        # ERD 전역 상태 (Svelte runes)
│   ├── utils/
│   │   ├── ddl-export.ts        # ERD → DDL 변환
│   │   ├── ddl-import.ts        # DDL → ERD 파싱
│   │   └── layout.ts            # 자동 배치 알고리즘
│   └── components/
│       ├── Canvas.svelte         # 메인 캔버스
│       ├── TableCard.svelte      # 테이블 카드 컴포넌트
│       ├── RelationLine.svelte   # 관계선 SVG
│       ├── Sidebar.svelte        # 테이블 목록 사이드바
│       ├── Toolbar.svelte        # 상단 툴바
│       ├── TableEditor.svelte    # 테이블/컬럼 편집 패널
│       ├── ImportModal.svelte    # DDL import 모달
│       └── ExportModal.svelte    # DDL export 모달
└── routes/
    ├── +layout.svelte            # 공통 레이아웃 (미래: 인증 상태 처리)
    ├── +page.svelte              # ERD 편집 메인 페이지
    └── projects/                 # (미래) 프로젝트 목록
        └── +page.svelte
```

---

## 10. OIDC 인증 연동 (미래 고려사항)

- SvelteKit의 `hooks.server.ts`에서 세션 검증
- OIDC Provider (예: Keycloak, Auth0, Google) 연동
- 인증 없이도 LocalStorage 모드로 동작 가능하게 유지 (게스트 모드)
- Access Token을 API 요청 헤더에 자동 첨부 (`Authorization: Bearer ...`)
- Refresh Token 자동 갱신 처리

```
[사용자] → [SvelteKit] → [OIDC Provider] → 토큰 발급
                ↓
           [API 서버] ← Authorization: Bearer <token>
```
