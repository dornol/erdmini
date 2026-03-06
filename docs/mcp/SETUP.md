# MCP Setup Guide

erdmini server has a built-in MCP (Model Context Protocol) Streamable HTTP endpoint at `/mcp` with 66 tools. Server mode only — local mode does not support MCP.

```
http://localhost:3000/mcp   ← MCP endpoint
http://localhost:3000/      ← Web UI
ws://localhost:3000/ws      ← Real-time collaboration
```

---

## Prerequisites

1. erdmini running in **server mode** (`PUBLIC_STORAGE_MODE=server`)
2. An admin account (created automatically on first run)
3. An API key generated from the Admin UI

---

## 1. Generate an API Key

1. Log in to erdmini as admin
2. Go to Admin page (`/admin`)
3. Open the **API Keys** tab
4. Click **Create API Key**
   - Name: descriptive label (e.g. "Claude Desktop", "CI/CD")
   - Scopes (optional): restrict to specific projects + permission level
5. Copy the `erd_...` key immediately — it is **shown only once**

### API Key Format

```
erd_<64 hex characters>
```

The key is stored as a SHA-256 hash in the database. The raw key cannot be recovered after creation.

### Scoped vs Unrestricted Keys

| Type | Behavior |
|---|---|
| **Unrestricted** (no scopes) | Access all projects the key owner can access |
| **Scoped** | Limited to specific projects with explicit permission level (viewer/editor) |

---

## 2. Client Configuration

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "erdmini": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer erd_<your-api-key>"
      }
    }
  }
}
```

Restart Claude Desktop after editing.

### Claude Code

```bash
claude mcp add --transport http erdmini http://localhost:3000/mcp \
  --header "Authorization: Bearer erd_<your-api-key>"
```

To verify:

```bash
claude mcp list
```

### Cursor

In Cursor settings, add an MCP server:

- **Type**: HTTP
- **URL**: `http://localhost:3000/mcp`
- **Headers**: `Authorization: Bearer erd_<your-api-key>`

### Other MCP Clients

Any MCP client that supports Streamable HTTP transport can connect. Required:

- **Method**: `POST`
- **URL**: `http://<host>:<port>/mcp`
- **Header**: `Authorization: Bearer erd_<api-key>`
- **Content-Type**: `application/json`

---

## 3. Docker Environment

When deployed via Docker, MCP runs on the same port with no additional setup:

```bash
docker compose up -d
docker compose logs erdmini | grep Password  # get admin password
```

Then generate an API key via the Admin UI at `http://localhost:3000/admin`.

For remote Docker deployments, use the public URL:

```json
{
  "mcpServers": {
    "erdmini": {
      "type": "streamable-http",
      "url": "https://erd.example.com/mcp",
      "headers": {
        "Authorization": "Bearer erd_<your-api-key>"
      }
    }
  }
}
```

---

## 4. Permission Model

MCP tools enforce the same permission model as the Web UI:

| Permission | Read tools | Write tools | Admin tools |
|---|---|---|---|
| **viewer** | All read tools | Denied | Denied |
| **editor** | All read tools | All write tools | Denied |
| **owner** | All read tools | All write tools | - |
| **admin** (user role) | All | All | All |

Scoped API keys further restrict access to specific projects.

---

## 5. Transport Details

erdmini uses **stateless Streamable HTTP** transport:

- `POST /mcp` — Execute tool calls (main endpoint)
- `GET /mcp` — Not supported (returns 405; SSE streaming disabled in stateless mode)
- `DELETE /mcp` — No-op (returns 200; no server-side sessions)

Each POST request creates a fresh MCP server instance. No session state is maintained between requests.

---

## Troubleshooting

### "Missing or invalid Authorization header"

- Ensure the header is `Authorization: Bearer erd_xxx` (note the space after "Bearer")
- Check that the key starts with `erd_`

### "Invalid or expired API key"

- The API key may have been deleted in Admin UI
- If the key has an expiration date, it may have expired
- Generate a new key from Admin UI

### "Access denied: requires 'editor' permission"

- The API key only has `viewer` permission on this project
- Either update the key's scopes or use an unrestricted key with editor access

### Connection refused

- Verify erdmini is running in server mode (`PUBLIC_STORAGE_MODE=server`)
- Check the port (default 3000)
- For Docker: ensure the port is mapped (`-p 3000:3000`)

### HTTPS / Reverse Proxy

When behind a reverse proxy, ensure the proxy forwards the `Authorization` header:

```nginx
location /mcp {
    proxy_pass http://localhost:3000/mcp;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header Host $host;
}
```
