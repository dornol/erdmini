import type { SchemaSnapshot, ERDSchema } from '$lib/types/erd';
import type { StorageProvider } from '$lib/storage/types';
import { erdStore } from '$lib/store/erd.svelte';
import { generateId } from '$lib/utils/common';

export const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_AUTO_SNAPSHOTS = 50;

class SnapshotStore {
	snapshots = $state<SchemaSnapshot[]>([]);
	private provider!: StorageProvider;
	private projectId = '';

	async init(provider: StorageProvider, projectId: string) {
		this.provider = provider;
		this.projectId = projectId;
		this.snapshots = await provider.listSnapshots(projectId);
	}

	async create(name: string, description?: string) {
		const snapshot: SchemaSnapshot = {
			id: generateId(),
			name,
			description: description || undefined,
			snap: JSON.stringify($state.snapshot(erdStore.schema)),
			createdAt: Date.now(),
		};
		await this.provider.saveSnapshot(this.projectId, snapshot);
		this.snapshots = [snapshot, ...this.snapshots];
	}

	async createAuto(name: string) {
		const snapshot: SchemaSnapshot = {
			id: generateId(),
			name,
			snap: JSON.stringify($state.snapshot(erdStore.schema)),
			createdAt: Date.now(),
			isAuto: true,
		};
		await this.provider.saveSnapshot(this.projectId, snapshot);
		this.snapshots = [snapshot, ...this.snapshots];

		// Prune oldest auto snapshots exceeding limit (manual snapshots untouched)
		const autoSnapshots = this.snapshots.filter((s) => s.isAuto);
		if (autoSnapshots.length > MAX_AUTO_SNAPSHOTS) {
			const toDelete = autoSnapshots.slice(MAX_AUTO_SNAPSHOTS); // oldest ones (list is desc by createdAt)
			for (const s of toDelete) {
				await this.provider.deleteSnapshot(this.projectId, s.id);
			}
			const deleteIds = new Set(toDelete.map((s) => s.id));
			this.snapshots = this.snapshots.filter((s) => !deleteIds.has(s.id));
		}
	}

	async restore(snapshotId: string) {
		const snapshot = await this.provider.loadSnapshot(this.projectId, snapshotId);
		if (!snapshot) return;
		const schema = JSON.parse(snapshot.snap) as ERDSchema;
		erdStore.loadSchema(schema);
		erdStore.clearHistory();
	}

	async remove(snapshotId: string) {
		await this.provider.deleteSnapshot(this.projectId, snapshotId);
		this.snapshots = this.snapshots.filter((s) => s.id !== snapshotId);
	}

	async getSnap(snapshotId: string): Promise<ERDSchema | null> {
		const snapshot = await this.provider.loadSnapshot(this.projectId, snapshotId);
		if (!snapshot) return null;
		return JSON.parse(snapshot.snap) as ERDSchema;
	}
}

export const snapshotStore = new SnapshotStore();
