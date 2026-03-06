# Feature Specification

erdmini의 전체 기능을 영역별로 정의한 문서.

---

## 1. Canvas

브라우저 위에서 동작하는 무한 캔버스. HTML div + CSS `transform` 기반.

### Viewport

| 항목 | 스펙 |
|---|---|
| 줌 범위 | 0.05x ~ 3.0x (5% ~ 300%) |
| 줌 배율 | 휠 1단계당 ×1.1 (확대) / ×0.9 (축소) |
| 줌 기준점 | 마우스 커서 위치 (커서 고정) |
| 터치 줌 | 핀치 제스처 지원 (동일 범위) |
| 키보드 줌 | `+`/`=` 확대, `-` 축소 (0.2x ~ 3.0x 범위) |

### Pan (이동)

| 방법 | 동작 |
|---|---|
| 우클릭 드래그 | 항상 팬 |
| Space + 좌클릭 드래그 | 팬 (커서 grab → grabbing 변경) |
| 방향키 | 60px씩 이동 |

좌클릭 드래그(배경)는 러버밴드 선택이며, 팬이 아님.

### Grid Snap

- 그리드 크기: 20px 고정
- CanvasBottomBar에서 토글
- 활성화 시 테이블/메모 위치가 20px 단위로 스냅

### Minimap

- 캔버스 우하단에 표시
- 전체 테이블 + 메모를 축소 렌더링
- 클릭 시 해당 위치로 뷰포트 이동
- 현재 뷰포트 영역 표시

### Fit to Window

- 모든 테이블/메모가 화면에 들어오도록 줌/위치 자동 조정

### FK 라인 표시/숨김

- CanvasBottomBar에서 FK 라인 표시/숨김 토글

---

## 2. Table

### CRUD

- **생성**: 뷰포트 중앙에 배치, 자동 이름 부여 (`table_1`, `table_2`, ...)
- **이름 편집**: 카드 헤더 더블클릭으로 인라인 편집
- **삭제**: 선택 후 Delete/Backspace, 확인 다이얼로그. FK 참조도 자동 정리
- **복제**: Ctrl+D, 원본 옆에 배치
- **템플릿**: 5가지 사전 정의 템플릿 (users, audit_log, settings, files, tags)

### Properties

| 속성 | 설명 |
|---|---|
| `name` | 테이블 이름 |
| `comment` | 설명 (선택) |
| `color` | 헤더 색상 — 14색 팔레트 (red, orange, amber, green, teal, blue, purple, pink, lime, cyan, indigo, rose, slate, brown) |
| `group` | 그룹 이름 (자유 텍스트, datalist 자동완성) |
| `locked` | 잠금 — 드래그/삭제 방지, 카드에 잠금 아이콘 표시 |
| `schema` | 스키마 네임스페이스 (선택) |

### Drag

- 좌클릭 드래그로 이동
- Grid Snap 활성화 시 20px 단위로 스냅
- 잠긴 테이블은 드래그 불가

### Column Display Mode

카드에 표시되는 컬럼 범위를 제어:

| 모드 | 표시 범위 |
|---|---|
| `all` | 모든 컬럼 |
| `pk-fk-only` | PK + FK 컬럼만 |
| `names-only` | 컬럼 이름만 (타입/배지 생략) |

CanvasBottomBar에서 전환. `localStorage`에 저장.

### Table Card 정보

- Unique key / Index 정보 툴팁 (카드 호버 시)
- 부착된 메모 배지 (헤더에 표시)
- 필터링된 컬럼 표시 ("filtered" 인디케이터)

### Cross-Project Copy/Paste

- Ctrl+C/V로 선택한 테이블을 다른 프로젝트로 복사
- ID 자동 재매핑

---

## 3. Column

### CRUD

- TableEditor(우측 패널)에서 추가/편집/삭제
- 카드에서 컬럼 더블클릭 → ColumnEditPopup 플로팅 편집
- 카드 하단 "+" 버튼 호버 시 표시 → 빠른 컬럼 추가
- 드래그로 순서 변경
- 컬럼 복제 (같은 테이블 내)

### Types

16개 타입 지원:

| 카테고리 | 타입 |
|---|---|
| 정수 | `INT`, `BIGINT`, `SMALLINT` |
| 실수 | `FLOAT`, `DOUBLE`, `DECIMAL` (precision + scale) |
| 문자열 | `VARCHAR` (length), `CHAR` (length), `TEXT` |
| 날짜 | `DATE`, `DATETIME`, `TIMESTAMP` |
| 기타 | `BOOLEAN`, `JSON`, `UUID`, `ENUM` (값 목록 관리) |

### Constraints

| 제약조건 | 배지 | 설명 |
|---|---|---|
| Primary Key | PK (금색) | 기본 키 |
| Foreign Key | FK (파랑) | 외래 키 (FK 관계 연결 시 자동) |
| Nullable | — | NULL 허용 여부 |
| Unique | UQ (보라) | 유니크 제약 |
| Auto Increment | AI (녹색) | 자동 증가 |
| CHECK | CK (노랑) | CHECK 제약 표현식 |
| Default Value | — | 기본값 표현식. 타입별 프리셋 제공 (NOW(), CURRENT_TIMESTAMP, UUID(), 0 등) |

### Composite Constraints

- Composite Unique Key: 여러 컬럼으로 구성된 유니크 제약 (ConstraintModal에서 관리)
- Index: 여러 컬럼으로 구성된 인덱스 (ConstraintModal에서 관리)

### Hover Tooltip

카드에서 컬럼에 마우스 오버 시 타입, nullable, 배지, comment 등 상세 정보 표시.

---

## 4. Foreign Key

### CRUD

- FkModal에서 추가/편집: 소스 컬럼 → 참조 테이블/컬럼 선택
- Composite FK 지원 (여러 컬럼 쌍)
- FK 드래그 생성: 컬럼 우측 핸들 → 대상 컬럼으로 드래그
- FK popover: FK 라인 클릭 → 정보 확인, 라벨 편집, FK 편집, 삭제
- FK 라벨: FK 라인에 관계 설명 텍스트 표시 (더블클릭으로 인라인 편집)

### Referential Actions

ON DELETE / ON UPDATE 각각 설정:

| Action | 설명 |
|---|---|
| `CASCADE` | 부모 변경 시 자식도 변경/삭제 |
| `SET NULL` | 부모 삭제 시 자식을 NULL로 |
| `RESTRICT` | 자식이 있으면 부모 변경 거부 (기본값) |
| `NO ACTION` | RESTRICT와 유사 (DBMS별 차이) |

### Relation Lines

SVG bezier 곡선 + crow's foot notation:

| 관계 | 표현 |
|---|---|
| 1:N | N측에 crow's foot |
| 1:1 | 양쪽 tick (FK 컬럼이 Unique일 때) |
| Nullable FK | 점선 (`stroke-dasharray: 5 3`) |
| Not-null FK | 실선 |

라인 스타일 3종: bezier / straight / orthogonal (CanvasBottomBar에서 전환)

- 테이블 이동 시 실시간 업데이트
- FK 라인 호버 시 양쪽 관련 컬럼 하이라이트
- 같은 테이블 쌍의 여러 FK는 자동 간격 조정
- Self-referencing FK 루프 지원
- FK 라인 표시/숨김 토글

---

## 5. Domain

컬럼 속성 템플릿. 도메인 변경 시 연결된 모든 컬럼에 자동 전파.

### Properties

도메인이 관리하는 속성:

| 카테고리 | 필드 |
|---|---|
| 컬럼 속성 | `type`, `length`, `scale`, `nullable`, `primaryKey`, `unique`, `autoIncrement`, `defaultValue`, `check`, `enumValues`, `comment` |
| 조직 | `group`, `parentId` (계층 구조) |
| 문서화 | `description`, `alias`, `dataStandard`, `example`, `validRange`, `owner`, `tags` |

### Behavior

- DomainModal에서 CRUD (테이블형 UI)
- 컬럼에 도메인 연결: 도메인 속성이 컬럼에 복사
- 도메인 수정 시: 연결된 모든 컬럼에 변경 자동 전파
- 컬럼 수동 편집 시: 도메인 연결 자동 해제
- 그룹별 분류 지원 (접기/펼치기)
- 미사용 도메인 필터 (showUnusedOnly 토글)

### Hierarchy

- `parentId` 필드로 부모/자식 도메인 관계 설정
- 순환 참조 감지 (lint 규칙 9번)

### Coverage & Dictionary

- **Coverage Dashboard**: 전체 컬럼 대비 도메인 연결 비율, 그룹별 통계
- **Dictionary Export**: HTML, Markdown, XLSX 형식 내보내기
- **Domain Import/Export**: XLSX 형식 일괄 가져오기/내보내기

---

## 6. Sticky Memo

캔버스 위의 포스트잇 카드.

### CRUD

- Toolbar에서 추가 → 뷰포트 중앙에 배치, 즉시 편집 모드 진입
- 더블클릭으로 인라인 편집 (textarea)
- Escape 또는 blur로 편집 종료

### Properties

| 속성 | 설명 |
|---|---|
| `content` | 텍스트 내용 |
| `color` | 6색 (yellow, blue, green, pink, purple, orange). 선택 시 하단 색상 피커 표시 |
| `position` | 캔버스 좌표 |
| `width`, `height` | 크기 (우하단 핸들로 리사이즈, 최소 120×80) |
| `locked` | 잠금 — 드래그/리사이즈/편집 방지 |
| `schema` | 스키마 네임스페이스 (선택) |
| `attachedTableId` | 부착된 테이블 ID (선택) |

### Table Attachment

- 메모를 테이블 위로 드래그하면 부착
- 부착된 메모는 테이블과 함께 이동
- 핀 배지 (📌) 표시

### Selection

- Ctrl/Cmd+클릭으로 다중 선택
- 러버밴드 선택에 포함
- 다중 선택 후 그룹 드래그 이동

---

## 7. Schema Namespace

### 스키마 탭

- 테이블/메모에 스키마 할당 (예: `public`, `auth`, `billing`)
- SchemaTabBar: (All) + 스키마별 탭 (삭제 × + 추가 +)
- 스키마 전환 시 뷰포트 위치 개별 저장/복원
- 스키마 필터: 캔버스, 사이드바, 미니맵, FK 라인 모두 적용

### DDL 연동

- Export: `CREATE SCHEMA IF NOT EXISTS` + `schema.table` 형식
- Import: SQL 문의 스키마 자동 추출, 활성 스키마 탭에 할당

---

## 8. Import / Export

### Import

| 형식 | 설명 |
|---|---|
| DDL (SQL) | 7 dialect 지원: MySQL, PostgreSQL, MariaDB, MSSQL, SQLite, Oracle, H2 |
| Prisma | Prisma 스키마 파싱 (enum, model, @ignore, @@ignore, @updatedAt, enum @map) |
| DBML | DBML 커스텀 파서 (Table, Column, Enum, Ref, Indexes) |

- node-sql-parser 기반 DDL 파싱
- COMMENT 파싱 → 테이블/컬럼 comment에 적용
- ALTER TABLE FK 핸들링
- 스키마 접두사 자동 제거
- 임포트 후 자동 레이아웃 (FK 관계 → hierarchical, 없으면 grid)
- i18n 에러 메시지

### Export — DDL

7 dialect 지원: MySQL, PostgreSQL, MariaDB, MSSQL, SQLite, Oracle, H2

**포맷 옵션**:

| 옵션 | 값 | 기본값 |
|---|---|---|
| `indent` | `2spaces` / `4spaces` / `tab` | `2spaces` |
| `quoteStyle` | `none` / `backtick` / `double` / `bracket` | dialect별 기본값 |
| `includeComments` | boolean | true |
| `includeIndexes` | boolean | true |
| `includeForeignKeys` | boolean | true |
| `includeDomains` | boolean | false |
| `upperCaseKeywords` | boolean | true |

포맷 옵션은 `localStorage`에 저장.

### Export — Other Formats

| 형식 | 설명 |
|---|---|
| Prisma | Prisma 스키마 생성 |
| DBML | DBML 형식 생성 |
| Mermaid | erDiagram 형식 텍스트 |
| PlantUML | @startuml/@enduml 형식 텍스트 |

### Export — Image

| 포맷 | 구현 |
|---|---|
| PNG | Canvas API를 통한 래스터 변환 |
| SVG | 테이블 + 메모 + FK 라인을 SVG로 생성 |
| PDF | jsPDF + svg2pdf.js (동적 import로 번들 최소화) |

모든 이미지 포맷에 메모 포함.

### Export — Data

| 포맷 | 설명 |
|---|---|
| JSON | 전체 ERDSchema JSON (단일 프로젝트) |
| JSON Backup | 모든 프로젝트 일괄 백업/복원 |
| URL | 스키마를 DEFLATE 압축 + base64url 인코딩 → URL hash에 포함 |

---

## 9. SQL Playground

- sql.js (WASM) 기반 인브라우저 SQL 실행
- 현재 ERD 스키마 자동 동기화 (CREATE TABLE)
- 더미 데이터 생성 (FK 순서 고려한 위상 정렬)
- 쿼리 히스토리

---

## 10. Schema Tools

### Lint (유효성 검사)

9개 규칙:

| 규칙 | 심각도 | 설명 |
|---|---|---|
| `no-pk` | warning | PK 없는 테이블 |
| `fk-target-missing` | error | FK가 참조하는 테이블/컬럼이 없음 |
| `set-null-not-nullable` | warning | SET NULL인데 NOT NULL 컬럼 |
| `duplicate-column-name` | error | 같은 테이블 내 중복 컬럼명 |
| `duplicate-table-name` | error | 중복 테이블명 |
| `duplicate-index` | warning | 동일 컬럼 조합의 중복 인덱스 |
| `circular-fk` | warning | FK 순환 참조 (DFS 탐지) |
| `empty-table` | info | 컬럼 없는 빈 테이블 |
| `domain-circular-hierarchy` | error | 도메인 계층 순환 참조 |

LintPanel에서 결과 표시. 이슈 클릭 시 해당 테이블로 이동.

### Schema Diff

두 버전의 스키마를 비교:
- 소스: undo 히스토리의 이전 버전 또는 파일 업로드
- 색상 코드: 추가(초록) / 삭제(빨강) / 변경(노랑)
- 비교 대상: 테이블, 컬럼, FK, 인덱스

### Migration SQL

- 스냅샷 diff에서 ALTER TABLE DDL 자동 생성
- dialect별 출력 지원

### Schema Snapshots

- 수동 저장 (이름 + 설명)
- 자동 스냅샷 (5분 간격, 최대 50개)
- 복원 / 비교(diff) / 삭제

### URL Share

- 스키마를 DEFLATE 압축 → base64url 인코딩 → URL hash (`#s=<encoded>`)
- 프로젝트 이름 포함
- 수신 시 자동 로드

---

## 11. Auto Layout

3가지 레이아웃 알고리즘:

| 타입 | 알고리즘 | 특징 |
|---|---|---|
| **Grid** | BFS ordering | 루트 테이블부터 BFS 순회, FK 연결 테이블 인접 배치 |
| **Hierarchical** | Barycenter | FK 방향 기반 상하 계층, barycenter 최적화 |
| **Radial** | d3-force | FK 링크 + 충돌 회피 + 반발력 시뮬레이션 |

**레이아웃 상수**: gap 60px, margin 40px, group gap 80px

**Group Layout**: `groupByGroup` 옵션 활성화 시 그룹별 독립 레이아웃 후 메타 그리드 배치.

### Align & Distribute

2개 이상 선택 시 사용 가능:
- **Align**: 좌/중앙/우/상/중앙/하 정렬
- **Distribute**: 수평/수직 균등 분배

---

## 12. Sidebar

좌측 패널. 테이블 목록 + 메모 섹션.

### Search

기본 검색: 테이블명, 컬럼명, 컬럼 코멘트, 테이블 코멘트, FK 참조 테이블명, 그룹명 (대소문자 무시)

**접두사 필터** (7종):

| 접두사 | 설명 | 예시 |
|---|---|---|
| `fk:` | FK가 있는 테이블 | `fk:` |
| `group:` | 그룹명 필터 | `group:auth` |
| `locked:` | 잠긴 테이블 | `locked:` |
| `type:` | 컬럼 타입 필터 | `type:varchar` |
| `has:` | 속성 보유 필터 | `has:pk`, `has:fk`, `has:index`, `has:comment`, `has:domain`, `has:unique`, `has:auto`, `has:default`, `has:color`, `has:enum`, `has:locked` |
| `no:` | 속성 미보유 필터 | `no:pk`, `no:fk` |
| `color:` | 테이블 색상 필터 | `color:blue` |

검색 힌트 드롭다운 (클릭 / 방향키 선택).

### Sort

| 모드 | 동작 |
|---|---|
| `creation` | 생성 순서 (기본값) |
| `name` | 이름 알파벳순 |

### Group View

- 그룹별 접기/펼치기
- 접힌 상태 `localStorage`에 저장

### Memos Section

- 색상 도트 + 내용 미리보기
- 클릭 시 메모 선택 + 뷰포트 이동

### Virtual Scroll

1000+ 테이블 대응. VirtualList 컴포넌트 (binary search, overscan, scrollToIndex).

---

## 13. Project

### Multi-Project

- 생성 / 이름 변경 / 복제 / 삭제 / 전환
- 드롭다운에 수정일시 + 테이블 수 표시
- 프로젝트별 캔버스 위치(x, y, scale) 저장

### Backup / Restore

- 모든 프로젝트 JSON 일괄 내보내기/가져오기

### Auto-Save

- 300ms debounce로 스키마 변경 시 자동 저장
- 저장소 용량 초과 시 경고 + 긴급 JSON 다운로드
- 레거시 데이터 자동 마이그레이션

### Command Palette

- `Ctrl+K` / `Ctrl+F` 토글 (macOS: `Cmd+K` / `Cmd+F`)
- 테이블/컬럼 이름 검색 (대소문자 무시)
- 방향키 탐색, Enter로 해당 테이블 선택 + 뷰포트 이동

---

## 14. Selection & Interaction

### Selection Methods

| 방법 | 동작 |
|---|---|
| 좌클릭 | 단일 선택 (테이블 또는 메모) |
| Ctrl/Cmd + 클릭 | 선택 추가/제거 |
| 좌클릭 + 드래그 (배경) | 러버밴드 영역 선택 |
| Ctrl + 드래그 (배경) | 기존 선택 유지 + 추가 영역 선택 |
| Ctrl+A | 모든 테이블 + 메모 선택 |
| Escape | 러버밴드 취소 → 전체 선택 해제 |

### Multi-Select Operations

- 그룹 드래그 이동
- 일괄 삭제 (확인 다이얼로그)
- Bulk Edit: 선택된 테이블의 color, group, comment, schema 일괄 수정
- Bulk Lock/Unlock

### Keyboard Shortcuts

| 단축키 | macOS | 동작 |
|---|---|---|
| `F` | `F` | 전체화면 토글 |
| `Escape` | `Escape` | 전체화면 해제 → 선택 해제 |
| `Ctrl+K` / `Ctrl+F` | `Cmd+K` / `Cmd+F` | 커맨드 팔레트 토글 |
| `Ctrl+Z` | `Cmd+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | `Cmd+Y` / `Cmd+Shift+Z` | Redo |
| `Ctrl+A` | `Cmd+A` | 전체 선택 |
| `Ctrl+D` | `Cmd+D` | 선택 테이블 복제 |
| `Ctrl+C` / `Ctrl+V` | `Cmd+C` / `Cmd+V` | 테이블 복사/붙여넣기 (크로스 프로젝트) |
| `Delete` / `Backspace` | `Delete` / `Backspace` | 선택 항목 삭제 |
| `+` / `=` | `+` / `=` | 줌 인 |
| `-` | `-` | 줌 아웃 |
| 방향키 | 방향키 | 캔버스 팬 (60px) |
| `?` | `?` | 단축키 도움말 패널 |

---

## 15. Undo / Redo

- 최대 200단계 히스토리
- 스냅샷 방식: 변경 전 스키마 전체를 JSON으로 저장
- 동일 스냅샷 중복 방지
- 원격 오퍼레이션(`_isRemoteOp`)은 히스토리에 기록하지 않음

### History Panel

- 시각적 타임라인 (Undo 과거 / 현재 / Redo 미래 구분)
- 각 항목에 라벨 + 상세 (테이블명, 컬럼명 등)
- 클릭으로 특정 시점으로 점프

---

## 16. Theme & i18n

### Theme

4가지 캔버스 테마:

| 테마 | 설명 |
|---|---|
| **Modern** | 둥근 모서리, 부드러운 그림자, 어두운 헤더 (기본값) |
| **Classic** | 직각, 종이 톤, 전통적 ERD 스타일 |
| **Blueprint** | 직각, 얇은 외곽선, 청사진 스타일 |
| **Minimal** | 약간 둥근 모서리, 최소 그림자, 깔끔한 밝은 톤 |

- CSS 변수 기반 (`data-theme` 속성)
- 테이블 14색 팔레트가 테마별로 다른 색상 매핑 보유
- **Dark Mode**: Toolbar / Sidebar / 모달 전체 적용

### i18n

- Paraglide JS v2 기반 컴파일 타임 i18n
- 4개 언어: 한국어 / 영어 / 일본어 / 중국어
- Toolbar에서 언어 전환

### Canvas Bottom Bar

캔버스 하단 중앙의 제어 바:
- 오토 레이아웃 선택 (Grid / Hierarchical / Radial)
- 컬럼 표시 모드 (All / PK & FK only / Names only)
- 라인 스타일 (Bezier / Straight / Orthogonal)
- 테마 선택
- FK 라인 표시/숨김 토글
- 그리드 토글 / 스냅 토글
- 정렬/분배 도구

---

## 17. Server Mode

`PUBLIC_STORAGE_MODE=server` 시 활성화. 로컬 모드에는 없는 기능.

### Authentication

| 방식 | 설명 |
|---|---|
| Local Auth | 사용자명 + 비밀번호 (argon2 해싱) |
| OIDC | 다중 프로바이더 (Keycloak, Auth0, Google 등). PKCE 플로우. Admin UI에서 관리 |
| LDAP | LDAP/AD 인증. Admin UI에서 관리 |

- 세션: `erdmini_session` HttpOnly 쿠키, 30일 기본
- 최초 실행 시 admin 계정 자동 생성

### Groups

- 사용자 그룹 관리
- 그룹별 프로젝트 권한 부여
- OIDC/LDAP 로그인 시 그룹 자동 동기화
- Admin 그룹 매핑 (자동 승격/강등)

### Permission

프로젝트별 역할:

| 역할 | 읽기 | 쓰기 | 관리 |
|---|---|---|---|
| viewer | O | X | X |
| editor | O | O | X |
| owner | O | O | O |
| admin (사용자 역할) | O | O | O (모든 프로젝트) |

사용자별 권한 플래그: `can_create_project`, `can_create_api_key`, `can_create_embed`

### Sharing

- 사용자/그룹 검색 → 프로젝트 권한 부여 모달
- viewer 역할은 완전한 읽기 전용 모드 (편집 UI 비활성화)

### Real-time Collaboration

- WebSocket 기반 실시간 동기화
- 41개 오퍼레이션 타입 (테이블/컬럼/FK/UK/인덱스/도메인/그룹/메모/레이아웃/스키마)
- LWW (Last-Writer-Wins) 충돌 해결
- 접속자 커서/선택 표시 (Presence)
- 연결 끊김 시 자동 재접속 + 스키마 동기화 (exponential backoff)

### MCP

Streamable HTTP 엔드포인트 (`/mcp`). API Key 인증. 66개 도구.

상세: [docs/mcp/](../mcp/)

### Admin UI

- 사용자 CRUD + 권한 플래그
- 그룹 관리
- OIDC/LDAP 프로바이더 관리
- API Key 관리
- 프로젝트 관리
- Embed 토큰 관리
- 감사 로그 조회
- 백업/복원
- 사이트 브랜딩 (사이트 이름, 로고 URL, 로그인 메시지)

### Embed

- 읽기 전용 iframe 임베드
- 토큰 기반 접근
- 선택적 비밀번호 보호

### Audit Trail

- 액션 로깅 (인증, 스키마 변경, 관리 작업)
- 설정 가능한 보존 기간 (기본 720일)
- Admin UI에서 조회
