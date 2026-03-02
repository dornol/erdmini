# erdmini — 기능 목록

## Phase 1: 기본 기능
- 캔버스 (HTML div + CSS transform, 무한 확장)
- 테이블 CRUD (추가/수정/삭제)
- 컬럼 CRUD (추가/수정/삭제, 타입 16종)
- 테이블 드래그 이동
- 마우스 휠 줌 / 우클릭 드래그 팬

## Phase 2: FK & DDL
- FK 관리 UI (TableEditor 내 추가/삭제, 모달)
- 관계선 SVG 오버레이 (베지어 곡선 + crow's foot 표기)
- 관계선 클릭 삭제
- DDL Import / Export (node-sql-parser 기반)
- FK 드래그 생성 (컬럼 우측 핸들 → 대상 컬럼)

## Phase 3: 편의 기능
- 도메인 시스템 (재사용 가능한 컬럼 타입 프리셋, 전파)
- Ctrl+클릭 다중 선택 / 일괄 삭제
- 컬럼 더블클릭 팝업 편집 (ColumnEditPopup)
- 방사형 자동 레이아웃 (d3-force)

## Phase 4: 고급 기능
- 사이드바 (검색/정렬/그룹 뷰/테이블 정보 배지/접기)
- DDL 4개 방언 (MySQL, PostgreSQL, MariaDB, MSSQL)
- Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, 최대 50단계, 라벨 히스토리)
- 미니맵 (클릭 네비게이션)
- 이미지 내보내기 (PNG, SVG)
- 테이블 복제
- 컬럼 드래그 순서 변경
- 복합 Unique Key / Index 관리 (모달)
- 테이블 코멘트, 컬럼 코멘트
- 컬럼 CHECK 제약조건
- 테이블 컬러 (프리셋 팔레트)
- 테이블 그룹 (텍스트 + datalist)
- 자동 레이아웃 3종 (그리드 / 계층 / 방사형)
- JSON Import / Export
- URL 공유 (스키마 압축 → URL 해시, 프로젝트명 포함)

## Phase 5: 국제화
- Paraglide i18n (한국어 / 영어 / 일본어 / 중국어)
- ~270개 메시지 키

## Phase 6: 테마
- 4개 테마: Modern (기본), Classic (세피아), Blueprint (설계도), Minimal (그레이스케일)
- CSS 변수 기반 (캔버스 영역만 적용)
- 다크 모드 (CSS custom properties, Toolbar/Sidebar/모달 전체 적용)

## Phase 7: 선택 & 인터랙션
- Rubber band 선택 (좌클릭+드래그 → 영역 내 테이블 선택)
- Ctrl+드래그 추가 선택 (기존 선택 유지)
- 다중 테이블 그룹 드래그 이동
- Space+좌클릭+드래그 팬
- Escape 마키 취소 (이전 선택 복원)

## Phase 8: 개선 작업
- 프로젝트별 캔버스 위치 저장 (x/y/scale 프로젝트 전환 시 유지)
- Ctrl+A 전체 선택 / Ctrl+D 복제 단축키
- DDL Import i18n 전환 (에러 메시지 다국어)
- 사이드바 컬럼명 검색 (테이블명 + 컬럼명 통합 검색)
- 그리드 스냅 (20px 격자, Toolbar 토글)
- 정렬/분배 도구 (좌/중/우/상/중/하 정렬, 수평/수직 균등 분배)
- FK 수정 모달 (기존 FK의 컬럼/참조 변경)
- DDL Import 후 자동 레이아웃 (FK 관계 → 계층 배치, 없으면 그리드)
- ENUM 타입 지원 (값 목록 관리, DDL export/import)
- DECIMAL 정밀도/스케일 분리 (precision + scale 별도 필드)
- 프로젝트 전체 백업/복원 (모든 프로젝트 일괄 JSON 내보내기/가져오기)
- 프로젝트 메타 표시 (드롭다운에 수정일/테이블 수)
- 사이드바 너비 저장
- 테이블 위치 잠금 (드래그 방지, 잠금 아이콘 표시)

## Phase 9: 듀얼 스토리지
- 스토리지 모드 전환: IndexedDB (기본) / Server+SQLite
- `PUBLIC_STORAGE_MODE` 환경변수로 모드 선택
- 서버 모드: SvelteKit API routes + SQLite (better-sqlite3, WAL)
- Docker 지원 (Dockerfile.server + docker-compose.yml)

## Phase 10: 인증 시스템
- 로컬 인증 (username/password) + 다중 OIDC 프로바이더
- 서버 모드 전용 (로컬 모드에서는 인증 없음)
- 관리자 UI (사용자 CRUD, OIDC 프로바이더 관리)
- 세션 관리 (HttpOnly 쿠키, 30일 기본)

## Phase 11: 권한 관리
- 프로젝트별 역할: owner / editor / viewer
- 공유 UI (사용자 검색 → 권한 부여)
- 읽기 전용 모드 (viewer 역할)

## Phase 12: 실시간 협업
- WebSocket 기반 실시간 동기화
- LWW (Last-Writer-Wins) 충돌 해결
- 접속자 커서 표시 (presence)
- 연결 끊김 시 자동 재접속 + 스키마 동기화

## Phase 13: 추가 도구
- 스키마 검증/린팅 (8가지 규칙, LintPanel, 클릭으로 테이블 이동)
- PDF 내보내기 (jsPDF + svg2pdf.js)
- 테이블 일괄 편집 (다중 선택 → color, group, comment 일괄 수정)
- 테이블 일괄 잠금/해제
- DDL 내보내기 포맷 옵션 (들여쓰기, 따옴표, 키워드 대소문자, 포함 항목 선택)
- 실행취소 히스토리 패널 (시각적 타임라인, 클릭 점프)
- 컬럼 표시 모드 (전체 / PK&FK만 / 이름만)
- 스키마 버전 비교 Diff (히스토리 또는 파일 업로드, 색상 코딩)

## Phase 14: MCP 서버
- MCP (Model Context Protocol) Streamable HTTP 엔드포인트 (`/mcp`)
- SvelteKit API route로 통합 (별도 빌드/프로세스 불필요)
- API Key 인증 (`erd_` prefix, SHA-256 해시, Admin UI에서 생성/관리)
- 14개 도구: list_projects, get_schema, export_ddl, lint_schema, export_diagram, add/update/delete table/column, add/delete foreign_key, import_ddl
- Claude Desktop, Claude Code, Cursor 등 AI 어시스턴트 연동

## 향후 개선 후보
- FK 라인 스마트 라우팅 (겹침 방지, 장애물 회피, 자기참조 루프)
- 사이드바 가상 스크롤 (1000+ 테이블 대응)

## 기타 기능
- 다중 프로젝트 관리 (생성/이름변경/복제/삭제/전환)
- IndexedDB 자동 저장 (300ms 디바운스)
- 저장 용량 초과 경고 + 긴급 JSON 내보내기
- 레거시 데이터 마이그레이션
- 커맨드 팔레트 (Ctrl+K, 테이블/컬럼 검색)
- 키보드 단축키 안내 패널 (? 버튼)
- 컬럼 호버 시 툴팁 (타입, nullable, 배지, 코멘트)
- FK 호버 시 관련 컬럼 하이라이트
- 키보드 줌 (+/- 키) / 화살표 팬
- 다이어그램 내보내기 (Mermaid, PlantUML)
