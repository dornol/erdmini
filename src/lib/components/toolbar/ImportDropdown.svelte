<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { now } from '$lib/utils/common';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
    onopenddl: () => void;
  }

  let { open, ontoggle, onclose, onopenddl }: Props = $props();

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const schema = JSON.parse(reader.result as string);
          if (!schema.tables) schema.tables = [];
          if (!schema.domains) schema.domains = [];

          if (erdStore.schema.tables.length === 0) {
            erdStore.loadSchema(schema);
            return;
          }

          const mode = await dialogStore.choice(
            m.import_merge_or_replace_message(),
            {
              title: m.import_merge_or_replace_title(),
              choices: [
                { key: 'merge', label: m.import_merge(), variant: 'primary' },
                { key: 'replace', label: m.import_replace(), variant: 'danger' },
              ],
            },
          );
          if (mode === null) return;

          if (mode === 'replace') {
            erdStore.loadSchema(schema);
            return;
          }

          // --- Merge mode ---
          const nameToExistingId = new Map<string, string>();
          for (const t of erdStore.schema.tables) {
            nameToExistingId.set(t.name, t.id);
          }

          const duplicateNames = schema.tables
            .filter((t: { name: string }) => nameToExistingId.has(t.name))
            .map((t: { name: string }) => t.name);

          let action: string | null = null;
          if (duplicateNames.length > 0) {
            action = await dialogStore.choice(
              m.import_duplicate_message({ count: duplicateNames.length, names: duplicateNames.join(', ') }),
              {
                title: m.import_duplicate_title(),
                choices: [
                  { key: 'overwrite', label: m.import_overwrite(), variant: 'danger' },
                  { key: 'skip', label: m.import_skip(), variant: 'default' },
                ],
              },
            );
            if (action === null) return;
          }

          const duplicateSet = new Set(duplicateNames);
          const nameToNewId = new Map<string, string>();
          for (const t of schema.tables) {
            nameToNewId.set(t.name, t.id);
          }

          if (action === 'overwrite') {
            const oldIdsToRemove = new Set(
              duplicateNames.map((n: string) => nameToExistingId.get(n)!),
            );
            const oldToNewId = new Map<string, string>();
            for (const name of duplicateNames) {
              oldToNewId.set(nameToExistingId.get(name)!, nameToNewId.get(name)!);
            }

            erdStore.schema.tables = erdStore.schema.tables
              .filter((t) => !oldIdsToRemove.has(t.id))
              .map((t) => ({
                ...t,
                foreignKeys: t.foreignKeys.map((fk) =>
                  oldToNewId.has(fk.referencedTableId)
                    ? { ...fk, referencedTableId: oldToNewId.get(fk.referencedTableId)! }
                    : fk,
                ),
              }));

            for (const t of schema.tables) {
              erdStore.schema.tables = [...erdStore.schema.tables, t];
            }
          } else if (action === 'skip') {
            for (const t of schema.tables) {
              if (duplicateSet.has(t.name)) continue;
              t.foreignKeys = (t.foreignKeys ?? []).map((fk: { referencedTableId: string }) => {
                for (const [name, newId] of nameToNewId) {
                  if (fk.referencedTableId === newId && duplicateSet.has(name)) {
                    return { ...fk, referencedTableId: nameToExistingId.get(name)! };
                  }
                }
                return fk;
              });
              erdStore.schema.tables = [...erdStore.schema.tables, t];
            }
          } else {
            for (const t of schema.tables) {
              erdStore.schema.tables = [...erdStore.schema.tables, t];
            }
          }

          // Merge domains by name
          const existingDomainNames = new Set(erdStore.schema.domains.map((d) => d.name));
          if (action === 'overwrite') {
            const newDomainMap = new Map((schema.domains as import('$lib/types/erd').ColumnDomain[]).map((d) => [d.name, d]));
            erdStore.schema.domains = erdStore.schema.domains.map((d) =>
              newDomainMap.has(d.name) ? newDomainMap.get(d.name)! : d,
            );
            for (const d of schema.domains) {
              if (!existingDomainNames.has(d.name)) {
                erdStore.schema.domains = [...erdStore.schema.domains, d];
              }
            }
          } else {
            for (const d of schema.domains) {
              if (!existingDomainNames.has(d.name)) {
                erdStore.schema.domains = [...erdStore.schema.domains, d];
              }
            }
          }

          erdStore.schema.updatedAt = now();
        } catch {
          dialogStore.alert(m.json_parse_error(), {
            title: m.json_import_failed(),
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const result = await projectStore.importAll(reader.result as string);
        if (result.ok) {
          dialogStore.alert(m.backup_restore_success());
        } else {
          dialogStore.alert(result.error ?? '', { title: m.backup_restore_failed() });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
</script>

<div class="dropdown-wrap">
  <button
    class="btn-secondary"
    onclick={ontoggle}
    aria-expanded={open}
    aria-haspopup="menu"
  >
    {m.toolbar_import()} ▾
  </button>
  {#if open}
    <div
      class="dropdown-menu"
      role="menu"
      tabindex="-1"
      onmouseleave={onclose}
    >
      <button class="dropdown-item" role="menuitem" onclick={() => { onopenddl(); onclose(); }}>
        DDL
      </button>
      <button class="dropdown-item" role="menuitem" onclick={() => { importJson(); onclose(); }}>
        JSON
      </button>
      <div class="dropdown-sep"></div>
      <button class="dropdown-item" role="menuitem" onclick={() => { importBackup(); onclose(); }}>
        {m.toolbar_restore_all()}
      </button>
    </div>
  {/if}
</div>
