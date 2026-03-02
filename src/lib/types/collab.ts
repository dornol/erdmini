import type { Column, ERDSchema, ForeignKey, Table, UniqueKey, TableIndex, ColumnDomain } from './erd';

// ── Peer info ──
export interface PeerInfo {
  peerId: string;
  userId: string;
  displayName: string;
  color: string;
}

// ── Presence ──
export interface PresenceData {
  cursor?: { x: number; y: number };
  selectedTableIds?: string[];
}

// ── Operations (erdStore mutations) ──
export type CollabOperation =
  | { kind: 'add-table'; table: Table }
  | { kind: 'delete-table'; tableId: string }
  | { kind: 'delete-tables'; tableIds: string[] }
  | { kind: 'update-table-name'; tableId: string; name: string }
  | { kind: 'update-table-comment'; tableId: string; comment: string }
  | { kind: 'update-table-color'; tableId: string; color: string | undefined }
  | { kind: 'update-table-group'; tableId: string; group: string | undefined }
  | { kind: 'move-table'; tableId: string; x: number; y: number }
  | { kind: 'move-tables'; moves: { tableId: string; x: number; y: number }[] }
  | { kind: 'add-column'; tableId: string; column: Column }
  | { kind: 'update-column'; tableId: string; columnId: string; patch: Partial<Column> }
  | { kind: 'delete-column'; tableId: string; columnId: string }
  | { kind: 'move-column'; tableId: string; columnId: string; toIndex: number }
  | { kind: 'add-fk'; tableId: string; fk: ForeignKey }
  | { kind: 'update-fk'; tableId: string; fk: ForeignKey }
  | { kind: 'delete-fk'; tableId: string; fkId: string }
  | { kind: 'add-uk'; tableId: string; uk: UniqueKey }
  | { kind: 'delete-uk'; tableId: string; ukId: string }
  | { kind: 'add-index'; tableId: string; index: TableIndex }
  | { kind: 'delete-index'; tableId: string; indexId: string }
  | { kind: 'add-domain'; domain: ColumnDomain }
  | { kind: 'update-domain'; domainId: string; patch: Partial<Omit<ColumnDomain, 'id'>> }
  | { kind: 'delete-domain'; domainId: string }
  | { kind: 'duplicate-table'; table: Table }
  | { kind: 'update-group-color'; group: string; color: string | undefined }
  | { kind: 'rename-group'; oldName: string; newName: string }
  | { kind: 'apply-layout'; positions: { tableId: string; x: number; y: number }[] }
  | { kind: 'load-schema'; schema: ERDSchema };

// ── Client → Server messages ──
export type ClientMessage =
  | { type: 'join'; projectId: string }
  | { type: 'leave' }
  | { type: 'operation'; op: CollabOperation }
  | { type: 'presence'; data: PresenceData }
  | { type: 'request-sync' };

// ── Server → Client messages ──
export type ServerMessage =
  | { type: 'joined'; peerId: string; peers: PeerInfo[] }
  | { type: 'peer-joined'; peer: PeerInfo }
  | { type: 'peer-left'; peerId: string }
  | { type: 'operation'; op: CollabOperation; fromPeerId: string }
  | { type: 'presence'; data: PresenceData; fromPeerId: string }
  | { type: 'sync'; schema: ERDSchema }
  | { type: 'error'; message: string };
