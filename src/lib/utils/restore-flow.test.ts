import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRestoreFlow, type RestoreFlowDeps } from './restore-flow';

function makeDeps(overrides: Partial<RestoreFlowDeps> = {}): RestoreFlowDeps {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    exportAll: vi.fn().mockResolvedValue('{"current":"state"}'),
    download: vi.fn(),
    importAll: vi.fn().mockResolvedValue({ ok: true }),
    now: () => new Date(2026, 3, 27, 14, 30, 15), // 2026-04-27 14:30:15
    ...overrides,
  };
}

describe('runRestoreFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels without calling exportAll/download/importAll when confirm is false', async () => {
    const deps = makeDeps({ confirm: vi.fn().mockResolvedValue(false) });
    const outcome = await runRestoreFlow('{"backup":"data"}', deps);

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(deps.exportAll).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.importAll).not.toHaveBeenCalled();
  });

  it('does not call importAll when pre-export throws (safety net required)', async () => {
    const deps = makeDeps({
      exportAll: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    const outcome = await runRestoreFlow('{"backup":"data"}', deps);

    expect(outcome).toEqual({ kind: 'pre-export-failed', error: 'disk full' });
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.importAll).not.toHaveBeenCalled();
  });

  it('coerces non-Error pre-export rejection to string error', async () => {
    const deps = makeDeps({
      exportAll: vi.fn().mockRejectedValue('network timeout'),
    });
    const outcome = await runRestoreFlow('{"backup":"data"}', deps);

    expect(outcome).toEqual({ kind: 'pre-export-failed', error: 'network timeout' });
  });

  it('runs confirm → exportAll → download → importAll in order on the happy path', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      confirm: vi.fn(async () => { calls.push('confirm'); return true; }),
      exportAll: vi.fn(async () => { calls.push('exportAll'); return '{"current":"state"}'; }),
      download: vi.fn(() => { calls.push('download'); }),
      importAll: vi.fn(async () => { calls.push('importAll'); return { ok: true }; }),
    });

    await runRestoreFlow('{"backup":"data"}', deps);

    expect(calls).toEqual(['confirm', 'exportAll', 'download', 'importAll']);
    expect(deps.download).toHaveBeenCalledWith('{"current":"state"}', expect.stringMatching(/^erdmini_pre_restore_/));
    expect(deps.importAll).toHaveBeenCalledWith('{"backup":"data"}');
  });

  it('formats download filename as erdmini_pre_restore_YYYY-MM-DD_HHMMSS.json', async () => {
    const deps = makeDeps({
      now: () => new Date(2026, 3, 27, 14, 30, 15), // April = month index 3
    });
    await runRestoreFlow('{"backup":"data"}', deps);

    expect(deps.download).toHaveBeenCalledWith(
      '{"current":"state"}',
      'erdmini_pre_restore_2026-04-27_143015.json',
    );
  });

  it('zero-pads month/day/hour/minute/second in filename', async () => {
    const deps = makeDeps({
      now: () => new Date(2026, 0, 5, 3, 7, 9), // 2026-01-05 03:07:09
    });
    await runRestoreFlow('{"backup":"data"}', deps);

    expect(deps.download).toHaveBeenCalledWith(
      expect.any(String),
      'erdmini_pre_restore_2026-01-05_030709.json',
    );
  });

  it('uses real new Date() when deps.now is not provided', async () => {
    const deps: RestoreFlowDeps = {
      confirm: vi.fn().mockResolvedValue(true),
      exportAll: vi.fn().mockResolvedValue('{}'),
      download: vi.fn(),
      importAll: vi.fn().mockResolvedValue({ ok: true }),
    };
    await runRestoreFlow('{}', deps);

    expect(deps.download).toHaveBeenCalledWith(
      '{}',
      expect.stringMatching(/^erdmini_pre_restore_\d{4}-\d{2}-\d{2}_\d{6}\.json$/),
    );
  });

  it('propagates importAll failure result through outcome', async () => {
    const deps = makeDeps({
      importAll: vi.fn().mockResolvedValue({ ok: false, error: 'invalid backup' }),
    });
    const outcome = await runRestoreFlow('{"bad":"backup"}', deps);

    expect(outcome).toEqual({ kind: 'imported', ok: false, error: 'invalid backup' });
  });

  it('returns imported success outcome on full happy path', async () => {
    const deps = makeDeps();
    const outcome = await runRestoreFlow('{"backup":"data"}', deps);

    expect(outcome).toEqual({ kind: 'imported', ok: true, error: undefined });
  });

  it('still runs download even if backup JSON is empty string', async () => {
    const deps = makeDeps();
    await runRestoreFlow('', deps);

    expect(deps.download).toHaveBeenCalled();
    expect(deps.importAll).toHaveBeenCalledWith('');
  });
});
