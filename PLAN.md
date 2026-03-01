# erdmini — ERD 웹 애플리케이션 기획서

## 1. 프로젝트 개요

브라우저에서 ERD(Entity-Relationship Diagram)를 시각적으로 작성하고, DDL(Data Definition Language)을 import/export 할 수 있는 웹 애플리케이션.

**목표:** 설치 없이 브라우저에서 바로 쓸 수 있는 ERD 에디터. 추후 API 서버 연동, 팀 협업, OIDC 인증으로 확장.

**기술 스택:** SvelteKit 2, Svelte 5 Runes, TypeScript, Tailwind CSS v4, d3-force

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

## 2. 구현 우선순위 및 진행 상황

### ✅ Phase 1 — 기본 편집기 (완료)

- [x] 캔버스 렌더링 (HTML+CSS `transform` 기반, 줌/패닝)
- [x] 테이블 추가 / 삭제
- [x] 컬럼 추가 / 수정 / 삭제 (이름, 타입, PK/NN/UQ/AI)
- [x] 테이블 드래그 이동
- [x] 캔버스 줌 인/아웃 (마우스 휠, 커서 기준) / 패닝
- [x] LocalStorage 자동 저장 (탭 닫아도 ERD 유지)

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

### Phase 4 — API 서버 연동 (별도 프로젝트)

- [ ] 스토리지 레이어 추상화 (LocalStorage → API 교체 가능)
- [ ] 프로젝트 개념 도입 (여러 ERD를 프로젝트 단위로 관리)
- [ ] API 서버 연동 (프로젝트 CRUD)
- [ ] OIDC 인증 연동 (로그인 / 로그아웃 / 토큰 갱신)
- [ ] 프로젝트 목록 페이지 (`/projects`)
- [ ] 인증 없는 경우 LocalStorage 모드 폴백

### Phase 5 — 실시간 협업

- [ ] WebSocket 기반 실시간 동기화
- [ ] 다른 사용자 커서 / 선택 표시
- [ ] 동시 편집 충돌 해결 (CRDT 또는 OT)
- [ ] 멤버 초대 / 권한 관리 (owner / editor / viewer)
- [ ] 변경 이력 (History) 조회

---

## 3. 핵심 데이터 모델

```typescript
interface Column {
  id: string;
  name: string;
  domainId?: string;        // 도메인 연결
  type: ColumnType;
  length?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
}

interface ForeignKey {
  id: string;
  columnId: string;
  referencedTableId: string;
  referencedColumnId: string;
  onDelete: ReferentialAction;   // CASCADE | SET NULL | RESTRICT | NO ACTION
  onUpdate: ReferentialAction;
}

interface Table {
  id: string;
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  position: { x: number; y: number };
  comment?: string;
}

interface ColumnDomain {
  id: string;
  name: string;
  // Column과 동일한 속성 (type, length, nullable, primaryKey, unique, autoIncrement, defaultValue, comment)
}

interface ERDSchema {
  version: string;
  tables: Table[];
  domains: ColumnDomain[];
  createdAt: string;
  updatedAt: string;
}
```

스키마는 `localStorage['erdmini_schema']`에 JSON으로 자동 저장.

---

## 4. 기술 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 캔버스 렌더링 | HTML+CSS `div` + `transform` | 테이블 카드를 DOM 요소로 직접 관리, 드래그/선택 구현 용이 |
| 관계선 렌더링 | SVG `position: absolute; overflow: visible` | Canvas world div 안에 배치, 좌표 계산 단순 |
| 상태 관리 | Svelte 5 Runes (`$state`, `.svelte.ts`) | 프레임워크 내장, 별도 라이브러리 불필요 |
| 자동 배치 | 격자·계층: 직접 구현 / 방사형: d3-force | 격자·계층은 단순 알고리즘으로 충분; 방사형은 force simulation이 자연스러운 클러스터링 제공 |
| DDL 파서 | 직접 구현 (정규식 기반) | 의존성 최소화, 경량 |
| 스타일링 | Tailwind CSS v4 | 이미 설치됨, 유틸리티 클래스 |
| 배포 | Docker + nginx (정적 SPA) | 서버리스, 별도 런타임 불필요 |
| 인증 (미래) | OIDC | 표준 프로토콜, 다양한 IdP 지원 |
| 실시간 협업 (미래) | WebSocket | 양방향 통신, 낮은 레이턴시 |

---

## 5. 파일 구조

```
src/
├── lib/
│   ├── components/
│   │   ├── Canvas.svelte            뷰포트 변환 (zoom/pan), 배경 클릭 선택 해제
│   │   ├── TableCard.svelte         드래그 가능한 테이블 카드, 컬럼 목록, 툴팁
│   │   ├── ColumnEditPopup.svelte   컬럼 더블클릭 플로팅 편집 팝업
│   │   ├── TableEditor.svelte       우측 패널 — 테이블명/코멘트/컬럼 CRUD/FK 관리
│   │   ├── RelationLines.svelte     FK SVG 오버레이 (베지어 + 까마귀발)
│   │   ├── Sidebar.svelte           테이블 목록, 다중 선택, 일괄 삭제
│   │   ├── Toolbar.svelte           로고, 새 테이블, DDL/도메인/자동배치 버튼
│   │   ├── DdlModal.svelte          Import/Export 탭 모달
│   │   ├── DomainModal.svelte       도메인 관리 (표 형태)
│   │   └── FkModal.svelte           FK 추가 모달
│   ├── store/
│   │   └── erd.svelte.ts            ERDStore + CanvasState ($state 기반)
│   ├── types/
│   │   └── erd.ts                   Column, Table, ERDSchema, ForeignKey 타입
│   └── utils/
│       ├── auto-layout.ts           grid / hierarchical / radial(d3-force) 알고리즘
│       ├── ddl-export.ts            MySQL / PostgreSQL DDL 생성
│       └── ddl-import.ts            DDL 파싱 → ERDSchema
└── routes/
    └── +page.svelte                 루트 페이지 — 전체 레이아웃 조합
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

## 7. OIDC 인증 연동 (미래 고려사항)

- SvelteKit `hooks.server.ts`에서 세션 검증
- OIDC Provider (Keycloak, Auth0, Google 등) 연동
- 인증 없이도 LocalStorage 모드로 동작 (게스트 모드 유지)
- Access Token을 API 요청 헤더에 자동 첨부 (`Authorization: Bearer …`)
- Refresh Token 자동 갱신

```
[사용자] → [SvelteKit] → [OIDC Provider] → 토큰 발급
               ↓
          [API 서버] ← Authorization: Bearer <token>
```
