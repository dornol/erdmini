import type { ProjectIndex, ERDSchema } from '$lib/types/erd';
import type { CanvasData, StorageProvider } from './types';

const PROJECTS_KEY = 'erdmini_projects';
const LEGACY_KEY = 'erdmini_schema';

function schemaKey(projectId: string): string {
  return `erdmini_schema_${projectId}`;
}

function canvasKey(projectId: string): string {
  return `erdmini_canvas_${projectId}`;
}

export class LocalStorageProvider implements StorageProvider {
  async loadIndex(): Promise<ProjectIndex | null> {
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ProjectIndex;
    } catch {
      return null;
    }
  }

  async saveIndex(index: ProjectIndex): Promise<void> {
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(index));
  }

  async loadSchema(projectId: string): Promise<ERDSchema | null> {
    const raw = window.localStorage.getItem(schemaKey(projectId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ERDSchema;
    } catch {
      return null;
    }
  }

  async saveSchema(projectId: string, schema: ERDSchema): Promise<void> {
    window.localStorage.setItem(schemaKey(projectId), JSON.stringify(schema));
  }

  async deleteSchema(projectId: string): Promise<void> {
    window.localStorage.removeItem(schemaKey(projectId));
  }

  async loadCanvasState(projectId: string): Promise<CanvasData | null> {
    const raw = window.localStorage.getItem(canvasKey(projectId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CanvasData;
    } catch {
      return null;
    }
  }

  async saveCanvasState(projectId: string, data: CanvasData): Promise<void> {
    window.localStorage.setItem(canvasKey(projectId), JSON.stringify(data));
  }

  async deleteCanvasState(projectId: string): Promise<void> {
    window.localStorage.removeItem(canvasKey(projectId));
  }

  async loadLegacySchema(): Promise<string | null> {
    return window.localStorage.getItem(LEGACY_KEY);
  }

  async deleteLegacyKey(): Promise<void> {
    window.localStorage.removeItem(LEGACY_KEY);
  }
}
