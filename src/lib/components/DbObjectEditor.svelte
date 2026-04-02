<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import * as m from '$lib/paraglide/messages';
  import SqlEditor from './SqlEditor.svelte';

  let obj = $derived(erdStore.selectedDbObject);
  let categories = $derived(erdStore.schema.dbObjectCategories ?? []);

  let sqlDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  function updateField(field: 'name' | 'comment' | 'category' | 'schema' | 'includeInDdl', value: any) {
    if (!obj) return;
    erdStore.updateDbObject(obj.id, { [field]: value });
  }

  function handleSqlChange(sql: string) {
    if (!obj) return;
    clearTimeout(sqlDebounceTimer);
    sqlDebounceTimer = setTimeout(() => {
      erdStore.updateDbObject(obj!.id, { sql });
    }, 500);
  }

  let panelWidth = $state(
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem('erdmini_dbo_panel_width')) || 420
      : 420
  );
  let resizing = $state(false);

  function onResizeStart(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const startX = e.clientX;
    const startWidth = panelWidth;
    function onMove(ev: MouseEvent) {
      panelWidth = Math.max(300, Math.min(800, startWidth + ev.clientX - startX));
    }
    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try { localStorage.setItem('erdmini_dbo_panel_width', String(panelWidth)); } catch { /* quota */ }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function closeEditor() {
    erdStore.selectedDbObjectId = null;
  }
</script>

{#if obj}
  <aside class="db-object-editor" class:readonly={permissionStore.isReadOnly} class:resizing style="width:{panelWidth}px">
    {#if permissionStore.isReadOnly}
      <div class="readonly-notice">{m.label_read_only()}</div>
    {/if}

    <div class="editor-header">
      <span class="editor-title">{obj.category}</span>
      <button class="close-btn" onclick={closeEditor}>✕</button>
    </div>

    <div class="editor-body thin-scrollbar">
      <!-- Name + Category (one row) -->
      <div class="name-category-row">
        <label class="inline-field name-field" for="dbo-name">
          <span class="field-label">{m.db_object_name()}</span>
          <input
            id="dbo-name"
            class="field-input"
            value={obj.name}
            oninput={(e) => updateField('name', (e.target as HTMLInputElement).value)}
            disabled={permissionStore.isReadOnly}
          />
        </label>
        <label class="inline-field category-field" for="dbo-category">
          <span class="field-label">{m.db_object_category_rename()}</span>
          <select
            id="dbo-category"
            class="field-select"
            value={obj.category}
            onchange={(e) => updateField('category', (e.target as HTMLSelectElement).value)}
            disabled={permissionStore.isReadOnly}
          >
          {#each categories as cat}
            <option value={cat}>{cat}</option>
          {/each}
          </select>
        </label>
      </div>

      <!-- Comment + DDL (one row, half-half) -->
      <div class="name-category-row">
        <label class="inline-field name-field" for="dbo-comment">
          <span class="field-label">{m.db_object_comment()}</span>
          <input
            id="dbo-comment"
            class="field-input"
            value={obj.comment ?? ''}
            oninput={(e) => updateField('comment', (e.target as HTMLInputElement).value || undefined)}
            disabled={permissionStore.isReadOnly}
            placeholder={m.none_placeholder()}
          />
        </label>
        <div class="inline-field category-field">
          <span class="field-label">{m.db_object_include_ddl()}</span>
          <label class="ddl-toggle">
            <input
              type="checkbox"
              checked={obj.includeInDdl ?? false}
              onchange={(e) => updateField('includeInDdl', (e.target as HTMLInputElement).checked)}
              disabled={permissionStore.isReadOnly}
            />
            DDL Export
          </label>
        </div>
      </div>

      <!-- SQL Editor -->
      <div class="sql-section">
        <label class="field-label">{m.db_object_sql()}</label>
        <SqlEditor
          value={obj.sql}
          onchange={handleSqlChange}
          readonly={permissionStore.isReadOnly}
          height="calc(100vh - 380px)"
        />
      </div>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle" onmousedown={onResizeStart}></div>
  </aside>
{/if}

<style>
  .db-object-editor {
    position: relative;
    flex-shrink: 0;
    background: var(--app-card-bg, white);
    border-right: 1px solid var(--app-border, #e2e8f0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .db-object-editor.resizing {
    user-select: none;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
  }

  .resize-handle:hover {
    background: rgba(59, 130, 246, 0.3);
  }

  .db-object-editor.readonly {
    pointer-events: auto;
  }

  .readonly-notice {
    background: #92400e;
    color: #fef3c7;
    text-align: center;
    font-size: 11px;
    padding: 3px 0;
    font-weight: 600;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
    flex-shrink: 0;
  }

  .editor-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-text, #334155);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    font-size: 14px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .close-btn:hover {
    color: var(--app-text, #334155);
    background: var(--app-hover, #f1f5f9);
  }

  .editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .name-category-row {
    display: flex;
    gap: 8px;
  }

  .inline-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .name-field {
    flex: 1 1 50%;
  }

  .category-field {
    flex: 1 1 50%;
  }

  .ddl-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--app-text, #334155);
    cursor: pointer;
    padding: 5px 8px;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 5px;
    background: var(--app-card-bg, white);
  }

  .ddl-toggle input {
    accent-color: #3b82f6;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .field-input, .field-select {
    padding: 5px 8px;
    background: var(--app-card-bg, white);
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 5px;
    color: var(--app-text, #334155);
    font-size: 12px;
    outline: none;
  }

  .field-input:focus, .field-select:focus {
    border-color: #3b82f6;
  }

  .field-input:disabled, .field-select:disabled {
    opacity: 0.5;
  }

  .sql-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }
</style>
