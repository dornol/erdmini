<script lang="ts">
  import { tick } from 'svelte';
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import type { Memo } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';

  let { memo }: { memo: Memo } = $props();

  let isEditing = $state(false);
  let editContent = $state('');
  let textareaEl = $state<HTMLTextAreaElement | undefined>();
  let isDragging = $state(false);
  let isResizing = $state(false);
  let dragStart = { mouseX: 0, mouseY: 0, memoX: 0, memoY: 0 };
  let resizeStart = { mouseX: 0, mouseY: 0, width: 0, height: 0 };
  let groupDragStarts: Map<string, { x: number; y: number }> | null = null;

  let isSelected = $derived(erdStore.selectedMemoIds.has(memo.id));
  let isHovered = $state(false);

  const MEMO_COLORS: Record<string, { bg: string; header: string; text: string }> = {
    yellow:  { bg: '#fef9c3', header: '#facc15', text: '#713f12' },
    blue:    { bg: '#dbeafe', header: '#60a5fa', text: '#1e3a5f' },
    green:   { bg: '#dcfce7', header: '#4ade80', text: '#14532d' },
    pink:    { bg: '#fce7f3', header: '#f472b6', text: '#831843' },
    purple:  { bg: '#f3e8ff', header: '#c084fc', text: '#581c87' },
    orange:  { bg: '#ffedd5', header: '#fb923c', text: '#7c2d12' },
  };

  let colors = $derived(MEMO_COLORS[memo.color ?? 'yellow'] ?? MEMO_COLORS.yellow);

  function onHeaderMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      const newSet = new Set(erdStore.selectedMemoIds);
      if (newSet.has(memo.id)) newSet.delete(memo.id);
      else newSet.add(memo.id);
      erdStore.selectedMemoIds = newSet;
      return;
    }

    // Multi-drag
    if (erdStore.selectedMemoIds.has(memo.id) && erdStore.selectedMemoIds.size > 1) {
      if (!memo.locked && !permissionStore.isReadOnly) {
        isDragging = true;
        dragStart = { mouseX: e.clientX, mouseY: e.clientY, memoX: 0, memoY: 0 };
        groupDragStarts = new Map();
        for (const id of erdStore.selectedMemoIds) {
          const m2 = erdStore.schema.memos.find((mm) => mm.id === id);
          if (m2 && !m2.locked) groupDragStarts.set(id, { x: m2.position.x, y: m2.position.y });
        }
      }
      return;
    }

    // Deselect tables when selecting a memo
    erdStore.selectedTableId = null;
    erdStore.selectedTableIds = new Set();
    erdStore.selectedMemoId = memo.id;
    erdStore.selectedMemoIds = new Set([memo.id]);
    if (!memo.locked && !permissionStore.isReadOnly) isDragging = true;
    dragStart = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      memoX: memo.position.x,
      memoY: memo.position.y,
    };
  }

  function onResizeMouseDown(e: MouseEvent) {
    if (e.button !== 0 || memo.locked || permissionStore.isReadOnly) return;
    e.stopPropagation();
    e.preventDefault();
    isResizing = true;
    resizeStart = { mouseX: e.clientX, mouseY: e.clientY, width: memo.width, height: memo.height };
  }

  function onMouseMove(e: MouseEvent) {
    if (isResizing) {
      const dx = (e.clientX - resizeStart.mouseX) / canvasState.scale;
      const dy = (e.clientY - resizeStart.mouseY) / canvasState.scale;
      const newW = Math.max(120, resizeStart.width + dx);
      const newH = Math.max(80, resizeStart.height + dy);
      erdStore.updateMemo(memo.id, { width: Math.round(newW), height: Math.round(newH) });
      return;
    }
    if (!isDragging) return;
    const dx = (e.clientX - dragStart.mouseX) / canvasState.scale;
    const dy = (e.clientY - dragStart.mouseY) / canvasState.scale;
    if (groupDragStarts && groupDragStarts.size > 1) {
      const moves = [...groupDragStarts].map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy }));
      erdStore.moveMemos(moves);
    } else {
      erdStore.moveMemo(memo.id, dragStart.memoX + dx, dragStart.memoY + dy);
    }
  }

  function onMouseUp() {
    isDragging = false;
    isResizing = false;
    groupDragStarts = null;
  }

  async function startEditing() {
    isEditing = true;
    editContent = memo.content;
    await tick();
    textareaEl?.focus();
  }

  function onContentDblClick(e: MouseEvent) {
    if (permissionStore.isReadOnly || memo.locked) return;
    e.stopPropagation();
    startEditing();
  }

  function commitContent() {
    erdStore.updateMemo(memo.id, { content: editContent });
    isEditing = false;
    if (erdStore.editingMemoId === memo.id) erdStore.editingMemoId = null;
  }

  function onTextareaKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      isEditing = false;
      if (erdStore.editingMemoId === memo.id) erdStore.editingMemoId = null;
    }
  }

  async function onDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    const ok = await dialogStore.confirm(m.dialog_delete_memo_confirm(), {
      title: m.action_delete(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) erdStore.deleteMemo(memo.id);
  }

  function onColorClick(e: MouseEvent, color: string) {
    e.stopPropagation();
    erdStore.updateMemo(memo.id, { color: color === (memo.color ?? 'yellow') ? undefined : color });
  }

  // Auto-enter editing mode when this memo is flagged for editing (e.g. just created)
  $effect(() => {
    if (erdStore.editingMemoId === memo.id && !isEditing) {
      startEditing();
    }
  });

  $effect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="memo-card"
  class:selected={isSelected}
  class:locked={memo.locked}
  style="left:{memo.position.x}px; top:{memo.position.y}px; width:{memo.width}px; height:{memo.height}px; background:{colors.bg}; cursor:{memo.locked ? 'default' : isDragging ? 'grabbing' : 'default'}; z-index:{isHovered ? 20 : isSelected ? 10 : 1}"
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
>
  <!-- Header bar -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="memo-header"
    style="background:{colors.header}; cursor:{memo.locked ? 'default' : isDragging ? 'grabbing' : 'grab'}"
    onmousedown={onHeaderMouseDown}
  >
    {#if memo.locked}<span class="lock-icon">🔒</span>{/if}
    <div class="header-spacer"></div>
    {#if !permissionStore.isReadOnly}
      <button class="delete-btn" onclick={onDeleteClick} style="color:{colors.text}">✕</button>
    {/if}
  </div>

  <!-- Content area -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="memo-content"
    ondblclick={onContentDblClick}
    onmousedown={(e) => e.stopPropagation()}
    style="color:{colors.text}"
  >
    {#if isEditing}
      <textarea
        class="memo-textarea"
        bind:this={textareaEl}
        bind:value={editContent}
        onblur={commitContent}
        onkeydown={onTextareaKeyDown}
        style="color:{colors.text}"
      ></textarea>
    {:else if memo.content}
      <div class="memo-text">{memo.content}</div>
    {:else}
      <div class="memo-placeholder">{m.memo_placeholder()}</div>
    {/if}
  </div>

  <!-- Color picker (show on select) -->
  {#if isSelected && !permissionStore.isReadOnly && !memo.locked}
    <div class="memo-colors">
      {#each Object.keys(MEMO_COLORS) as c}
        <button
          class="color-dot"
          class:active={c === (memo.color ?? 'yellow')}
          style="background:{MEMO_COLORS[c].header}"
          onclick={(e) => onColorClick(e, c)}
        ></button>
      {/each}
    </div>
  {/if}

  <!-- Resize handle -->
  {#if !memo.locked && !permissionStore.isReadOnly}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle" onmousedown={onResizeMouseDown}>◢</div>
  {/if}
</div>

<style>
  .memo-card {
    position: absolute;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    user-select: none;
    border: 2px solid transparent;
    transition: border-color 0.15s;
  }

  .memo-card.selected {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .memo-header {
    height: 8px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 4px;
    min-height: 24px;
    gap: 4px;
  }

  .header-spacer {
    flex: 1;
  }

  .lock-icon {
    font-size: 10px;
    line-height: 1;
  }

  .delete-btn {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    opacity: 0;
    padding: 0 2px;
    line-height: 1;
    transition: opacity 0.15s;
  }

  .memo-card:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
  }

  .memo-content {
    flex: 1;
    padding: 8px 10px;
    overflow: hidden;
    cursor: text;
    min-height: 0;
  }

  .memo-text {
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-y: auto;
    max-height: 100%;
  }

  .memo-placeholder {
    font-size: 13px;
    opacity: 0.4;
    font-style: italic;
  }

  .memo-textarea {
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    font-size: 13px;
    line-height: 1.5;
    resize: none;
    outline: none;
    font-family: inherit;
    padding: 0;
  }

  .memo-colors {
    display: flex;
    gap: 4px;
    padding: 4px 10px 6px;
    flex-shrink: 0;
  }

  .color-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: border-color 0.15s;
  }

  .color-dot.active {
    border-color: rgba(0, 0, 0, 0.4);
  }

  .color-dot:hover {
    border-color: rgba(0, 0, 0, 0.3);
  }

  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    opacity: 0;
    cursor: nwse-resize;
    color: rgba(0, 0, 0, 0.3);
    transition: opacity 0.15s;
    user-select: none;
  }

  .memo-card:hover .resize-handle {
    opacity: 1;
  }
</style>
