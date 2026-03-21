/** MCP configuration snippet generator for various AI agents */

export const SNIPPET_TABS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'windsurf', label: 'Windsurf' },
  { id: 'cline', label: 'Cline' },
  { id: 'codex', label: 'Codex' },
] as const;

export type SnippetId = (typeof SNIPPET_TABS)[number]['id'];

export function getMcpUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/mcp`;
  }
  return 'http://localhost:3000/mcp';
}

function mcpJson(key: string, url: string, wrapper: 'mcpServers' | 'servers', type: string): string {
  return JSON.stringify({
    [wrapper]: {
      erdmini: { type, url, headers: { Authorization: `Bearer ${key}` } },
    },
  }, null, 2);
}

export function getSnippet(id: string, key: string): string {
  const url = getMcpUrl();
  switch (id) {
    case 'claude-code':
      return `claude mcp add --transport http erdmini ${url} \\\n  --header "Authorization: Bearer ${key}"`;
    case 'vscode':
      return mcpJson(key, url, 'servers', 'http');
    case 'codex':
      return mcpJson(key, url, 'mcpServers', 'http');
    case 'claude-desktop':
    case 'cursor':
    case 'windsurf':
    case 'cline':
      return mcpJson(key, url, 'mcpServers', 'streamable-http');
    default:
      return '';
  }
}

export function getSnippetHint(id: string): string {
  switch (id) {
    case 'claude-code': return 'Run in terminal:';
    case 'claude-desktop': return '~/Library/Application Support/Claude/claude_desktop_config.json';
    case 'cursor': return '.cursor/mcp.json';
    case 'vscode': return '.vscode/mcp.json';
    case 'windsurf': return '~/.codeium/windsurf/mcp_config.json';
    case 'cline': return 'Cline Settings → MCP Servers → Add';
    case 'codex': return 'codex --mcp-config mcp.json';
    default: return '';
  }
}
