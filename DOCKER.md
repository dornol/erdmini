# Docker Deployment Guide

erdmini provides two Docker images.

| Image | Dockerfile | Description |
|--------|------------|------|
| **Static SPA** | `Dockerfile` | Serves static files via Nginx (local mode, IndexedDB) |
| **Server mode** | `Dockerfile.server` | Node.js + SQLite + Auth + real-time collaboration |

---

## Quick Start

### Server Mode (Recommended)

```bash
docker compose up -d
```

Access at default port `3000`: http://localhost:3000

On first run, an admin account is created automatically and the random password is printed to the logs:

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

> To specify a password explicitly, set the `ADMIN_PASSWORD` environment variable.

### Local Mode (Static SPA)

```bash
docker compose --profile local up -d erdmini-local
```

Access at default port `8080`: http://localhost:8080

---

## Environment Variables

### Common

| Variable | Default | Description |
|------|--------|------|
| `PUBLIC_SITE_URL` | `https://erdmini.dornol.dev` | Site URL used in SEO meta tags |

### Server Mode Only

| Variable | Default | Description |
|------|--------|------|
| `PUBLIC_STORAGE_MODE` | `server` | Storage mode (`local` / `server`) |
| `DB_PATH` | `/data/erdmini.db` | SQLite DB file path |
| `PORT` | `3000` | Server port |
| `ADMIN_USERNAME` | `admin` | Initial admin username |
| `ADMIN_PASSWORD` | *(randomly generated)* | Initial admin password. If not set, a random password is generated and printed to the logs |
| `SESSION_MAX_AGE_DAYS` | `30` | Session expiry period (days) |
| `PUBLIC_APP_URL` | `http://localhost:5173` | App URL (for OIDC callback, etc.) |

### OIDC / LDAP Configuration

OIDC and LDAP providers are added and managed through the server admin UI. Rather than configuring via environment variables, register providers in the Admin panel after logging in.

- **OIDC**: Group sync from ID token claims, admin group auto-mapping
- **LDAP**: Bind authentication, group search, group sync on login

---

## Volumes & Data

In server mode, the SQLite DB is stored in the `/data` volume.

```yaml
volumes:
  - erdmini-data:/data   # named volume
  # or host bind mount:
  # - ./data:/data
```

### Backup

```bash
# Copy the DB file from the named volume
docker compose cp erdmini:/data/erdmini.db ./backup-erdmini.db
```

### Restore

```bash
docker compose down
docker compose cp ./backup-erdmini.db erdmini:/data/erdmini.db
docker compose up -d
```

---

## Custom Build

### Changing PUBLIC_SITE_URL

```bash
docker build \
  --build-arg PUBLIC_SITE_URL=https://my-domain.com \
  -f Dockerfile.server \
  -t erdmini-server .
```

### Changing the Port

```bash
PORT=8080 docker compose up -d
```

### Building for ARM64

The published Docker images are `linux/amd64` only. To run on ARM64 hosts (Apple Silicon Mac, Raspberry Pi, AWS Graviton, etc.), build locally:

```bash
# On an ARM64 host — automatically builds for the host architecture
docker compose build erdmini

# Or specify the platform explicitly
docker build --platform linux/arm64 -f Dockerfile.server -t erdmini-server .
```

---

## docker compose Profiles

| Service | Profile | Description |
|--------|--------|------|
| `erdmini` | (default) | Server mode — `docker compose up` |
| `erdmini-local` | `local` | Static SPA — `docker compose --profile local up erdmini-local` |

---

## Production Tips

### Reverse Proxy (Nginx Example)

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

> **WebSocket**: The `Upgrade`/`Connection` headers must be proxied for real-time collaboration to function.

### HTTPS

HTTPS is required to use OIDC in server mode. Terminate TLS at the reverse proxy and set `PUBLIC_APP_URL` to `https://...`.

### Healthcheck

`Dockerfile.server` includes a healthcheck:

```
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3
  CMD wget --spider http://localhost:3000/ || exit 1
```

The `healthy` status can be verified with `docker ps`.

---

## MCP (Model Context Protocol) Server

The erdmini server has a built-in MCP Streamable HTTP endpoint (`/mcp`). MCP is served from the same server process without a separate process. Server mode only.

### Prerequisites

1. Generate an API key from the **API Keys** tab in the Admin UI (`/admin`).
2. Copy the `erd_...` key displayed immediately after creation to a safe location (shown only once).

### Build

```bash
pnpm build:server     # SvelteKit server build (includes MCP)
pnpm start:server     # Start server (serves both web UI and MCP)
```

### Claude Desktop Configuration

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "erdmini": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer erd_<key generated from admin>"
      }
    }
  }
}
```

### Claude Code Configuration

```bash
claude mcp add --transport http erdmini http://localhost:3000/mcp \
  --header "Authorization: Bearer erd_<key generated from admin>"
```

### Available Tools

| Tool | Description | Minimum Permission |
|------|------|-----------|
| `list_projects` | List accessible projects | - |
| `get_schema` | ERD schema JSON | viewer |
| `export_ddl` | Generate DDL SQL (4 dialects) | viewer |
| `lint_schema` | Schema lint check | viewer |
| `export_diagram` | Mermaid / PlantUML | viewer |
| `add_table` | Add a table | editor |
| `update_table` | Update a table | editor |
| `delete_table` | Delete a table | editor |
| `add_column` | Add a column | editor |
| `update_column` | Update a column | editor |
| `delete_column` | Delete a column | editor |
| `add_foreign_key` | Add a FK | editor |
| `delete_foreign_key` | Delete a FK | editor |
| `import_ddl` | Import DDL SQL | editor |

### Using MCP with Docker

When deployed via Docker, MCP is served on the same port with no additional configuration:

```
http://localhost:3000/mcp   <- MCP Streamable HTTP
http://localhost:3000/      <- Web UI
ws://localhost:3000/ws      <- Real-time collaboration
```
