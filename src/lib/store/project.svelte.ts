import type { ERDSchema, ProjectIndex, ProjectMeta } from '$lib/types/erd';
import { erdStore, defaultSchema, generateId, canvasState } from '$lib/store/erd.svelte';

const PROJECTS_KEY = 'erdmini_projects';
const LEGACY_KEY = 'erdmini_schema';

function schemaKey(projectId: string): string {
  return `erdmini_schema_${projectId}`;
}

function now(): string {
  return new Date().toISOString();
}

function migrateSchema(raw: string): ERDSchema {
  try {
    const parsed = JSON.parse(raw) as ERDSchema;
    if (!parsed.domains) parsed.domains = [];
    for (const table of parsed.tables) {
      if (!table.uniqueKeys) table.uniqueKeys = [];
      if (!table.indexes) table.indexes = [];
      for (const fk of table.foreignKeys) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = fk as any;
        if (r.columnId && !fk.columnIds) {
          fk.columnIds = [r.columnId];
          fk.referencedColumnIds = [r.referencedColumnId];
          delete r.columnId;
          delete r.referencedColumnId;
        }
      }
    }
    return parsed;
  } catch {
    return defaultSchema();
  }
}

class ProjectStore {
  index = $state<ProjectIndex>({ version: '1', activeProjectId: '', projects: [] });

  constructor() {
    if (typeof window === 'undefined') return;
    this.migrate();
  }

  private migrate() {
    const existingIndex = window.localStorage.getItem(PROJECTS_KEY);
    if (existingIndex) {
      // Already migrated
      try {
        this.index = JSON.parse(existingIndex) as ProjectIndex;
        // Load active project schema
        this.loadProjectSchema(this.index.activeProjectId);
      } catch {
        this.createDefaultProject();
      }
      return;
    }

    const legacySchema = window.localStorage.getItem(LEGACY_KEY);
    if (legacySchema) {
      // Migrate legacy single-schema
      const id = generateId();
      const ts = now();
      const meta: ProjectMeta = {
        id,
        name: 'My Project',
        createdAt: ts,
        updatedAt: ts,
        lastOpenedAt: ts,
      };
      this.index = { version: '1', activeProjectId: id, projects: [meta] };
      // Copy schema to new key
      const schema = migrateSchema(legacySchema);
      window.localStorage.setItem(schemaKey(id), JSON.stringify(schema));
      // Save project index
      this.saveIndex();
      // Remove legacy key
      window.localStorage.removeItem(LEGACY_KEY);
      // Load into erdStore
      erdStore.loadSchema(schema);
      return;
    }

    // Nothing exists — create default
    this.createDefaultProject();
  }

  private createDefaultProject() {
    const id = generateId();
    const ts = now();
    const meta: ProjectMeta = {
      id,
      name: 'My Project',
      createdAt: ts,
      updatedAt: ts,
      lastOpenedAt: ts,
    };
    this.index = { version: '1', activeProjectId: id, projects: [meta] };
    const schema = defaultSchema();
    window.localStorage.setItem(schemaKey(id), JSON.stringify(schema));
    this.saveIndex();
    erdStore.loadSchema(schema);
  }

  private loadProjectSchema(projectId: string) {
    const raw = window.localStorage.getItem(schemaKey(projectId));
    if (raw) {
      erdStore.loadSchema(migrateSchema(raw));
    } else {
      erdStore.loadSchema(defaultSchema());
    }
  }

  private saveIndex() {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify($state.snapshot(this.index)));
  }

  get activeProject(): ProjectMeta | undefined {
    return this.index.projects.find((p) => p.id === this.index.activeProjectId);
  }

  saveCurrentSchema() {
    const id = this.index.activeProjectId;
    if (!id) return;
    erdStore.saveToStorageAs(id);
    // Update meta timestamps
    const meta = this.index.projects.find((p) => p.id === id);
    if (meta) {
      meta.updatedAt = now();
      this.saveIndex();
    }
  }

  switchProject(id: string) {
    if (id === this.index.activeProjectId) return;
    // Save current project first
    this.saveCurrentSchema();
    // Reset canvas position
    canvasState.x = 0;
    canvasState.y = 0;
    canvasState.scale = 1;
    // Clear undo/redo history
    erdStore.clearHistory();
    // Update active project
    this.index.activeProjectId = id;
    const meta = this.index.projects.find((p) => p.id === id);
    if (meta) meta.lastOpenedAt = now();
    this.saveIndex();
    // Load target schema
    this.loadProjectSchema(id);
  }

  createProject(name: string) {
    // Save current project first
    this.saveCurrentSchema();
    const id = generateId();
    const ts = now();
    const meta: ProjectMeta = {
      id,
      name: name || 'My Project',
      createdAt: ts,
      updatedAt: ts,
      lastOpenedAt: ts,
    };
    this.index.projects = [...this.index.projects, meta];
    this.index.activeProjectId = id;
    // Write empty schema
    const schema = defaultSchema();
    window.localStorage.setItem(schemaKey(id), JSON.stringify(schema));
    this.saveIndex();
    // Reset canvas and load
    canvasState.x = 0;
    canvasState.y = 0;
    canvasState.scale = 1;
    erdStore.clearHistory();
    erdStore.loadSchema(schema);
  }

  renameProject(id: string, name: string) {
    const meta = this.index.projects.find((p) => p.id === id);
    if (!meta) return;
    meta.name = name;
    meta.updatedAt = now();
    this.saveIndex();
  }

  deleteProject(id: string) {
    if (this.index.projects.length <= 1) return;
    this.index.projects = this.index.projects.filter((p) => p.id !== id);
    // Remove schema from localStorage
    window.localStorage.removeItem(schemaKey(id));
    // If deleting active project, switch to first remaining
    if (this.index.activeProjectId === id) {
      const next = this.index.projects[0];
      this.index.activeProjectId = next.id;
      next.lastOpenedAt = now();
      this.saveIndex();
      canvasState.x = 0;
      canvasState.y = 0;
      canvasState.scale = 1;
      erdStore.clearHistory();
      this.loadProjectSchema(next.id);
    } else {
      this.saveIndex();
    }
  }

  createProjectWithSchema(name: string, schema: ERDSchema) {
    // Save current project first
    this.saveCurrentSchema();
    const id = generateId();
    const ts = now();
    const meta: ProjectMeta = {
      id,
      name: name || 'Shared Project',
      createdAt: ts,
      updatedAt: ts,
      lastOpenedAt: ts,
    };
    this.index.projects = [...this.index.projects, meta];
    this.index.activeProjectId = id;
    window.localStorage.setItem(schemaKey(id), JSON.stringify(schema));
    this.saveIndex();
    canvasState.x = 0;
    canvasState.y = 0;
    canvasState.scale = 1;
    erdStore.clearHistory();
    erdStore.loadSchema(schema);
  }

  duplicateProject(id: string) {
    const src = this.index.projects.find((p) => p.id === id);
    if (!src) return;
    // Save current if duplicating active
    if (id === this.index.activeProjectId) {
      this.saveCurrentSchema();
    }
    const newId = generateId();
    const ts = now();
    const meta: ProjectMeta = {
      id: newId,
      name: `${src.name} (copy)`,
      createdAt: ts,
      updatedAt: ts,
      lastOpenedAt: ts,
    };
    // Copy schema data
    const raw = window.localStorage.getItem(schemaKey(id));
    if (raw) {
      window.localStorage.setItem(schemaKey(newId), raw);
    } else {
      window.localStorage.setItem(schemaKey(newId), JSON.stringify(defaultSchema()));
    }
    this.index.projects = [...this.index.projects, meta];
    this.index.activeProjectId = newId;
    this.saveIndex();
    // Load duplicated schema
    canvasState.x = 0;
    canvasState.y = 0;
    canvasState.scale = 1;
    erdStore.clearHistory();
    this.loadProjectSchema(newId);
  }
}

export const projectStore = new ProjectStore();
