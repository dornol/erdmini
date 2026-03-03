import type { ProjectIndex, ERDSchema } from '$lib/types/erd';
import type { CanvasData, StorageProvider } from './types';

export class ServerStorageProvider implements StorageProvider {
  async loadIndex(): Promise<ProjectIndex | null> {
    const res = await fetch('/api/storage/index');
    if (!res.ok) return null;
    const data = await res.json();
    return data as ProjectIndex;
  }

  async saveIndex(index: ProjectIndex): Promise<void> {
    await fetch('/api/storage/index', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(index),
    });
  }

  async loadSchema(projectId: string): Promise<ERDSchema | null> {
    const res = await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}`);
    if (!res.ok) return null;
    return (await res.json()) as ERDSchema;
  }

  async saveSchema(projectId: string, schema: ERDSchema): Promise<void> {
    await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schema),
    });
  }

  async deleteSchema(projectId: string): Promise<void> {
    await fetch(`/api/storage/schemas/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
  }

  async loadCanvasState(projectId: string): Promise<CanvasData | null> {
    const res = await fetch(`/api/storage/canvas/${encodeURIComponent(projectId)}`);
    if (!res.ok) return null;
    return (await res.json()) as CanvasData;
  }

  async saveCanvasState(projectId: string, data: CanvasData): Promise<void> {
    await fetch(`/api/storage/canvas/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async deleteCanvasState(projectId: string): Promise<void> {
    await fetch(`/api/storage/canvas/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
  }

  async loadLegacySchema(): Promise<string | null> {
    // Server mode has no legacy data
    return null;
  }

  async deleteLegacyKey(): Promise<void> {
    // No-op for server mode
  }
}
