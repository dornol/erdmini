import type { ERDSchema } from '$lib/types/erd';

declare global {
	// eslint-disable-next-line no-var
	var __erdmini_notifySchemaChange: ((projectId: string, schema: object) => void) | undefined;
}

export function notifyCollabSchemaChange(projectId: string, schema: ERDSchema): void {
	globalThis.__erdmini_notifySchemaChange?.(projectId, schema);
}
