import { z } from 'zod';
import type { RegisterFn } from './types';
import { addMemo, updateMemo, deleteMemo, attachMemo, detachMemo } from '../schema-ops';

export const registerMemoTools: RegisterFn = (server, ctx) => {
  const { requireAccess, getSchemaOrFail, saveAndNotify, mcpAudit } = ctx;

  server.tool(
    'list_memos',
    'List all memos with summary (id, content preview, position, color, attachedTableId). Optionally filter by schema namespace.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      schema: z.string().max(256).optional().describe('Filter by schema namespace'),
    },
    async ({ projectId, schema: schemaFilter }) => {
      requireAccess(projectId, 'viewer');
      const schema = getSchemaOrFail(projectId);
      let memoList = schema.memos ?? [];
      if (schemaFilter !== undefined) {
        memoList = memoList.filter(m => (m.schema || '') === schemaFilter);
      }
      const memos = memoList.map(m => ({
        id: m.id,
        schema: m.schema || null,
        content: m.content.length > 100 ? m.content.slice(0, 100) + '...' : m.content,
        color: m.color ?? 'yellow',
        locked: m.locked ?? false,
        position: m.position,
        width: m.width,
        height: m.height,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(memos, null, 2) }] };
    },
  );

  server.tool(
    'add_memo',
    'Add a sticky note memo to the canvas. Returns {memoId}. Use attach_memo to pin it to a table afterward.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      content: z.string().max(10000).optional().describe('Memo text content'),
      color: z.enum(['yellow', 'blue', 'green', 'pink', 'purple', 'orange']).optional().describe('Memo color'),
      schema: z.string().max(256).optional().describe('Schema namespace to assign this memo to'),
      x: z.number().min(-100000).max(100000).optional().describe('X position on canvas'),
      y: z.number().min(-100000).max(100000).optional().describe('Y position on canvas'),
      width: z.number().min(0).max(10000).optional().describe('Memo width (default: 200)'),
      height: z.number().min(0).max(10000).optional().describe('Memo height (default: 150)'),
    },
    async ({ projectId, ...opts }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const result = addMemo(schema, opts);
      mcpAudit('add_memo', projectId);
      saveAndNotify(projectId, result.schema);
      return {
        content: [{ type: 'text', text: JSON.stringify({ memoId: result.memoId }) }],
      };
    },
  );

  server.tool(
    'update_memo',
    'Update memo properties. Only provided fields are changed. Set locked=true to prevent UI editing.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID'),
      content: z.string().max(10000).optional().describe('New memo text content'),
      color: z.enum(['yellow', 'blue', 'green', 'pink', 'purple', 'orange', '']).optional().describe('New color (empty string to reset to yellow)'),
      x: z.number().min(-100000).max(100000).optional().describe('New X position'),
      y: z.number().min(-100000).max(100000).optional().describe('New Y position'),
      width: z.number().min(0).max(10000).optional().describe('New width'),
      height: z.number().min(0).max(10000).optional().describe('New height'),
      locked: z.boolean().optional().describe('Lock/unlock the memo'),
    },
    async ({ projectId, memoId, ...patch }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const memos = schema.memos ?? [];
      if (!memos.find(m => m.id === memoId)) {
        return { content: [{ type: 'text', text: `Memo ${memoId} not found` }], isError: true };
      }
      const updated = updateMemo(schema, memoId, patch);
      mcpAudit('update_memo', projectId, { memoId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo updated' }] };
    },
  );

  server.tool(
    'delete_memo',
    'Delete a memo from the ERD canvas',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID to delete'),
    },
    async ({ projectId, memoId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const memos = schema.memos ?? [];
      if (!memos.find(m => m.id === memoId)) {
        return { content: [{ type: 'text', text: `Memo ${memoId} not found` }], isError: true };
      }
      const updated = deleteMemo(schema, memoId);
      mcpAudit('delete_memo', projectId, { memoId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo deleted' }] };
    },
  );

  server.tool(
    'attach_memo',
    'Pin a memo to a table so it moves together when the table is dragged on the canvas.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID'),
      tableId: z.string().max(256).describe('Table ID to attach to'),
    },
    async ({ projectId, memoId, tableId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = attachMemo(schema, memoId, tableId);
      mcpAudit('attach_memo', projectId, { memoId, tableId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo attached to table' }] };
    },
  );

  server.tool(
    'detach_memo',
    'Unpin a memo from its attached table so it becomes a free-floating memo.',
    {
      projectId: z.string().max(256).describe('Project ID'),
      memoId: z.string().max(256).describe('Memo ID'),
    },
    async ({ projectId, memoId }) => {
      requireAccess(projectId, 'editor');
      const schema = getSchemaOrFail(projectId);
      const updated = detachMemo(schema, memoId);
      mcpAudit('detach_memo', projectId, { memoId });
      saveAndNotify(projectId, updated);
      return { content: [{ type: 'text', text: 'Memo detached from table' }] };
    },
  );
};
