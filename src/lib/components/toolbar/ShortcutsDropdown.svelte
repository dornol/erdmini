<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
  }

  let { open, ontoggle, onclose }: Props = $props();

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';
</script>

<div class="dropdown-wrap">
  <button
    class="btn-help"
    onclick={ontoggle}
    aria-expanded={open}
    aria-haspopup="dialog"
    title={m.shortcuts_title()}
  >
    ?
  </button>
  {#if open}
    <div
      class="shortcuts-panel"
      role="dialog"
      tabindex="-1"
      onmouseleave={onclose}
    >
      <div class="shortcuts-header">{m.shortcuts_title()}</div>

      <div class="shortcuts-group">
        <div class="shortcuts-group-title">{m.shortcuts_general()}</div>
        <div class="shortcut-row"><kbd>{mod}+Z</kbd><span>{m.shortcuts_undo()}</span></div>
        <div class="shortcut-row"><kbd>{mod}+Shift+Z</kbd><span>{m.shortcuts_redo()}</span></div>
        <div class="shortcut-row"><kbd>Delete / Backspace</kbd><span>{m.shortcuts_delete()}</span></div>
        <div class="shortcut-row"><kbd>Esc</kbd><span>{m.shortcuts_deselect()}</span></div>
        <div class="shortcut-row"><kbd>{mod}+K</kbd><span>{m.cmd_palette_open()}</span></div>
        <div class="shortcut-row"><kbd>{mod}+A</kbd><span>{m.shortcuts_select_all()}</span></div>
        <div class="shortcut-row"><kbd>{mod}+D</kbd><span>{m.shortcuts_duplicate()}</span></div>
      </div>

      <div class="shortcuts-group">
        <div class="shortcuts-group-title">{m.shortcuts_canvas()}</div>
        <div class="shortcut-row"><kbd>Scroll</kbd><span>{m.shortcuts_zoom()}</span></div>
        <div class="shortcut-row"><kbd>+/-</kbd><span>{m.shortcuts_keyboard_zoom()}</span></div>
        <div class="shortcut-row"><kbd>Drag</kbd><span>{m.shortcuts_pan()}</span></div>
        <div class="shortcut-row"><kbd>Space+Drag</kbd><span>{m.shortcuts_space_drag()}</span></div>
        <div class="shortcut-row"><kbd>Arrow</kbd><span>{m.shortcuts_arrow_pan()}</span></div>
      </div>

      <div class="shortcuts-group">
        <div class="shortcuts-group-title">{m.shortcuts_selection()}</div>
        <div class="shortcut-row"><kbd>{mod}+Click</kbd><span>{m.shortcuts_multi_select()}</span></div>
      </div>

      <div class="shortcuts-group">
        <div class="shortcuts-group-title">{m.shortcuts_editing()}</div>
        <div class="shortcut-row"><kbd>Double-click header</kbd><span>{m.shortcuts_rename_table()}</span></div>
        <div class="shortcut-row"><kbd>Double-click column</kbd><span>{m.shortcuts_edit_column()}</span></div>
      </div>

      <div class="shortcuts-links">
        <a class="shortcuts-link" href="https://github.com/dornol/erdmini/issues" target="_blank" rel="noopener noreferrer">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
            <line x1="8" y1="4.5" x2="8" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <circle cx="8" cy="11" r="0.8" fill="currentColor"/>
          </svg>
          {m.toolbar_bug_report()}
        </a>
        <a class="shortcuts-link" href="https://github.com/dornol/erdmini" target="_blank" rel="noopener noreferrer">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          GitHub
        </a>
      </div>
    </div>
  {/if}
</div>
