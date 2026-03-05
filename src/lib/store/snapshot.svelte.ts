import type { SchemaSnapshot, ERDSchema } from '$lib/types/erd';
import type { StorageProvider } from '$lib/storage/types';
import { erdStore } from '$lib/store/erd.svelte';
import { generateId } from '$lib/utils/common';

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
