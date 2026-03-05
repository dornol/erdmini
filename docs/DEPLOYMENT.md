# Deployment Guide

## Docker (Server Mode)

### 빌드

```bash
# docker-compose 사용
docker compose build erdmini

# 직접 빌드
docker build -f Dockerfile.server -t erdmini .

# PUBLIC_SITE_URL 변경 시
docker build -f Dockerfile.server --build-arg PUBLIC_SITE_URL=https://your-domain.com -t erdmini .
```

### 빌드 테스트 (로컬 검증)

이미지 빌드 후 배포 전에 로컬에서 정상 동작을 확인한다.

```bash
# 1. 이미지 빌드
docker compose build erdmini

# 2. 컨테이너 실행
docker compose up -d erdmini

# 3. 로그 확인 — 에러 없이 "Listening on port 3000" 출력되는지 확인
docker logs -f erdmini

# 4. 헬스체크 확인
docker inspect --format='{{.State.Health.Status}}' erdmini
# 기대값: healthy

# 5. HTTP 응답 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
# 기대값: 200

# 6. 정리
docker compose down
```

### 실행

```bash
# docker-compose (권장)
docker compose up -d erdmini

# 직접 실행
docker run -d --name erdmini \
  -p 3000:3000 \
  -v erdmini-data:/data \
  --env-file .env \
  -e PUBLIC_STORAGE_MODE=server \
  -e DB_PATH=/data/erdmini.db \
  erdmini
```

### 환경변수

`.env` 파일 또는 `docker-compose.yml`의 `environment`에 설정한다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PUBLIC_STORAGE_MODE` | `server` | Docker에서는 항상 `server` |
| `DB_PATH` | `/data/erdmini.db` | SQLite 파일 경로 (볼륨 마운트 필수) |
| `PORT` | `3000` | HTTP 포트 |
| `ADMIN_USERNAME` | `admin` | 초기 관리자 계정 |
| `ADMIN_PASSWORD` | 자동생성 | 초기 관리자 비밀번호 (로그에 출력) |
| `LOG_FORMAT` | `text` | `json` (JSON Lines) 또는 `text` |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

### 데이터 영속성

SQLite DB는 `/data` 볼륨에 저장된다. `docker compose down`으로 컨테이너를 제거해도 데이터는 유지된다.

```bash
# 볼륨 확인
docker volume inspect erdmini_erdmini-data

# 주의: 볼륨까지 삭제하면 데이터 손실
docker compose down -v  # ⚠️ 데이터 삭제됨
```

### 업데이트

```bash
# 새 이미지 빌드 후 재시작
docker compose build erdmini
docker compose up -d erdmini
```

## Docker (Local Mode — nginx)

정적 SPA 빌드를 nginx로 서빙한다. 인증/협업 기능 없음.

```bash
docker compose --profile local build erdmini-local
docker compose --profile local up -d erdmini-local
# http://localhost:8080 접속
```

## 수동 배포 (Node.js)

```bash
# 빌드
PUBLIC_STORAGE_MODE=server pnpm build:server

# 실행
DB_PATH=./data/erdmini.db node server.js
```

## 트러블슈팅

### `ERR_MODULE_NOT_FOUND: Cannot find module '/app/logger.js'`

`Dockerfile.server`에서 `logger.js`가 production 스테이지에 복사되지 않은 경우. `COPY --from=build /app/logger.js ./` 라인이 있는지 확인.

### 초기 관리자 비밀번호 확인

```bash
docker logs erdmini 2>&1 | grep -i password
```
