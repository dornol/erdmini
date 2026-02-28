# erdmini

브라우저에서 동작하는 경량 ERD(Entity Relationship Diagram) 편집기.
SvelteKit + Svelte 5 Runes + Tailwind CSS v4로 제작. 서버 없이 localStorage에 스키마를 저장한다.

> 이 프로젝트는 [Claude Code](https://claude.ai/claude-code) (Anthropic CLI)를 활용하여 개발되었습니다.

---

## 스택

| 분류 | 기술 |
|---|---|
| 프레임워크 | SvelteKit 2 + Svelte 5 (Runes) |
| 스타일 | Tailwind CSS v4 |
| 빌드 | Vite 7 |
| 언어 | TypeScript |
| 패키지 매니저 | pnpm |
| i18n | Paraglide JS v2 (KO / EN) |
| 레이아웃 라이브러리 | d3-force |
| 배포 | Docker + nginx (정적 SPA) |

---

## 기능

### 캔버스
- 마우스 휠 줌 (0.2× ~ 3×)
- 배경 좌클릭 드래그 / **우클릭 드래그** 패닝
- 테이블 카드 드래그 이동
- 미니맵 (클릭으로 뷰포트 이동)
- Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, 최대 50단계)
- 이미지 내보내기 (PNG)

### 테마
4가지 캔버스 테마 지원 (툴바에서 전환):

| 테마 | 설명 |
|---|---|
| **Modern** | 둥근 모서리, 부드러운 그림자, 다크 헤더 (기본) |
| **Classic** | 각진 모서리, 종이 톤, 고전 ERD 느낌 |
| **Blueprint** | 직각, 얇은 윤곽선, 설계도 스타일 |
| **Minimal** | 약간 둥근, 최소 그림자, 깔끔한 라이트 톤 |

### 다국어 (i18n)
- 한국어 / English 전환 (툴바 토글)
- Paraglide JS v2 기반, localStorage에 언어 설정 저장

### 테이블 관리
- 새 테이블 추가 (뷰포트 중심에 배치)
- 헤더 더블클릭으로 테이블명 인라인 편집
- 테이블 코멘트 표시 (카드 헤더 아래)
- 테이블 복제
- **단일 선택**: 카드 / 사이드바 클릭
- **다중 선택**: Ctrl/Cmd + 클릭 (카드 및 사이드바 모두 지원)
- **일괄 삭제**: 2개 이상 선택 시 사이드바 헤더에 "선택 삭제(N)" 버튼 표시
  - 연결된 FK 참조도 함께 제거

### 컬럼 관리
- 오른쪽 TableEditor 패널에서 CRUD
- **카드 내 컬럼 더블클릭** → 플로팅 팝업에서 즉시 편집
  - 이름, 타입, 길이, PK / NN / UQ / AI, 기본값, 코멘트
  - 뷰포트 경계 자동 조정, Esc / 외부 클릭으로 닫기
- 컬럼 드래그 순서 변경
- 카드에 PK(금색) / FK(파란색) / UQ / AI 배지 표시
- 컬럼 hover 시 상세 툴팁 (타입, nullable, FK 참조, 기본값, 코멘트)

### Foreign Key
- FK 추가 모달: 소스 컬럼 → 참조 테이블/컬럼, ON DELETE / ON UPDATE 액션 선택
- **Crow's Foot Notation** 릴레이션 라인
  - 표준 마커 순서: 테이블 쪽 cardinality (`|` / crow's foot) → 선 쪽 participation (`|` / `O`)
  - nullable FK 대시 라인 + optional circle, mandatory tick 구분
  - 1:1 (unique FK) / 1:N 자동 판별
  - 수직 배치 테이블은 같은 쪽 C-곡선 라우팅
- FK 라인 hover 시 양쪽 컬럼 하이라이트
- PK / FK 컬럼 hover 시 관련 라인 + 상대 컬럼 하이라이트 (다중 FK 지원)
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
- **4개 방언 지원**: MySQL / PostgreSQL / MariaDB / MSSQL
- **Export**: DDL 생성
  - `CREATE TABLE`, `PRIMARY KEY`, `UNIQUE`, `AUTO_INCREMENT` / `SERIAL`, `COMMENT`
  - `FOREIGN KEY (ON DELETE / ON UPDATE)`
- **Import**: DDL 파싱 → 테이블/컬럼 자동 생성
  - 컬럼 타입·길이, 제약 조건, `COMMENT`, `FOREIGN KEY` 인식

### 사이드바
- 테이블 목록 검색 (이름 필터)
- 정렬 (이름순 / 생성순)
- 접기 / 펼치기
- 테이블 정보 요약 (컬럼 수, FK 수)

### 자동 배치 (Auto Layout)
세 가지 알고리즘 선택 가능 (툴바 드롭다운):

| 종류 | 설명 |
|---|---|
| **격자** | 알파벳 순 정렬, 정사각형 그리드 배치 |
| **계층** | FK 방향 기반 상하 계층, 부모 테이블 위에 배치 |
| **방사형** | d3-force 시뮬레이션 — FK 연결 테이블 군집, 반발력+중력으로 균형 배치 |

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
│   │   ├── Canvas.svelte            뷰포트 변환 (zoom/pan), 테마 CSS 변수
│   │   ├── TableCard.svelte         드래그 가능한 테이블 카드, 컬럼 목록, 툴팁
│   │   ├── ColumnEditPopup.svelte   컬럼 더블클릭 플로팅 편집 팝업
│   │   ├── TableEditor.svelte       우측 패널 — 테이블명/코멘트/컬럼 CRUD/FK 관리
│   │   ├── RelationLines.svelte     FK SVG 오버레이 (Crow's Foot Notation)
│   │   ├── Sidebar.svelte           테이블 목록, 검색/정렬, 다중 선택, 일괄 삭제
│   │   ├── Toolbar.svelte           로고, 새 테이블, DDL/도메인/자동배치/테마/언어
│   │   ├── Minimap.svelte           캔버스 미니맵
│   │   ├── CanvasHistory.svelte     Undo/Redo 버튼
│   │   ├── DdlModal.svelte          Import/Export 탭 모달
│   │   ├── DomainModal.svelte       도메인 관리 (표 형태)
│   │   ├── FkModal.svelte           FK 추가 모달
│   │   └── DialogModal.svelte       확인/취소 다이얼로그
│   ├── store/
│   │   ├── erd.svelte.ts            ERDStore + CanvasState ($state 기반 반응형)
│   │   ├── theme.svelte.ts          테마 스토어 (4종, localStorage)
│   │   ├── language.svelte.ts       언어 스토어 (KO/EN, localStorage)
│   │   └── dialog.svelte.ts         다이얼로그 스토어
│   ├── types/
│   │   └── erd.ts                   Column, Table, ERDSchema, ForeignKey 타입
│   └── utils/
│       ├── auto-layout.ts           grid / hierarchical / radial(d3-force) 알고리즘
│       ├── ddl-export.ts            MySQL / PostgreSQL / MariaDB / MSSQL DDL 생성
│       └── ddl-import.ts            DDL 파싱 → ERDSchema
├── routes/
│   ├── +layout.svelte               i18n 키 래퍼
│   └── +page.svelte                 루트 페이지 — 전체 레이아웃 조합
└── messages/
    ├── ko.json                      한국어 메시지
    └── en.json                      영어 메시지
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
