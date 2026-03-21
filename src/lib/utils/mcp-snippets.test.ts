import { describe, it, expect } from 'vitest';
import { SNIPPET_TABS, getMcpUrl, getSnippet, getSnippetHint } from './mcp-snippets';

const TEST_KEY = 'erd_abc123def456';

describe('SNIPPET_TABS', () => {
  it('has 7 entries', () => {
    expect(SNIPPET_TABS).toHaveLength(7);
  });

  it('each tab has id and label', () => {
    for (const tab of SNIPPET_TABS) {
      expect(tab.id).toBeTruthy();
      expect(tab.label).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = SNIPPET_TABS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getMcpUrl', () => {
  it('returns localhost fallback when window is undefined', () => {
    expect(getMcpUrl()).toBe('http://localhost:3000/mcp');
  });
});

describe('getSnippet', () => {
  it('claude-code returns CLI command', () => {
    const snippet = getSnippet('claude-code', TEST_KEY);
    expect(snippet).toContain('claude mcp add');
    expect(snippet).toContain('--transport http');
    expect(snippet).toContain(TEST_KEY);
    expect(snippet).toContain('/mcp');
  });

  it('claude-desktop returns valid JSON with mcpServers wrapper', () => {
    const snippet = getSnippet('claude-desktop', TEST_KEY);
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.erdmini).toBeDefined();
    expect(parsed.mcpServers.erdmini.type).toBe('streamable-http');
    expect(parsed.mcpServers.erdmini.headers.Authorization).toBe(`Bearer ${TEST_KEY}`);
  });

  it('cursor returns valid JSON with mcpServers wrapper', () => {
    const snippet = getSnippet('cursor', TEST_KEY);
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.erdmini.type).toBe('streamable-http');
  });

  it('vscode returns valid JSON with servers wrapper', () => {
    const snippet = getSnippet('vscode', TEST_KEY);
    const parsed = JSON.parse(snippet);
    expect(parsed.servers).toBeDefined();
    expect(parsed.servers.erdmini.type).toBe('http');
    expect(parsed.servers.erdmini.headers.Authorization).toContain(TEST_KEY);
  });

  it('windsurf returns valid JSON with streamable-http type', () => {
    const snippet = getSnippet('windsurf', TEST_KEY);
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.erdmini.type).toBe('streamable-http');
  });

  it('cline returns valid JSON with streamable-http type', () => {
    const snippet = getSnippet('cline', TEST_KEY);
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.erdmini.type).toBe('streamable-http');
  });

  it('codex returns valid JSON with http type', () => {
    const snippet = getSnippet('codex', TEST_KEY);
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.erdmini.type).toBe('http');
  });

  it('unknown id returns empty string', () => {
    expect(getSnippet('unknown-agent', TEST_KEY)).toBe('');
  });

  it('all JSON snippets include the MCP URL', () => {
    const url = getMcpUrl();
    for (const tab of SNIPPET_TABS) {
      const snippet = getSnippet(tab.id, TEST_KEY);
      expect(snippet).toContain(url);
    }
  });

  it('all snippets include the API key', () => {
    for (const tab of SNIPPET_TABS) {
      const snippet = getSnippet(tab.id, TEST_KEY);
      expect(snippet).toContain(TEST_KEY);
    }
  });
});

describe('getSnippetHint', () => {
  it('returns hint for every tab', () => {
    for (const tab of SNIPPET_TABS) {
      const hint = getSnippetHint(tab.id);
      expect(hint).toBeTruthy();
    }
  });

  it('claude-code hint mentions terminal', () => {
    expect(getSnippetHint('claude-code')).toContain('terminal');
  });

  it('cursor hint mentions .cursor/mcp.json', () => {
    expect(getSnippetHint('cursor')).toBe('.cursor/mcp.json');
  });

  it('vscode hint mentions .vscode/mcp.json', () => {
    expect(getSnippetHint('vscode')).toBe('.vscode/mcp.json');
  });

  it('unknown id returns empty string', () => {
    expect(getSnippetHint('unknown')).toBe('');
  });
});
