# erdmini

브라우저에서 동작하는 경량 ERD(Entity Relationship Diagram) 편집기.
SvelteKit + Svelte 5 Runes + Tailwind CSS v4로 제작.
로컬 모드(localStorage)와 서버 모드(SQLite + 인증 + 실시간 협업)를 모두 지원한다.

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
| i18n | Paraglide JS v2 (KO / EN / JA / ZH) |
| 레이아웃 라이브러리 | d3-force |
| DB (서버 모드) | SQLite (better-sqlite3, WAL) |
| 실시간 | WebSocket (ws) |
| 배포 | Docker (정적 SPA / Node.js 서버) |

---

## 기능

### 캔버스
- 마우스 휠 줌 (0.2× ~ 3×)
- 배경 좌클릭 드래그 / **우클릭 드래그** / **Space+드래그** 패닝
- 테이블 카드 드래그 이동 (그리드 스냅 옵션)
- 미니맵 (클릭으로 뷰포트 이동)
- Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, 최대 50단계)
- 히스토리 패널 (시각적 타임라인, 클릭으로 특정 시점 점프)
- 정렬/분배 도구 (좌/중/우/상/중/하 정렬, 수평/수직 균등 분배)
- 이미지 내보내기 (PNG, SVG, PDF)
- Fit to Window (모든 테이블 화면 맞춤)

### 테마
4가지 캔버스 테마 지원 (툴바에서 전환):

| 테마 | 설명 |
|---|---|
| **Modern** | 둥근 모서리, 부드러운 그림자, 다크 헤더 (기본) |
| **Classic** | 각진 모서리, 종이 톤, 고전 ERD 느낌 |
| **Blueprint** | 직각, 얇은 윤곽선, 설계도 스타일 |
| **Minimal** | 약간 둥근, 최소 그림자, 깔끔한 라이트 톤 |

### 다국어 (i18n)
- 한국어 / English / 日本語 / 中文 전환 (툴바)
- Paraglide JS v2 기반, localStorage에 언어 설정 저장

### 테이블 관리
- 새 테이블 추가 (뷰포트 중심에 배치)
- 헤더 더블클릭으로 테이블명 인라인 편집
- 테이블 코멘트, 컬러, 그룹 설정
- 테이블 복제 / 위치 잠금
- **단일 선택**: 카드 / 사이드바 클릭
- **다중 선택**: Ctrl/Cmd + 클릭, Rubber band 드래그
- **일괄 작업**: 삭제, 색상/그룹/코멘트 일괄 편집, 잠금/해제
- **컬럼 표시 모드**: 전체 / PK&FK만 / 이름만

### 컬럼 관리
- 오른쪽 TableEditor 패널에서 CRUD
- **카드 내 컬럼 더블클릭** → 플로팅 팝업에서 즉시 편집
- 컬럼 드래그 순서 변경
- PK(금색) / FK(파란색) / UQ / AI 배지 표시
- 컬럼 hover 시 상세 툴팁
- ENUM 타입 (값 목록 관리)
- DECIMAL precision / scale 분리
- CHECK 제약조건

### Foreign Key
- FK 추가/수정 모달: 소스 컬럼 → 참조 테이블/컬럼, ON DELETE / ON UPDATE 액션
- **Crow's Foot Notation** 릴레이션 라인
  - nullable FK 대시 라인, mandatory tick 구분
  - 1:1 (unique FK) / 1:N 자동 판별
- FK 라인 hover 시 양쪽 컬럼 하이라이트
- FK 라인 클릭으로 삭제

### 도메인 관리
- 재사용 가능한 컬럼 속성 템플릿 정의
- 도메인 수정 시 연결된 모든 컬럼에 즉시 반영
- 컬럼에서 수동 편집 시 도메인 연결 자동 해제

### DDL Import / Export
- **4개 방언 지원**: MySQL / PostgreSQL / MariaDB / MSSQL
- **Export 옵션**: 들여쓰기, 따옴표 방식, 키워드 대소문자, 코멘트/인덱스/FK 포함 여부
- **Import**: DDL 파싱 → 테이블/컬럼 자동 생성, Import 후 자동 레이아웃
- **다이어그램 내보내기**: Mermaid, PlantUML

### 스키마 도구
- **스키마 검증/린팅**: 8가지 규칙 (PK 누락, FK 대상 누락, 중복, 순환 FK 등)
- **스키마 버전 비교 (Diff)**: 히스토리 또는 파일 업로드 비교, 색상 코딩
- **URL 공유**: 스키마 압축 → URL 해시로 공유

### 사이드바
- 테이블 목록 검색 (이름 + 컬럼명 + 코멘트)
- 정렬 (이름순 / 생성순)
- 그룹별 접기 / 펼치기
- 테이블 정보 요약 (컬럼 수, FK 수)

### 자동 배치 (Auto Layout)

| 종류 | 설명 |
|---|---|
| **격자** | BFS 순서 정렬, FK 연결 테이블 인접 배치 |
| **계층** | FK 방향 기반 상하 계층, barycenter 최적화 |
| **방사형** | d3-force 시뮬레이션 — FK 연결 군집, 반발력+중력 균형 |

그룹이 있는 경우 그룹별 독립 레이아웃 후 메타 그리드 배치 가능.

### 프로젝트 관리
- 다중 프로젝트 (생성/이름변경/복제/삭제/전환)
- 프로젝트별 캔버스 위치 저장
- 전체 프로젝트 백업/복원 (JSON)
- 커맨드 팔레트 (Ctrl+K)
- 키보드 단축키 안내 (? 버튼)

---

## 듀얼 스토리지 모드

| 모드 | 저장소 | 인증 | 협업 |
|---|---|---|---|
| **Local** (기본) | localStorage | 없음 | 없음 |
| **Server** | SQLite (WAL) | 로컬 + OIDC | WebSocket 실시간 |

`PUBLIC_STORAGE_MODE` 환경변수로 전환 (`local` / `server`).

### 서버 모드 기능
- **인증**: 로컬 인증 (username/password) + 다중 OIDC 프로바이더
- **권한**: 프로젝트별 역할 (owner / editor / viewer)
- **공유**: 사용자 검색 → 권한 부여, 읽기 전용 모드
- **실시간 협업**: WebSocket 동기화, 접속자 커서 표시, LWW 충돌 해결
- **관리자**: 사용자 CRUD, OIDC 프로바이더 관리, 세션 관리

---

## 데이터 모델

```
ERDSchema
├── tables: Table[]
│   ├── id, name, comment, color, group, locked
│   ├── position: { x, y }
│   ├── columns: Column[]
│   │   ├── id, name, type, length, scale
│   │   ├── nullable, primaryKey, unique, autoIncrement
│   │   ├── defaultValue, comment, check
│   │   ├── enumValues[]
│   │   └── domainId?
│   ├── foreignKeys: ForeignKey[]
│   │   ├── columnIds[] → referencedTableId.referencedColumnIds[]
│   │   └── onDelete, onUpdate
│   ├── uniqueKeys: UniqueKey[]
│   └── indexes: TableIndex[]
├── domains: ColumnDomain[]
└── groupColors?: Record<string, string>
```

---

## 개발 환경

```bash
pnpm install
pnpm dev          # http://localhost:5173 (로컬 모드)
pnpm dev:server   # 서버 모드 (SQLite + Auth)
pnpm build        # build/ 에 정적 파일 출력
pnpm build:server # 서버 빌드 (adapter-node)
pnpm test         # vitest (210+ 테스트)
pnpm check        # svelte-check 타입 검사
```

---

## Docker 배포

### 정적 SPA (로컬 모드)
```bash
docker build -t erdmini .
docker run -p 8080:80 erdmini
```

### 서버 모드 (SQLite + Auth + 실시간 협업)
```bash
docker compose up -d
```

`docker-compose.yml`에서 환경변수 설정:
- `PUBLIC_STORAGE_MODE=server`
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` (초기 관리자)
- `SESSION_MAX_AGE_DAYS` (세션 만료일, 기본 30)
- SQLite 데이터 볼륨 마운트
