import type { ProjectIndex, ERDSchema, SchemaSnapshot } from '$lib/types/erd';
import type { CanvasData, StorageProvider } from './types';

export class ServerStorageProvider implements StorageProvider {
  async loadIndex(): Promise<ProjectIndex | null> {
    const res = await fetch('/api/storage/index');
    if (!res.ok) return null;
    const data = await res.json();
    return data as ProjectIndex;
  }

  async saveIndex(index: ProjectIndex): Promise<void> {
    const res = await fetch('/api/storage/index', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(index),
    });
    if (!res.ok) throw new Error(`Failed to save index (${res.status})`);
  }

  async loadSchema(projectId: string): Promise<ERDSchema | null> {
    const res = await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}`);
    if (!res.ok) return null;
    return (await res.json()) as ERDSchema;
  }

  async saveSchema(projectId: string, schema: ERDSchema): Promise<void> {
    const res = await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schema),
    });
    if (!res.ok) {
      throw new Error(`Failed to save schema (${res.status})`);
    }
  }

  async deleteSchema(projectId: string): Promise<void> {
    const res = await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete schema (${res.status})`);
  }

  async loadCanvasState(projectId: string): Promise<CanvasData | null> {
    const res = await fetch(`/api/storage/canvas/${encodeURIComponent(projectId)}`);
    if (!res.ok) return null;
    return (await res.json()) as CanvasData;
  }

  async saveCanvasState(projectId: string, data: CanvasData): Promise<void> {
    const res = await fetch(`/api/storage/canvas/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to save canvas state (${res.status})`);
  }

  async deleteCanvasState(projectId: string): Promise<void> {
    const res = await fetch(`/api/storage/canvas/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete canvas state (${res.status})`);
  }

  async listSnapshots(projectId: string): Promise<SchemaSnapshot[]> {
    const res = await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}/snapshots`);
    if (!res.ok) return [];
    return (await res.json()) as SchemaSnapshot[];
  }

  async saveSnapshot(projectId: string, snapshot: SchemaSnapshot): Promise<void> {
    const res = await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) throw new Error(`Failed to save snapshot (${res.status})`);
  }

  async loadSnapshot(projectId: string, snapshotId: string): Promise<SchemaSnapshot | null> {
    const res = await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}`);
    if (!res.ok) return null;
    return (await res.json()) as SchemaSnapshot;
  }

  async deleteSnapshot(projectId: string, snapshotId: string): Promise<void> {
    const res = await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete snapshot (${res.status})`);
  }

  async loadLegacySchema(): Promise<string | null> {
    // Server mode has no legacy data
    return null;
  }

  async deleteLegacyKey(): Promise<void> {
    // No-op for server mode
  }
}
