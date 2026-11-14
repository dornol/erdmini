import { DomainOperationState } from './domain-operation-state';
import { orderByIds } from './order-by-ids';
import { hasConstraintColumns, hasForeignKeyReferences } from './constraint-references';
import { OperationAcknowledgements } from './operation-acknowledgements';
import { generateId } from '$lib/utils/common';
import { erdStore } from '$lib/store/erd.svelte';
import { collabStore } from '$lib/store/collab.svelte';
import { collabClient } from './collab-client';
import { applyMemoPatch } from './memo-patch';
import { applyMemoState } from './memo-state';
import type { CollabOperation, ServerMessage } from '$lib/types/collab';
import type { ERDSchema } from '$lib/types/erd';

const acknowledgements = new OperationAcknowledgements();
const domainOperations = new DomainOperationState();
let operationSequence = 0;
function sendTrackedOperation(op: CollabOperation) {
  const operationId = `${generateId()}-${++operationSequence}`;
  const tracked = acknowledgements.register(operationId, op);
  domainOperations.register(operationId, op, erdStore.schema);
  if (op.kind === 'update-column') {
    const patch = op.patch;
    const unsetFields = Object.keys(patch).filter(field => patch[field as keyof typeof patch] === undefined) as (keyof typeof patch)[];
    if (unsetFields.length) op = { ...op, unsetFields };
  }
  collabClient.send({ type: 'operation', op, ...(tracked ? { operationId } : {}) });
}

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
          sendTrackedOperation(pendingMoveOp);
          pendingMoveOp = null;
        }
      }, 50);
    }
    return;
  }

  sendTrackedOperation(op);
}

// ── Inbound: apply a remote operation to erdStore ──
export function applyRemoteOperation(op: CollabOperation) {
  // useAutoSave's effect clears this flag — see use-auto-save.svelte.ts.
  erdStore._isRemoteOp = true;
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
        const dx = op.x - table.position.x;
        const dy = op.y - table.position.y;
        table.position = { x: op.x, y: op.y };
        erdStore.schema.updatedAt = new Date().toISOString();
        // Move attached memos by the same delta
        for (const memo of erdStore.schema.memos) {
          if (memo.attachedTableId === op.tableId) {
            memo.position = { x: memo.position.x + dx, y: memo.position.y + dy };
          }
        }
      }
      break;
    }
    case 'move-tables': {
      for (const move of op.moves) {
        const table = erdStore.schema.tables.find((t) => t.id === move.tableId);
        if (table) {
          const dx = move.x - table.position.x;
          const dy = move.y - table.position.y;
          table.position = { x: move.x, y: move.y };
          erdStore.schema.updatedAt = new Date().toISOString();
          // Move attached memos by the same delta
          for (const memo of erdStore.schema.memos) {
            if (memo.attachedTableId === move.tableId) {
              memo.position = { x: memo.position.x + dx, y: memo.position.y + dy };
            }
          }
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
      erdStore.updateColumn(op.tableId, op.columnId, domainOperations.columnPatch(op));
      break;
    }
    case 'delete-column': {
      erdStore.deleteColumn(op.tableId, op.columnId);
      break;
    }
    case 'move-column': {
      if (op.columnIds) {
        const table = erdStore.schema.tables.find(table => table.id === op.tableId);
        if (table) {
          table.columns = orderByIds(table.columns, op.columnIds);
          erdStore.schema.updatedAt = new Date().toISOString();
        }
      } else erdStore.moveColumnToIndex(op.tableId, op.columnId, op.toIndex);
      break;
    }
    case 'add-fk': {
      const table = erdStore.schema.tables.find((t) => t.id === op.tableId);
      if (table && hasForeignKeyReferences(erdStore.schema.tables, op.tableId, op.fk)) {
        table.foreignKeys = [...table.foreignKeys, op.fk];
        erdStore.schema.updatedAt = new Date().toISOString();
      }
      break;
    }
    case 'update-fk': {
      const table = erdStore.schema.tables.find((t) => t.id === op.tableId);
      if (table && op.fk) {
        // Remove the edited FK when one of its endpoints was deleted.
        table.foreignKeys = hasForeignKeyReferences(erdStore.schema.tables, op.tableId, op.fk)
          ? table.foreignKeys.map(fk => fk.id === op.fk.id ? op.fk : fk)
          : table.foreignKeys.filter(fk => fk.id !== op.fk.id);
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
      if (table && hasConstraintColumns(table, op.uk?.columnIds)) {
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
      if (table && hasConstraintColumns(table, op.index?.columnIds)) {
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
      domainOperations.applyDomainUpdate(erdStore.schema, () => erdStore.updateDomain(op.domainId, op.patch));
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
        erdStore.schema.updatedAt = new Date().toISOString();
      }
      break;
    }
    case 'move-memos': {
      for (const move of op.moves) {
        const memo = erdStore.schema.memos.find((m) => m.id === move.memoId);
        if (memo) {
          memo.position = { x: move.x, y: move.y };
          erdStore.schema.updatedAt = new Date().toISOString();
        }
      }
      break;
    }
    case 'update-memo': {
      const memo = erdStore.schema.memos.find((m) => m.id === op.memoId);
      if (memo) {
        applyMemoPatch(memo, op.patch);
        erdStore.schema.updatedAt = new Date().toISOString();
      }
      break;
    }
    case 'attach-memo': {
      const memo = erdStore.schema.memos.find(item => item.id === op.memoId);
      if (memo) applyMemoState(memo, { attachedTableId: op.tableId }, erdStore.schema.tables);
      break;
    }
    case 'detach-memo': {
      erdStore.detachMemo(op.memoId);
      const memo = erdStore.schema.memos.find(item => item.id === op.memoId);
      if (memo && op.position && Number.isFinite(op.position.x) && Number.isFinite(op.position.y)) {
        // The table may already be gone on this peer, so use the sender's final position.
        memo.position = { x: op.position.x, y: op.position.y };
      }
      break;
    }
    case 'add-schema': {
      erdStore.addSchema(op.name);
      break;
    }
    case 'delete-schema': {
      erdStore.deleteSchema(op.name);
      break;
    }
    case 'rename-schema': {
      erdStore.renameSchema(op.oldName, op.newName);
      break;
    }
    case 'reorder-schemas': {
      const current = (erdStore.schema.schemas ?? []).map(id => ({ id }));
      erdStore.reorderSchemas(orderByIds(current, op.schemas).map(item => item.id));
      break;
    }
    case 'update-table-schema': {
      erdStore.updateTableSchema(op.tableId, op.schema || undefined);
      break;
    }
    case 'set-dialect': {
      erdStore.setDialect(op.dialect);
      break;
    }
    case 'add-db-object': {
      if (!erdStore.schema.dbObjects) erdStore.schema.dbObjects = [];
      if (!erdStore.schema.dbObjectCategories) erdStore.schema.dbObjectCategories = [];
      erdStore.schema.dbObjects.push({ ...op.object });
      if (!erdStore.schema.dbObjectCategories.includes(op.object.category)) {
        erdStore.schema.dbObjectCategories.push(op.object.category);
      }
      break;
    }
    case 'update-db-object': {
      const obj = erdStore.schema.dbObjects?.find((o) => o.id === op.objectId);
      if (obj) Object.assign(obj, op.updates);
      break;
    }
    case 'delete-db-object': {
      if (erdStore.schema.dbObjects) {
        erdStore.schema.dbObjects = erdStore.schema.dbObjects.filter((o) => o.id !== op.objectId);
      }
      break;
    }
    case 'add-db-object-category': {
      if (!erdStore.schema.dbObjectCategories) erdStore.schema.dbObjectCategories = [];
      if (!erdStore.schema.dbObjectCategories.includes(op.category)) {
        erdStore.schema.dbObjectCategories.push(op.category);
      }
      break;
    }
    case 'rename-db-object-category': {
      if (erdStore.schema.dbObjectCategories) {
        const idx = erdStore.schema.dbObjectCategories.indexOf(op.oldName);
        if (idx >= 0) erdStore.schema.dbObjectCategories[idx] = op.newName;
      }
      if (erdStore.schema.dbObjects) {
        for (const o of erdStore.schema.dbObjects) {
          if (o.category === op.oldName) o.category = op.newName;
        }
      }
      break;
    }
    case 'delete-db-object-category': {
      if (erdStore.schema.dbObjectCategories) {
        erdStore.schema.dbObjectCategories = erdStore.schema.dbObjectCategories.filter((c) => c !== op.category);
      }
      if (erdStore.schema.dbObjects) {
        erdStore.schema.dbObjects = erdStore.schema.dbObjects.filter((o) => o.category !== op.category);
      }
      break;
    }
    case 'reorder-db-object-categories': {
      if (erdStore.schema.dbObjectCategories) {
        const current = erdStore.schema.dbObjectCategories.map(id => ({ id }));
        erdStore.schema.dbObjectCategories = orderByIds(current, op.categories).map(item => item.id);
        erdStore.schema.updatedAt = new Date().toISOString();
      }
      break;
    }
    case 'load-schema': {
      erdStore.loadSchema(op.schema);
      break;
    }
  }
  touchRemoteSchema();
}

// Trigger autosave and clear remote-op suppression even for same-millisecond acknowledgements.
function touchRemoteSchema() {
  const previous = Date.parse(erdStore.schema.updatedAt);
  erdStore.schema.updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
}

// ── Handle incoming server messages ──
export function handleServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'joined':
      acknowledgements.reset();
      domainOperations.reset();
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
    case 'operation-ack': {
      domainOperations.acknowledge(msg.operationId);
      const op = acknowledgements.acknowledge(msg.operationId);
      if (op?.kind === 'memo-state') {
        erdStore._isRemoteOp = true;
        const memo = erdStore.schema.memos.find(item => item.id === op.memoId);
        if (memo) applyMemoState(memo, op.patch, erdStore.schema.tables);
        touchRemoteSchema();
      } else if (op) applyRemoteOperation(op);
      break;
    }
    case 'presence':
      collabStore.updatePresence(msg.fromPeerId, msg.data);
      break;
    case 'sync':
      applyFullSync(msg.schema);
      break;
    case 'mcp-sync':
      applyMcpSync(msg.schema);
      break;
    case 'error':
      if (msg.message === '__disconnected__') {
        acknowledgements.reset();
      domainOperations.reset();
        collabStore.setConnected(false);
      } else {
        console.warn('[collab] Server error:', msg.message);
      }
      break;
  }
}

function applyFullSync(schema: ERDSchema) {
  erdStore._isRemoteOp = true;
  erdStore.loadSchema(schema);
}

function applyMcpSync(schema: ERDSchema) {
  erdStore.loadSchemaFromMcp(schema);
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
