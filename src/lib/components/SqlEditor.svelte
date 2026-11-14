<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import { themeStore } from '$lib/store/theme.svelte';

  interface Props {
    value: string;
    onchange?: (value: string) => void;
    readonly?: boolean;
    height?: string;
    extraKeys?: { key: string; run: () => boolean }[];
  }

  let { value, onchange, readonly = false, height = '300px', extraKeys = [] }: Props = $props();

  let containerEl: HTMLDivElement;
  let editorView = $state<any>(null);
  let suppressUpdate = false;

  // Build schema map from current ERD for SQL autocompletion
  function buildSchemaMap(): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const table of erdStore.schema.tables) {
      map[table.name] = table.columns.map((c) => c.name);
    }
    return map;
  }

  // Cached module references (loaded once)
  let cmModules: { EditorView: any; EditorState: any; basicSetup: any; sql: any; oneDark: any; keymap: any; indentWithTab: any; Compartment: any } | null = null;

  let readonlyCompartment: any;

  function readonlyExtensions() {
    if (!cmModules) return [];
    return [
      cmModules.EditorView.editable.of(!readonly),
      cmModules.EditorState.readOnly.of(readonly),
      ...(readonly ? [cmModules.EditorView.contentAttributes.of({ tabindex: '0' })] : []),
    ];
  }

  function createEditor(dark: boolean) {
    if (!cmModules || !containerEl) return;
    const { EditorView, basicSetup, sql, oneDark, keymap, indentWithTab } = cmModules;

    // Preserve current content if rebuilding
    const currentDoc = editorView ? editorView.state.doc.toString() : value;
    editorView?.destroy();

    readonlyCompartment = new cmModules.Compartment();
    const extensions: any[] = [
      readonlyCompartment.of(readonlyExtensions()),
      keymap.of([
        ...extraKeys.map(k => ({ key: k.key, run: () => !readonly && k.run() })),
        indentWithTab,
      ]),
      basicSetup,
      sql({ schema: buildSchemaMap() }),
      ...(dark ? [oneDark] : []),
      EditorView.theme({
        '&': { height, fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
      }),
    ];

    if (onchange) {
      extensions.push(
        EditorView.updateListener.of((update: any) => {
          if (update.docChanged && !suppressUpdate && !readonly) {
            onchange!(update.state.doc.toString());
          }
        }),
      );
    }

    editorView = new EditorView({
      doc: currentDoc,
      extensions,
      parent: containerEl,
    });
  }

  onMount(async () => {
    const [cm, langSql, themeMod, cmView, cmCmds, cmState] = await Promise.all([
      import('codemirror'),
      import('@codemirror/lang-sql'),
      import('@codemirror/theme-one-dark'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/state'),
    ]);
    cmModules = {
      EditorView: cm.EditorView,
      EditorState: cmState.EditorState,
      Compartment: cmState.Compartment,
      basicSetup: cm.basicSetup,
      sql: langSql.sql,
      oneDark: themeMod.oneDark,
      keymap: cmView.keymap,
      indentWithTab: cmCmds.indentWithTab,
    };
    createEditor(themeStore.darkMode);
  });

  onDestroy(() => {
    editorView?.destroy();
  });

  // Rebuild editor when theme changes
  let prevDark = themeStore.darkMode;
  $effect(() => {
    const dark = themeStore.darkMode;
    if (cmModules && dark !== prevDark) {
      prevDark = dark;
      createEditor(dark);
    }
  });

  // Update permissions in place, preserving selection, focus and undo history.
  $effect(() => {
    const extensions = readonlyExtensions();
    if (editorView && readonlyCompartment) {
      editorView.dispatch({ effects: readonlyCompartment.reconfigure(extensions) });
    }
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

  .sql-editor :global(.cm-editor.cm-focused) {
    outline: none;
  }
</style>
