# Docker 배포 가이드

erdmini는 두 가지 Docker 이미지를 제공한다.

| 이미지 | Dockerfile | 설명 |
|--------|------------|------|
| **정적 SPA** | `Dockerfile` | Nginx로 정적 파일 서빙 (로컬 모드, IndexedDB) |
| **서버 모드** | `Dockerfile.server` | Node.js + SQLite + Auth + 실시간 협업 |

---

## 빠른 시작

### 서버 모드 (권장)

```bash
docker compose up -d
```

기본 포트 `3000`으로 접속: http://localhost:3000

최초 실행 시 admin 계정이 자동 생성되며, 랜덤 비밀번호가 로그에 출력된다:

```bash
docker compose logs erdmini
```

```
============================================================
  Admin account created on first run
  Username: admin
  Password: kR7$mNp2xLfA&wQ9
  Please change the password after first login.
============================================================
```

> 비밀번호를 직접 지정하려면 `ADMIN_PASSWORD` 환경변수를 설정한다.

### 로컬 모드 (정적 SPA)

```bash
docker compose --profile local up -d erdmini-local
```

기본 포트 `8080`으로 접속: http://localhost:8080

---

## 환경변수

### 공통

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PUBLIC_SITE_URL` | `https://erdmini.dornol.dev` | SEO 메타태그에 사용되는 사이트 URL |

### 서버 모드 전용

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PUBLIC_STORAGE_MODE` | `server` | 스토리지 모드 (`local` / `server`) |
| `DB_PATH` | `/data/erdmini.db` | SQLite DB 파일 경로 |
| `PORT` | `3000` | 서버 포트 |
| `ADMIN_USERNAME` | `admin` | 초기 관리자 아이디 |
| `ADMIN_PASSWORD` | *(랜덤 생성)* | 초기 관리자 비밀번호. 미설정 시 랜덤 생성 후 로그 출력 |
| `SESSION_MAX_AGE_DAYS` | `30` | 세션 만료 기간(일) |
| `PUBLIC_APP_URL` | `http://localhost:5173` | 앱 URL (OIDC 콜백 등) |

### OIDC 설정

OIDC 프로바이더는 서버 관리자 화면에서 추가/관리한다. 환경변수로 설정하는 것이 아니라 로그인 후 Admin 패널에서 프로바이더를 등록한다.

---

## 볼륨 & 데이터

서버 모드는 `/data` 볼륨에 SQLite DB를 저장한다.

```yaml
volumes:
  - erdmini-data:/data   # named volume
  # 또는 호스트 바인드 마운트:
  # - ./data:/data
```

### 백업

```bash
# named volume에서 DB 파일 복사
docker compose cp erdmini:/data/erdmini.db ./backup-erdmini.db
```

### 복원

```bash
docker compose down
docker compose cp ./backup-erdmini.db erdmini:/data/erdmini.db
docker compose up -d
```

---

## 커스텀 빌드

### PUBLIC_SITE_URL 변경

```bash
docker build \
  --build-arg PUBLIC_SITE_URL=https://my-domain.com \
  -f Dockerfile.server \
  -t erdmini-server .
```

### 포트 변경

```bash
PORT=8080 docker compose up -d
```

---

## docker compose 프로필

| 서비스 | 프로필 | 설명 |
|--------|--------|------|
| `erdmini` | (기본) | 서버 모드 — `docker compose up` |
| `erdmini-local` | `local` | 정적 SPA — `docker compose --profile local up erdmini-local` |

---

## 프로덕션 팁

### 리버스 프록시 (Nginx 예시)

```nginx
server {
    listen 443 ssl http2;
    server_name erd.example.com;

    ssl_certificate     /etc/ssl/certs/erd.pem;
    ssl_certificate_key /etc/ssl/private/erd.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **WebSocket**: `Upgrade`/`Connection` 헤더를 프록시해야 실시간 협업이 동작한다.

### HTTPS

서버 모드에서 OIDC를 사용하려면 HTTPS가 필수이다. 리버스 프록시에서 TLS를 종료하고 `PUBLIC_APP_URL`을 `https://...`로 설정한다.

### Healthcheck

`Dockerfile.server`에 healthcheck가 포함되어 있다:

```
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3
  CMD wget --spider http://localhost:3000/ || exit 1
```

`docker ps`에서 `healthy` 상태를 확인할 수 있다.

---

## MCP (Model Context Protocol) 서버

erdmini 서버에 MCP Streamable HTTP 엔드포인트(`/mcp`)가 내장되어 있다. 별도 프로세스 없이 동일 서버에서 MCP를 제공한다. 서버 모드 전용.

### 사전 준비

1. Admin UI(`/admin`)의 **API Keys** 탭에서 API 키를 생성한다.
2. 생성 직후 표시되는 `erd_...` 키를 안전한 곳에 복사한다 (1회만 표시됨).

### 빌드

```bash
pnpm build:server     # SvelteKit 서버 빌드 (MCP 포함)
pnpm start:server     # 서버 시작 (웹 UI + MCP 모두 제공)
```

### Claude Desktop 설정

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "erdmini": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "x-api-key": "erd_<admin에서_생성한_키>"
      }
    }
  }
}
```

### Claude Code 설정

```bash
claude mcp add --transport http erdmini http://localhost:3000/mcp \
  --header "x-api-key: erd_<admin에서_생성한_키>"
```

### 사용 가능한 도구

| 도구 | 설명 | 최소 권한 |
|------|------|-----------|
| `list_projects` | 접근 가능한 프로젝트 목록 | - |
| `get_schema` | ERD 스키마 JSON | viewer |
| `export_ddl` | DDL SQL 생성 (4 dialect) | viewer |
| `lint_schema` | 스키마 린트 검사 | viewer |
| `export_diagram` | Mermaid / PlantUML | viewer |
| `add_table` | 테이블 추가 | editor |
| `update_table` | 테이블 수정 | editor |
| `delete_table` | 테이블 삭제 | editor |
| `add_column` | 컬럼 추가 | editor |
| `update_column` | 컬럼 수정 | editor |
| `delete_column` | 컬럼 삭제 | editor |
| `add_foreign_key` | FK 추가 | editor |
| `delete_foreign_key` | FK 삭제 | editor |
| `import_ddl` | DDL SQL 임포트 | editor |

### Docker에서 MCP 사용

Docker 배포 시 별도 설정 없이 동일 포트에서 MCP가 제공된다:

```
http://localhost:3000/mcp   ← MCP Streamable HTTP
http://localhost:3000/      ← 웹 UI
ws://localhost:3000/ws      ← 실시간 협업
```
