# Deployment Guide

## Docker (Server Mode)

### Build

```bash
# Using docker-compose
docker compose build erdmini

# Direct build
docker build -f Dockerfile.server -t erdmini .

# With custom PUBLIC_SITE_URL
docker build -f Dockerfile.server --build-arg PUBLIC_SITE_URL=https://your-domain.com -t erdmini .
```

### Build Testing (Local Verification)

Verify the image works locally before deploying.

```bash
# 1. Build image
docker compose build erdmini

# 2. Start container
docker compose up -d erdmini

# 3. Check logs — ensure "Listening on port 3000" appears without errors
docker logs -f erdmini

# 4. Health check
docker inspect --format='{{.State.Health.Status}}' erdmini
# Expected: healthy

# 5. HTTP response check
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
# Expected: 200

# 6. Cleanup
docker compose down
```

### Run

```bash
# docker-compose (recommended)
docker compose up -d erdmini

# Direct run
docker run -d --name erdmini \
  -p 3000:3000 \
  -v erdmini-data:/data \
  --env-file .env \
  -e PUBLIC_STORAGE_MODE=server \
  -e DB_PATH=/data/erdmini.db \
  erdmini
```

### Environment Variables

Set in `.env` file or `docker-compose.yml` `environment` section.

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_STORAGE_MODE` | `server` | Always `server` for Docker |
| `DB_PATH` | `/data/erdmini.db` | SQLite file path (volume mount required) |
| `PORT` | `3000` | HTTP port |
| `ADMIN_USERNAME` | `admin` | Initial admin account |
| `ADMIN_PASSWORD` | auto-generated | Initial admin password (printed to logs) |
| `LOG_FORMAT` | `text` | `json` (JSON Lines) or `text` |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

### Data Persistence

SQLite DB is stored in the `/data` volume. Data persists even when the container is removed with `docker compose down`.

```bash
# Check volume
docker volume inspect erdmini_erdmini-data

# Warning: removing volumes deletes data
docker compose down -v  # Data will be deleted!
```

### Update

```bash
# Build new image and restart
docker compose build erdmini
docker compose up -d erdmini
```

## Docker (Local Mode — nginx)

Serves a static SPA build via nginx. No auth/collaboration features.

```bash
docker compose --profile local build erdmini-local
docker compose --profile local up -d erdmini-local
# Access at http://localhost:8080
```

## Manual Deployment (Node.js)

```bash
# Build
PUBLIC_STORAGE_MODE=server pnpm build:server

# Run
DB_PATH=./data/erdmini.db node server.js
```

## Troubleshooting

### `ERR_MODULE_NOT_FOUND: Cannot find module '/app/logger.js'`

`logger.js` was not copied to the production stage in `Dockerfile.server`. Verify that `COPY --from=build /app/logger.js ./` exists.

### Check Initial Admin Password

```bash
docker logs erdmini 2>&1 | grep -i password
```
