import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServerStorageProvider } from './server-storage-provider';
import type { ERDSchema, SchemaSnapshot } from '$lib/types/erd';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function emptySchema(): ERDSchema {
  return {
    version: '1',
    tables: [],
    domains: [],
    memos: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

describe('ServerStorageProvider', () => {
  let provider: ServerStorageProvider;

  beforeEach(() => {
    provider = new ServerStorageProvider();
    mockFetch.mockReset();
  });

  // ─── Index ───

  describe('loadIndex', () => {
    it('returns index on success', async () => {
      const index = { version: '1', activeProjectId: 'p1', projects: [] };
      mockFetch.mockResolvedValue(jsonResponse(index));

      const result = await provider.loadIndex();
      expect(result).toEqual(index);
      expect(mockFetch).toHaveBeenCalledWith('/api/storage/index');
    });

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, 500));
      expect(await provider.loadIndex()).toBeNull();
    });
  });

  describe('saveIndex', () => {
    it('sends PUT with JSON body', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      const index = { version: '1', activeProjectId: 'p1', projects: [] };

      await provider.saveIndex(index);

      expect(mockFetch).toHaveBeenCalledWith('/api/storage/index', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(index),
      });
    });
  });

  // ─── Schema ───

  describe('loadSchema', () => {
    it('returns schema on success', async () => {
      const schema = emptySchema();
      mockFetch.mockResolvedValue(jsonResponse(schema));

      const result = await provider.loadSchema('proj1');
      expect(result).toEqual(schema);
    });

    it('encodes projectId in URL', async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, 404));
      await provider.loadSchema('project with spaces');
      expect(mockFetch).toHaveBeenCalledWith('/api/storage/schemas/project%20with%20spaces');
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, 404));
      expect(await provider.loadSchema('nonexistent')).toBeNull();
    });
  });

  describe('saveSchema', () => {
    it('sends PUT with schema JSON', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      const schema = emptySchema();

      await provider.saveSchema('proj1', schema);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/schemas/proj1',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });

  describe('deleteSchema', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await provider.deleteSchema('proj1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/schemas/proj1',
        { method: 'DELETE' },
      );
    });
  });

  // ─── Canvas State ───

  describe('loadCanvasState', () => {
    it('returns canvas data', async () => {
      const data = { x: 100, y: 200, scale: 1.5 };
      mockFetch.mockResolvedValue(jsonResponse(data));

      const result = await provider.loadCanvasState('proj1');
      expect(result).toEqual(data);
    });

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, 404));
      expect(await provider.loadCanvasState('proj1')).toBeNull();
    });
  });

  describe('saveCanvasState', () => {
    it('sends PUT with canvas data', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await provider.saveCanvasState('proj1', { x: 10, y: 20, scale: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/canvas/proj1',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  describe('deleteCanvasState', () => {
    it('sends DELETE', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      await provider.deleteCanvasState('proj1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/canvas/proj1',
        { method: 'DELETE' },
      );
    });
  });

  // ─── Snapshots ───

  describe('listSnapshots', () => {
    it('returns snapshot list', async () => {
      const snapshots: SchemaSnapshot[] = [
        { id: 's1', name: 'v1', snap: '{}', createdAt: 1000 },
        { id: 's2', name: 'v2', snap: '{}', createdAt: 2000 },
      ];
      mockFetch.mockResolvedValue(jsonResponse(snapshots));

      const result = await provider.listSnapshots('proj1');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('v1');
    });

    it('returns empty array on error', async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, 500));
      const result = await provider.listSnapshots('proj1');
      expect(result).toEqual([]);
    });

    it('encodes projectId in URL', async () => {
      mockFetch.mockResolvedValue(jsonResponse([]));
      await provider.listSnapshots('proj/special');
      expect(mockFetch).toHaveBeenCalledWith('/api/storage/schemas/proj%2Fspecial/snapshots');
    });
  });

  describe('saveSnapshot', () => {
    it('sends POST with snapshot data', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
      const snap: SchemaSnapshot = { id: 's1', name: 'test', snap: '{}', createdAt: Date.now() };

      await provider.saveSnapshot('proj1', snap);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/schemas/proj1/snapshots',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snap),
        },
      );
    });
  });

  describe('loadSnapshot', () => {
    it('returns snapshot on success', async () => {
      const snap: SchemaSnapshot = { id: 's1', name: 'test', snap: '{"v":1}', createdAt: 1000 };
      mockFetch.mockResolvedValue(jsonResponse(snap));

      const result = await provider.loadSnapshot('proj1', 's1');
      expect(result).toEqual(snap);
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, 404));
      expect(await provider.loadSnapshot('proj1', 'nonexistent')).toBeNull();
    });

    it('encodes both projectId and snapshotId', async () => {
      mockFetch.mockResolvedValue(jsonResponse(null, 404));
      await provider.loadSnapshot('proj/1', 'snap/2');
      expect(mockFetch).toHaveBeenCalledWith('/api/storage/schemas/proj%2F1/snapshots/snap%2F2');
    });
  });

  describe('deleteSnapshot', () => {
    it('sends DELETE with correct URL', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await provider.deleteSnapshot('proj1', 'snap1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/schemas/proj1/snapshots/snap1',
        { method: 'DELETE' },
      );
    });
  });

  // ─── Legacy ───

  describe('loadLegacySchema', () => {
    it('always returns null (server has no legacy)', async () => {
      expect(await provider.loadLegacySchema()).toBeNull();
    });
  });

  describe('deleteLegacyKey', () => {
    it('is a no-op', async () => {
      await expect(provider.deleteLegacyKey()).resolves.toBeUndefined();
    });
  });
});
