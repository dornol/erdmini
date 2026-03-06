import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set up minimal DOM mocks before importing
const mockTextarea = {
  value: '',
  style: {} as Record<string, string>,
  select: vi.fn(),
};

const bodyChildren: unknown[] = [];
const mockBody = {
  appendChild: vi.fn((node: unknown) => { bodyChildren.push(node); return node; }),
  removeChild: vi.fn((node: unknown) => { const i = bodyChildren.indexOf(node); if (i >= 0) bodyChildren.splice(i, 1); return node; }),
};

vi.stubGlobal('document', {
  createElement: vi.fn(() => ({ ...mockTextarea })),
  execCommand: vi.fn(() => true),
  body: mockBody,
});

import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bodyChildren.length = 0;
  });

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await copyToClipboard('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result).toBe(true);
  });

  it('falls back to execCommand when clipboard API throws', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    (document.execCommand as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await copyToClipboard('fallback text');
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('falls back to execCommand when clipboard API is undefined', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    (document.execCommand as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await copyToClipboard('no clipboard');
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('returns false when execCommand returns false', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    (document.execCommand as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await copyToClipboard('fail');
    expect(result).toBe(false);
  });

  it('returns false when execCommand throws', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    (document.execCommand as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('not allowed'); });

    const result = await copyToClipboard('error');
    expect(result).toBe(false);
  });

  it('cleans up textarea from DOM after fallback copy', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    (document.execCommand as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await copyToClipboard('cleanup');
    expect(mockBody.appendChild).toHaveBeenCalledTimes(1);
    expect(mockBody.removeChild).toHaveBeenCalledTimes(1);
  });

  it('cleans up textarea even when execCommand throws', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    (document.execCommand as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error(); });

    await copyToClipboard('cleanup error');
    expect(mockBody.removeChild).toHaveBeenCalledTimes(1);
  });
});
