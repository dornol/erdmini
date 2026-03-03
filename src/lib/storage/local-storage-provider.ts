import type { ProjectIndex, ERDSchema } from '$lib/types/erd';
import type { CanvasData, StorageProvider } from './types';

const DB_NAME = 'erdmini';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_SCHEMAS = 'schemas';
const STORE_CANVAS = 'canvas';

const PROJECTS_INDEX_KEY = 'index';

// Legacy localStorage keys (for migration)
const LS_PROJECTS_KEY = 'erdmini_projects';
const LS_LEGACY_KEY = 'erdmini_schema';

function lsSchemaKey(projectId: string): string {
	return `erdmini_schema_${projectId}`;
}

function lsCanvasKey(projectId: string): string {
	return `erdmini_canvas_${projectId}`;
}

export class LocalStorageProvider implements StorageProvider {
	private dbPromise: Promise<IDBDatabase> | null = null;

	private openDB(): Promise<IDBDatabase> {
		if (this.dbPromise) return this.dbPromise;

		this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
					db.createObjectStore(STORE_PROJECTS);
				}
				if (!db.objectStoreNames.contains(STORE_SCHEMAS)) {
					db.createObjectStore(STORE_SCHEMAS);
				}
				if (!db.objectStoreNames.contains(STORE_CANVAS)) {
					db.createObjectStore(STORE_CANVAS);
				}
			};

			request.onsuccess = () => {
				const db = request.result;
				db.onclose = () => {
					this.dbPromise = null;
				};
				this.migrateFromLocalStorage(db).then(() => resolve(db));
			};

			request.onerror = () => {
				this.dbPromise = null;
				reject(request.error);
			};
		});

		return this.dbPromise;
	}

	private async migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
		const raw = window.localStorage.getItem(LS_PROJECTS_KEY);
		if (!raw) return;

		let index: ProjectIndex;
		try {
			index = JSON.parse(raw) as ProjectIndex;
		} catch {
			return;
		}

		const tx = db.transaction(
			[STORE_PROJECTS, STORE_SCHEMAS, STORE_CANVAS],
			'readwrite'
		);
		const projectsStore = tx.objectStore(STORE_PROJECTS);
		const schemasStore = tx.objectStore(STORE_SCHEMAS);
		const canvasStore = tx.objectStore(STORE_CANVAS);

		// Migrate project index
		projectsStore.put(index, PROJECTS_INDEX_KEY);

		// Migrate each project's schema and canvas
		const keysToRemove: string[] = [LS_PROJECTS_KEY];

		for (const project of index.projects) {
			const schemaRaw = window.localStorage.getItem(lsSchemaKey(project.id));
			if (schemaRaw) {
				try {
					schemasStore.put(JSON.parse(schemaRaw), project.id);
				} catch {
					// skip corrupted data
				}
				keysToRemove.push(lsSchemaKey(project.id));
			}

			const canvasRaw = window.localStorage.getItem(lsCanvasKey(project.id));
			if (canvasRaw) {
				try {
					canvasStore.put(JSON.parse(canvasRaw), project.id);
				} catch {
					// skip corrupted data
				}
				keysToRemove.push(lsCanvasKey(project.id));
			}
		}

		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => {
				// Remove migrated keys from localStorage
				for (const key of keysToRemove) {
					window.localStorage.removeItem(key);
				}
				resolve();
			};
			tx.onerror = () => reject(tx.error);
		});
	}

	private idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
		return this.openDB().then(
			(db) =>
				new Promise<T | null>((resolve, reject) => {
					const tx = db.transaction(storeName, 'readonly');
					const req = tx.objectStore(storeName).get(key);
					req.onsuccess = () => resolve((req.result as T) ?? null);
					req.onerror = () => reject(req.error);
				})
		);
	}

	private idbPut(
		storeName: string,
		key: IDBValidKey,
		value: unknown
	): Promise<void> {
		return this.openDB().then(
			(db) =>
				new Promise<void>((resolve, reject) => {
					const tx = db.transaction(storeName, 'readwrite');
					tx.objectStore(storeName).put(value, key);
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				})
		);
	}

	private idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
		return this.openDB().then(
			(db) =>
				new Promise<void>((resolve, reject) => {
					const tx = db.transaction(storeName, 'readwrite');
					tx.objectStore(storeName).delete(key);
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				})
		);
	}

	async loadIndex(): Promise<ProjectIndex | null> {
		return this.idbGet<ProjectIndex>(STORE_PROJECTS, PROJECTS_INDEX_KEY);
	}

	async saveIndex(index: ProjectIndex): Promise<void> {
		return this.idbPut(STORE_PROJECTS, PROJECTS_INDEX_KEY, index);
	}

	async loadSchema(projectId: string): Promise<ERDSchema | null> {
		return this.idbGet<ERDSchema>(STORE_SCHEMAS, projectId);
	}

	async saveSchema(projectId: string, schema: ERDSchema): Promise<void> {
		return this.idbPut(STORE_SCHEMAS, projectId, schema);
	}

	async deleteSchema(projectId: string): Promise<void> {
		return this.idbDelete(STORE_SCHEMAS, projectId);
	}

	async loadCanvasState(projectId: string): Promise<CanvasData | null> {
		return this.idbGet<CanvasData>(STORE_CANVAS, projectId);
	}

	async saveCanvasState(projectId: string, data: CanvasData): Promise<void> {
		return this.idbPut(STORE_CANVAS, projectId, data);
	}

	async deleteCanvasState(projectId: string): Promise<void> {
		return this.idbDelete(STORE_CANVAS, projectId);
	}

	async loadLegacySchema(): Promise<string | null> {
		return window.localStorage.getItem(LS_LEGACY_KEY);
	}

	async deleteLegacyKey(): Promise<void> {
		window.localStorage.removeItem(LS_LEGACY_KEY);
	}
}
