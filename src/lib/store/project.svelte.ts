import type { ERDSchema, ProjectIndex, ProjectMeta } from '$lib/types/erd';
import type { StorageProvider } from '$lib/storage/types';
import { erdStore, defaultSchema, canvasState } from '$lib/store/erd.svelte';
import { snapshotStore } from '$lib/store/snapshot.svelte';
import { generateId, now } from '$lib/utils/common';

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
  private _initialized = $state(false);
  private provider!: StorageProvider;
  private _saving = false;

  get initialized(): boolean {
    return this._initialized;
  }

  async init(provider: StorageProvider) {
    this.provider = provider;
    await this.migrate();
    this._initialized = true;
  }

  private async migrate() {
    const existingIndex = await this.provider.loadIndex();
    if (existingIndex) {
      this.index = existingIndex;
      await this.loadProjectSchema(this.index.activeProjectId);
      return;
    }

    const legacyRaw = await this.provider.loadLegacySchema();
    if (legacyRaw) {
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
      const schema = migrateSchema(legacyRaw);
      await this.provider.saveSchema(id, schema);
      await this.saveIndex();
      await this.provider.deleteLegacyKey();
      erdStore.loadSchema(schema);
      return;
    }

    await this.createDefaultProject();
  }

  private async createDefaultProject() {
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
    await this.provider.saveSchema(id, schema);
    await this.saveIndex();
    erdStore.loadSchema(schema);
  }

  private async loadProjectSchema(projectId: string) {
    const schema = await this.provider.loadSchema(projectId);
    if (schema) {
      erdStore.loadSchema(migrateSchema(JSON.stringify(schema)));
    } else {
      erdStore.loadSchema(defaultSchema());
    }
    const canvas = await this.provider.loadCanvasState(projectId);
    if (canvas) {
      canvasState.x = canvas.x ?? 0;
      canvasState.y = canvas.y ?? 0;
      canvasState.scale = canvas.scale ?? 1;
    } else {
      canvasState.x = 0;
      canvasState.y = 0;
      canvasState.scale = 1;
    }
  }

  private async saveIndex() {
    await this.provider.saveIndex($state.snapshot(this.index) as ProjectIndex);
  }

  get activeProject(): ProjectMeta | undefined {
    return this.index.projects.find((p) => p.id === this.index.activeProjectId);
  }

  async saveCurrentSchema() {
    const id = this.index.activeProjectId;
    if (!id || this._saving) return;
    this._saving = true;
    try {
      const schema = $state.snapshot(erdStore.schema) as ERDSchema;
      await this.provider.saveSchema(id, schema);
      await this.provider.saveCanvasState(id, {
        x: canvasState.x, y: canvasState.y, scale: canvasState.scale,
      });
      erdStore.storageFull = false;
      const meta = this.index.projects.find((p) => p.id === id);
      if (meta) {
        meta.updatedAt = now();
        await this.saveIndex();
      }
    } catch {
      erdStore.storageFull = true;
    } finally {
      this._saving = false;
    }
  }

  async switchProject(id: string) {
    if (id === this.index.activeProjectId) return;
    await this.saveCurrentSchema();
    erdStore.clearHistory();
    this.index.activeProjectId = id;
    const meta = this.index.projects.find((p) => p.id === id);
    if (meta) meta.lastOpenedAt = now();
    await this.saveIndex();
    await this.loadProjectSchema(id);
    await snapshotStore.init(this.provider, id);
  }

  async createProject(name: string) {
    await this.saveCurrentSchema();
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
    const schema = defaultSchema();
    await this.provider.saveSchema(id, schema);
    await this.saveIndex();
    erdStore.clearHistory();
    erdStore.loadSchema(schema);
    await snapshotStore.init(this.provider, id);
  }

  async renameProject(id: string, name: string) {
    const meta = this.index.projects.find((p) => p.id === id);
    if (!meta) return;
    meta.name = name;
    meta.updatedAt = now();
    await this.saveIndex();
  }

  async deleteProject(id: string) {
    if (this.index.projects.length <= 1) return;
    this.index.projects = this.index.projects.filter((p) => p.id !== id);
    await this.provider.deleteSchema(id);
    await this.provider.deleteCanvasState(id);
    if (this.index.activeProjectId === id) {
      const next = this.index.projects[0];
      this.index.activeProjectId = next.id;
      next.lastOpenedAt = now();
      await this.saveIndex();
      erdStore.clearHistory();
      await this.loadProjectSchema(next.id);
      await snapshotStore.init(this.provider, next.id);
    } else {
      await this.saveIndex();
    }
  }

  async loadSharedProject(projectId: string, name: string, schema: ERDSchema) {
    await this.saveCurrentSchema();
    // Check if project already exists in our index
    const existing = this.index.projects.find((p) => p.id === projectId);
    if (existing) {
      // Already exists — just switch to it
      await this.switchProject(projectId);
      return;
    }
    // Add as a new project entry pointing to the shared schema
    const ts = now();
    const meta: ProjectMeta = {
      id: projectId,
      name: `[shared] ${name}`,
      createdAt: ts,
      updatedAt: ts,
      lastOpenedAt: ts,
    };
    this.index.projects = [...this.index.projects, meta];
    this.index.activeProjectId = projectId;
    await this.saveIndex();
    erdStore.clearHistory();
    erdStore.loadSchema(schema);
    // Load canvas state if available
    const canvas = await this.provider.loadCanvasState(projectId);
    if (canvas) {
      canvasState.x = canvas.x ?? 0;
      canvasState.y = canvas.y ?? 0;
      canvasState.scale = canvas.scale ?? 1;
    } else {
      canvasState.x = 0;
      canvasState.y = 0;
      canvasState.scale = 1;
    }
  }

  async createProjectWithSchema(name: string, schema: ERDSchema) {
    await this.saveCurrentSchema();
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
    await this.provider.saveSchema(id, schema);
    await this.saveIndex();
    erdStore.clearHistory();
    erdStore.loadSchema(schema);
  }

  async exportAll(): Promise<string> {
    await this.saveCurrentSchema();
    const backup: Record<string, unknown> = {
      _type: 'erdmini_backup',
      _version: 1,
      index: $state.snapshot(this.index),
      schemas: {} as Record<string, unknown>,
    };
    const schemas = backup.schemas as Record<string, unknown>;
    for (const proj of this.index.projects) {
      const schema = await this.provider.loadSchema(proj.id);
      schemas[proj.id] = schema ?? null;
    }
    return JSON.stringify(backup, null, 2);
  }

  async importAll(json: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const backup = JSON.parse(json);
      if (backup._type !== 'erdmini_backup') {
        return { ok: false, error: 'Invalid backup file' };
      }
      const index = backup.index as ProjectIndex;
      const schemas = backup.schemas as Record<string, unknown>;
      if (!index?.projects?.length) {
        return { ok: false, error: 'No projects in backup' };
      }
      for (const proj of index.projects) {
        const schema = schemas[proj.id];
        if (schema) {
          await this.provider.saveSchema(proj.id, schema as ERDSchema);
        }
      }
      this.index = index;
      await this.saveIndex();
      erdStore.clearHistory();
      await this.loadProjectSchema(this.index.activeProjectId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async duplicateProject(id: string) {
    const src = this.index.projects.find((p) => p.id === id);
    if (!src) return;
    if (id === this.index.activeProjectId) {
      await this.saveCurrentSchema();
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
    const schema = await this.provider.loadSchema(id);
    await this.provider.saveSchema(newId, schema ?? defaultSchema());
    this.index.projects = [...this.index.projects, meta];
    this.index.activeProjectId = newId;
    await this.saveIndex();
    erdStore.clearHistory();
    await this.loadProjectSchema(newId);
  }
}

export const projectStore = new ProjectStore();
