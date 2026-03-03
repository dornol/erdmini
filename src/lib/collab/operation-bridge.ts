import { erdStore } from '$lib/store/erd.svelte';
import { collabStore } from '$lib/store/collab.svelte';
import { collabClient } from './collab-client';
import type { CollabOperation, ServerMessage } from '$lib/types/collab';
import type { ERDSchema } from '$lib/types/erd';

// ── Outbound: send a local operation to peers ──
let moveThrottleTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMoveOp: CollabOperation | null = null;

export function sendOperation(op: CollabOperation) {
  if (erdStore._isRemoteOp || !collabClient.connected) return;

  // Throttle move operations (50ms)
  if (op.kind === 'move-table' || op.kind === 'move-tables' || op.kind === 'move-memo' || op.kind === 'move-memos') {
    pendingMoveOp = op;
    if (!moveThrottleTimer) {
      moveThrottleTimer = setTimeout(() => {
        moveThrottleTimer = null;
        if (pendingMoveOp) {
          collabClient.send({ type: 'operation', op: pendingMoveOp });
          pendingMoveOp = null;
        }
      }, 50);
    }
    return;
  }

  collabClient.send({ type: 'operation', op });
}

// ── Inbound: apply a remote operation to erdStore ──
export function applyRemoteOperation(op: CollabOperation) {
  erdStore._isRemoteOp = true;
  try {
    switch (op.kind) {
      case 'add-table':
      case 'duplicate-table': {
        // Add the table directly (it comes with full data including ID)
        erdStore.schema.tables = [...erdStore.schema.tables, op.table];
        erdStore.schema.updatedAt = new Date().toISOString();
        break;
      }
      case 'delete-table': {
        erdStore.deleteTable(op.tableId);
        break;
      }
      case 'delete-tables': {
        erdStore.deleteTables(op.tableIds);
        break;
      }
      case 'update-table-name': {
        erdStore.updateTableName(op.tableId, op.name);
        break;
      }
      case 'update-table-comment': {
        erdStore.updateTableComment(op.tableId, op.comment);
        break;
      }
      case 'update-table-color': {
        erdStore.updateTableColor(op.tableId, op.color);
        break;
      }
      case 'update-table-group': {
        erdStore.updateTableGroup(op.tableId, op.group);
        break;
      }
      case 'move-table': {
        const table = erdStore.schema.tables.find((t) => t.id === op.tableId);
        if (table) {
          table.position = { x: op.x, y: op.y };
        }
        break;
      }
      case 'move-tables': {
        for (const move of op.moves) {
          const table = erdStore.schema.tables.find((t) => t.id === move.tableId);
          if (table) {
            table.position = { x: move.x, y: move.y };
          }
        }
        break;
      }
      case 'add-column': {
        const table = erdStore.schema.tables.find((t) => t.id === op.tableId);
        if (table) {
          table.columns = [...table.columns, op.column];
          erdStore.schema.updatedAt = new Date().toISOString();
        }
        break;
      }
      case 'update-column': {
        erdStore.updateColumn(op.tableId, op.columnId, op.patch);
        break;
      }
      case 'delete-column': {
        erdStore.deleteColumn(op.tableId, op.columnId);
        break;
      }
      case 'move-column': {
        erdStore.moveColumnToIndex(op.tableId, op.columnId, op.toIndex);
        break;
      }
      case 'add-fk': {
        const table = erdStore.schema.tables.find((t) => t.id === op.tableId);
        if (table) {
          table.foreignKeys = [...table.foreignKeys, op.fk];
          erdStore.schema.updatedAt = new Date().toISOString();
        }
        break;
      }
      case 'update-fk': {
        const table = erdStore.schema.tables.find((t) => t.id === op.tableId);
        if (table) {
          table.foreignKeys = table.foreignKeys.map((fk) =>
            fk.id === op.fk.id ? op.fk : fk
          );
          erdStore.schema.updatedAt = new Date().toISOString();
        }
        break;
      }
      case 'delete-fk': {
        erdStore.deleteForeignKey(op.tableId, op.fkId);
        break;
      }
      case 'add-uk': {
        const table = erdStore.schema.tables.find((t) => t.id === op.tableId);
        if (table) {
          table.uniqueKeys = [...table.uniqueKeys, op.uk];
          erdStore.schema.updatedAt = new Date().toISOString();
        }
        break;
      }
      case 'delete-uk': {
        erdStore.deleteUniqueKey(op.tableId, op.ukId);
        break;
      }
      case 'add-index': {
        const table = erdStore.schema.tables.find((t) => t.id === op.tableId);
        if (table) {
          table.indexes = [...(table.indexes ?? []), op.index];
          erdStore.schema.updatedAt = new Date().toISOString();
        }
        break;
      }
      case 'delete-index': {
        erdStore.deleteIndex(op.tableId, op.indexId);
        break;
      }
      case 'add-domain': {
        erdStore.schema.domains = [...erdStore.schema.domains, op.domain];
        erdStore.schema.updatedAt = new Date().toISOString();
        break;
      }
      case 'update-domain': {
        erdStore.updateDomain(op.domainId, op.patch);
        break;
      }
      case 'delete-domain': {
        erdStore.deleteDomain(op.domainId);
        break;
      }
      case 'update-group-color': {
        erdStore.updateGroupColor(op.group, op.color);
        break;
      }
      case 'rename-group': {
        erdStore.renameGroup(op.oldName, op.newName);
        break;
      }
      case 'apply-layout': {
        const positions = new Map(op.positions.map((p) => [p.tableId, { x: p.x, y: p.y }]));
        erdStore.applyLayout(positions);
        break;
      }
      case 'add-memo': {
        erdStore.schema.memos = [...erdStore.schema.memos, op.memo];
        erdStore.schema.updatedAt = new Date().toISOString();
        break;
      }
      case 'delete-memo': {
        erdStore.deleteMemo(op.memoId);
        break;
      }
      case 'delete-memos': {
        erdStore.deleteMemos(op.memoIds);
        break;
      }
      case 'move-memo': {
        const memo = erdStore.schema.memos.find((m) => m.id === op.memoId);
        if (memo) {
          memo.position = { x: op.x, y: op.y };
        }
        break;
      }
      case 'move-memos': {
        for (const move of op.moves) {
          const memo = erdStore.schema.memos.find((m) => m.id === move.memoId);
          if (memo) {
            memo.position = { x: move.x, y: move.y };
          }
        }
        break;
      }
      case 'update-memo': {
        const memo = erdStore.schema.memos.find((m) => m.id === op.memoId);
        if (memo) {
          Object.assign(memo, op.patch);
          erdStore.schema.updatedAt = new Date().toISOString();
        }
        break;
      }
      case 'load-schema': {
        erdStore.loadSchema(op.schema);
        break;
      }
    }
  } finally {
    erdStore._isRemoteOp = false;
  }
}

// ── Handle incoming server messages ──
export function handleServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'joined':
      collabStore.setJoined(msg.peerId, msg.peers);
      break;
    case 'peer-joined':
      collabStore.addPeer(msg.peer);
      break;
    case 'peer-left':
      collabStore.removePeer(msg.peerId);
      break;
    case 'operation':
      applyRemoteOperation(msg.op);
      break;
    case 'presence':
      collabStore.updatePresence(msg.fromPeerId, msg.data);
      break;
    case 'sync':
      applyFullSync(msg.schema);
      break;
    case 'error':
      if (msg.message === '__disconnected__') {
        collabStore.setConnected(false);
      } else {
        console.warn('[collab] Server error:', msg.message);
      }
      break;
  }
}

function applyFullSync(schema: ERDSchema) {
  erdStore._isRemoteOp = true;
  try {
    erdStore.loadSchema(schema);
  } finally {
    erdStore._isRemoteOp = false;
  }
}

// ── Presence throttle ──
let presenceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPresence: { cursor?: { x: number; y: number }; selectedTableIds?: string[] } | null = null;

export function sendPresence(data: { cursor?: { x: number; y: number }; selectedTableIds?: string[] }) {
  if (!collabClient.connected) return;

  pendingPresence = { ...pendingPresence, ...data };
  if (!presenceTimer) {
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      if (pendingPresence) {
        collabClient.send({ type: 'presence', data: pendingPresence });
        pendingPresence = null;
      }
    }, 100);
  }
}
