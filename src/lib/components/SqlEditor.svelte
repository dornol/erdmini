<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { erdStore } from '$lib/store/erd.svelte';

  interface Props {
    value: string;
    onchange?: (value: string) => void;
    readonly?: boolean;
    height?: string;
    extraKeys?: { key: string; run: () => boolean }[];
  }

  let { value, onchange, readonly = false, height = '300px', extraKeys = [] }: Props = $props();

  let containerEl: HTMLDivElement;
  let editorView: any = null;
  let suppressUpdate = false;

  // Build schema map from current ERD for SQL autocompletion
  function buildSchemaMap(): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const table of erdStore.schema.tables) {
      map[table.name] = table.columns.map((c) => c.name);
    }
    return map;
  }

  onMount(async () => {
    const [cm, langSql, themeMod, cmView, cmCommands] = await Promise.all([
      import('codemirror'),
      import('@codemirror/lang-sql'),
      import('@codemirror/theme-one-dark'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
    ]);

    const { EditorView, basicSetup } = cm;
    const { sql } = langSql;
    const { oneDark } = themeMod;
    const { keymap } = cmView;
    const { indentWithTab } = cmCommands;

    const extensions: any[] = [
      keymap.of([
        ...extraKeys.map(k => ({ key: k.key, run: () => k.run() })),
        indentWithTab,
      ]),
      basicSetup,
      sql({ schema: buildSchemaMap() }),
      oneDark,
      EditorView.theme({
        '&': { height, fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
      }),
    ];

    if (readonly) {
      extensions.push(EditorView.editable.of(false));
    }

    if (onchange) {
      extensions.push(
        EditorView.updateListener.of((update: any) => {
          if (update.docChanged && !suppressUpdate) {
            onchange!(update.state.doc.toString());
          }
        }),
      );
    }

    editorView = new EditorView({
      doc: value,
      extensions,
      parent: containerEl,
    });
  });

  onDestroy(() => {
    editorView?.destroy();
  });

  // Sync external value changes into the editor
  $effect(() => {
    if (editorView && value !== editorView.state.doc.toString()) {
      suppressUpdate = true;
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: value },
      });
      suppressUpdate = false;
    }
  });
</script>

<div class="sql-editor" bind:this={containerEl}></div>

<style>
  .sql-editor {
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 6px;
    overflow: hidden;
  }

  .sql-editor :global(.cm-editor) {
    background: #1e293b;
  }

  .sql-editor :global(.cm-editor.cm-focused) {
    outline: none;
  }

  .sql-editor :global(.cm-gutters) {
    background: #1e293b;
    border-right: 1px solid #334155;
  }
</style>
