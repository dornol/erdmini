import type { ProjectIndex, ERDSchema } from '$lib/types/erd';

export interface CanvasData {
  x: number;
  y: number;
  scale: number;
}

export interface StorageProvider {
  loadIndex(): Promise<ProjectIndex | null>;
  saveIndex(index: ProjectIndex): Promise<void>;

  loadSchema(projectId: string): Promise<ERDSchema | null>;
  saveSchema(projectId: string, schema: ERDSchema): Promise<void>;
  deleteSchema(projectId: string): Promise<void>;

  loadCanvasState(projectId: string): Promise<CanvasData | null>;
  saveCanvasState(projectId: string, data: CanvasData): Promise<void>;
  deleteCanvasState(projectId: string): Promise<void>;

  /** Load legacy single-schema (pre-project migration) */
  loadLegacySchema(): Promise<string | null>;
  deleteLegacyKey(): Promise<void>;
}
