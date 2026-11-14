import type { ERDSchema } from '$lib/types/erd';

export type SchemaChangeSource = 'collab' | 'mcp';

declare global {
  var __erdmini_collabDatabase: { suspendDatabase: () => void; resumeDatabase: () => void } | undefined;
	// eslint-disable-next-line no-var
	var __erdmini_notifySchemaChange: ((projectId: string, schema: object, source?: SchemaChangeSource) => void) | undefined;
}

export function notifyCollabSchemaChange(projectId: string, schema: ERDSchema, source: SchemaChangeSource = 'collab'): void {
	globalThis.__erdmini_notifySchemaChange?.(projectId, schema, source);
}
