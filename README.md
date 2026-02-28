# erdmini

브라우저에서 동작하는 경량 ERD(Entity Relationship Diagram) 편집기.
SvelteKit + Svelte 5 Runes + Tailwind CSS v4로 제작. 서버 없이 localStorage에 스키마를 저장한다.

---

## 스택

| 분류 | 기술 |
|---|---|
| 프레임워크 | SvelteKit 2 + Svelte 5 (Runes) |
| 스타일 | Tailwind CSS v4 |
| 빌드 | Vite 7 |
| 언어 | TypeScript |
| 패키지 매니저 | pnpm |
| 레이아웃 라이브러리 | d3-force |
| 배포 | Docker + nginx (정적 SPA) |

---

## 기능

### 캔버스
- 마우스 휠 줌 (0.2× ~ 3×), 배경 드래그 패닝
- 테이블 카드 드래그 이동
- 줌 레벨 표시 + 리셋 버튼

### 테이블 관리
- 새 테이블 추가 (뷰포트 중심에 배치)
- 헤더 더블클릭으로 테이블명 인라인 편집
- 테이블 코멘트 표시 (카드 헤더 아래)
- **단일 선택**: 카드 / 사이드바 클릭
- **다중 선택**: Ctrl/Cmd + 클릭 (카드 및 사이드바 모두 지원)
- **일괄 삭제**: 2개 이상 선택 시 사이드바 헤더에 "선택 삭제(N)" 버튼 표시
  - 연결된 FK 참조도 함께 제거

### 컬럼 관리
- 오른쪽 TableEditor 패널에서 CRUD
- **카드 내 컬럼 더블클릭** → 플로팅 팝업에서 즉시 편집
  - 이름, 타입, 길이, PK / NN / UQ / AI, 기본값, 코멘트
  - 뷰포트 경계 자동 조정, Esc / 외부 클릭으로 닫기
- 컬럼 순서 위/아래 이동
- 카드에 PK(금색) / FK(파란색) / UQ / AI 배지 표시
- 컬럼 hover 시 상세 툴팁 (타입, nullable, FK 참조, 기본값, 코멘트)

### Foreign Key
- FK 추가 모달: 소스 컬럼 → 참조 테이블/컬럼, ON DELETE / ON UPDATE 액션 선택
- SVG 릴레이션 라인 (베지어 곡선 + 까마귀발 표기법)
- FK 라인 클릭으로 삭제
- 테이블/컬럼 삭제 시 관련 FK 자동 제거

### 도메인 관리
- 재사용 가능한 컬럼 속성 템플릿 정의
- **표 형태 뷰**: 이름 / 타입 / 길이 / NULL / PK / UQ / AI / 기본값 / 설명
- 편집 중인 행 파란색 강조
- 도메인을 컬럼에 적용하면 타입·제약 조건 일괄 동기화
- 도메인 수정 시 연결된 모든 컬럼에 즉시 반영
- 컬럼에서 수동 편집 시 도메인 연결 자동 해제

### DDL Import / Export
- **Export**: MySQL / PostgreSQL DDL 생성
  - `CREATE TABLE`, `PRIMARY KEY`, `UNIQUE`, `AUTO_INCREMENT` / `SERIAL`, `COMMENT`
  - `FOREIGN KEY (ON DELETE / ON UPDATE)`
- **Import**: DDL 파싱 → 테이블/컬럼 자동 생성
  - 컬럼 타입·길이, 제약 조건, `COMMENT`, `FOREIGN KEY` 인식

### 자동 배치 (Auto Layout)
세 가지 알고리즘 선택 가능 (툴바 드롭다운):

| 종류 | 설명 |
|---|---|
| **격자** | 알파벳 순 정렬, 정사각형 그리드 배치 |
| **계층** | FK 방향 기반 상하 계층, 부모 테이블 위에 배치 |
| **방사형** | d3-force 시뮬레이션 — FK 연결 테이블 군집, 반발력+중력으로 균형 배치 |

방사형 배치 force 구성:

| Force | 역할 |
|---|---|
| `forceLink(distance: 230)` | FK 연결 테이블 간 인력 |
| `forceManyBody(−350)` | 테이블 간 반발력 |
| `forceX/Y(strength: 0.08)` | 중심 방향 인력 — 연결 없는 테이블 이탈 방지 |
| `forceCollide(반지름)` | 바운딩박스 기반 겹침 방지 |

300틱 동기 시뮬레이션 후 위치 확정.

---

## 데이터 모델

```
ERDSchema
├── tables: Table[]
│   ├── id, name, comment
│   ├── position: { x, y }             ← 캔버스 월드 좌표
│   ├── columns: Column[]
│   │   ├── id, name, type, length
│   │   ├── nullable, primaryKey, unique, autoIncrement
│   │   ├── defaultValue, comment
│   │   └── domainId?                  ← 도메인 연결
│   └── foreignKeys: ForeignKey[]
│       ├── columnId → referencedTableId.referencedColumnId
│       └── onDelete, onUpdate         ← CASCADE | SET NULL | RESTRICT | NO ACTION
└── domains: ColumnDomain[]
    └── (Column과 동일한 속성, id + name 추가)
```

스키마는 `localStorage['erdmini_schema']`에 JSON으로 자동 저장.

---

## 파일 구조

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
│   │   └── erd.svelte.ts            ERDStore + CanvasState ($state 기반 반응형)
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

## 개발 환경

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # build/ 에 정적 파일 출력
pnpm check      # svelte-check 타입 검사
```

---

## Docker 배포

nginx 기반 정적 SPA 서빙.

```bash
# 이미지 빌드
docker build -t erdmini .

# 실행
docker run -p 8080:80 erdmini
```

**Dockerfile 구성**:
1. `node:22-alpine` — pnpm 설치 → 의존성 설치 → `pnpm build`
2. `nginx:alpine` — `build/` 정적 파일 복사 → `nginx.conf` 적용

`nginx.conf`: `try_files $uri $uri/ /index.html` SPA 라우팅 폴백 + 정적 자산 1년 캐시.

`svelte.config.js`: `@sveltejs/adapter-static` + `fallback: 'index.html'` 으로 정적 파일 출력.
