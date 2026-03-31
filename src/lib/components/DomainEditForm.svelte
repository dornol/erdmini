<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { COLUMN_TYPES } from '$lib/types/erd';
  import type { ColumnDomain, ColumnType } from '$lib/types/erd';
  import { computeImpact } from '$lib/utils/domain-analysis';
  import { getDescendantIds } from '$lib/utils/domain-hierarchy';
  import SearchableSelect from './SearchableSelect.svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    editingId: string | null;
    addingNew: boolean;
    existingGroups: string[];
    tableColspan: number;
    onreset: () => void;
  }

  let { editingId, addingNew, existingGroups, tableColspan, onreset }: Props = $props();

  // Form fields
  let formName = $state('');
  let formGroup = $state('');
  let formType = $state<ColumnType>('VARCHAR');
  let formLength = $state<number | undefined>(255);
  let formNullable = $state(false);
  let formPrimaryKey = $state(false);
  let formUnique = $state(false);
  let formAutoIncrement = $state(false);
  let formScale = $state<number | undefined>(undefined);
  let formCheck = $state('');
  let formEnumValues = $state('');
  let formDefaultValue = $state('');
  let formComment = $state('');
  let formParentId = $state<string | undefined>(undefined);

  // Documentation fields
  let formDescription = $state('');
  let formAlias = $state('');
  let formDataStandard = $state('');
  let formExample = $state('');
  let formValidRange = $state('');
  let formOwner = $state('');
  let formTags = $state('');

  let hasLength = $derived(
    formType === 'VARCHAR' || formType === 'CHAR' || formType === 'DECIMAL',
  );
  let hasScale = $derived(formType === 'DECIMAL');
  let hasEnum = $derived(formType === 'ENUM');

  export function resetForm() {
    formName = '';
    formGroup = '';
    formType = 'VARCHAR';
    formLength = 255;
    formScale = undefined;
    formCheck = '';
    formEnumValues = '';
    formNullable = false;
    formPrimaryKey = false;
    formUnique = false;
    formAutoIncrement = false;
    formDefaultValue = '';
    formComment = '';
    formDescription = '';
    formAlias = '';
    formDataStandard = '';
    formExample = '';
    formValidRange = '';
    formOwner = '';
    formTags = '';
    formParentId = undefined;
  }

  export function loadDomain(domain: ColumnDomain) {
    formName = domain.name;
    formGroup = domain.group ?? '';
    formType = domain.type;
    formLength = domain.length;
    formScale = domain.scale;
    formCheck = domain.check ?? '';
    formEnumValues = domain.enumValues?.join(', ') ?? '';
    formNullable = domain.nullable;
    formPrimaryKey = domain.primaryKey;
    formUnique = domain.unique;
    formAutoIncrement = domain.autoIncrement;
    formDefaultValue = domain.defaultValue ?? '';
    formComment = domain.comment ?? '';
    formDescription = domain.description ?? '';
    formAlias = domain.alias ?? '';
    formDataStandard = domain.dataStandard ?? '';
    formExample = domain.example ?? '';
    formValidRange = domain.validRange ?? '';
    formOwner = domain.owner ?? '';
    formTags = domain.tags?.join(', ') ?? '';
    formParentId = domain.parentId;
  }

  function parseEnumValues(raw: string): string[] | undefined {
    const vals = raw.split(',').map(v => v.trim()).filter(Boolean);
    return vals.length > 0 ? vals : undefined;
  }

  function parseTags(raw: string): string[] | undefined {
    const vals = raw.split(',').map(v => v.trim()).filter(Boolean);
    return vals.length > 0 ? vals : undefined;
  }

  export async function saveEdit() {
    if (!formName.trim() || permissionStore.isReadOnly) return;
    const fields = {
      name: formName.trim(),
      group: formGroup.trim() || undefined,
      type: formType,
      length: hasLength ? formLength : undefined,
      scale: hasScale ? formScale : undefined,
      check: formCheck.trim() || undefined,
      enumValues: hasEnum ? parseEnumValues(formEnumValues) : undefined,
      nullable: formNullable,
      primaryKey: formPrimaryKey,
      unique: formUnique,
      autoIncrement: formAutoIncrement,
      defaultValue: formDefaultValue || undefined,
      comment: formComment || undefined,
      description: formDescription.trim() || undefined,
      alias: formAlias.trim() || undefined,
      dataStandard: formDataStandard.trim() || undefined,
      example: formExample.trim() || undefined,
      validRange: formValidRange.trim() || undefined,
      owner: formOwner.trim() || undefined,
      tags: parseTags(formTags),
      parentId: formParentId || undefined,
    };
    if (editingId) {
      const impact = computeImpact(erdStore.schema, editingId, fields);
      if (impact) {
        const details = impact.entries.slice(0, 10).map(e => {
          const changeStr = e.changes.map(c => `${c.field}: ${c.before} → ${c.after}`).join(', ');
          return `• ${e.tableName}.${e.columnName}: ${changeStr}`;
        }).join('\n');
        const extra = impact.entries.length > 10 ? `\n... and ${impact.entries.length - 10} more` : '';
        const msg = m.domain_impact_message({
          columns: String(impact.columnCount),
          tables: String(impact.tableCount),
        }) + '\n\n' + details + extra;
        const ok = await dialogStore.confirm(msg, {
          title: m.domain_impact_title(),
          confirmText: m.domain_impact_confirm(),
        });
        if (!ok) return;
      }
      erdStore.updateDomain(editingId, fields);
    } else if (addingNew) {
      erdStore.addDomain(fields);
    }
    resetForm();
    onreset();
  }

  function cancelEdit() {
    resetForm();
    onreset();
  }

  function handleRowKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  function getAvailableParents(selfId: string | null): { value: string; label: string }[] {
    const excluded = new Set<string>();
    if (selfId) {
      excluded.add(selfId);
      for (const id of getDescendantIds(selfId, erdStore.schema.domains)) {
        excluded.add(id);
      }
    }
    return erdStore.schema.domains
      .filter(d => !excluded.has(d.id))
      .map(d => ({ value: d.id, label: d.name }));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<tr class="editing-row" class:add-row={addingNew} onkeydown={handleRowKeydown}>
  <td>
    <input class="cell-input cell-group" type="text" bind:value={formGroup} placeholder={m.domain_group_placeholder()} list="domain-groups-list" />
  </td>
  <td><input class="cell-input" type="text" bind:value={formName} placeholder={m.domain_name_placeholder()} /></td>
  <td class="td-type-cell">
    <SearchableSelect
      options={COLUMN_TYPES.map((t) => ({ value: t, label: t }))}
      value={formType}
      onchange={(v) => (formType = v as ColumnType)}
      size="sm"
    />
  </td>
  <td>
    {#if hasLength}
      <input class="cell-input cell-num" type="number" bind:value={formLength} min="1" max="65535" />
    {:else}
      <span class="td-mono">&mdash;</span>
    {/if}
  </td>
  <td class="td-check"><input type="checkbox" bind:checked={formNullable} /></td>
  <td class="td-check"><input type="checkbox" bind:checked={formPrimaryKey} /></td>
  <td class="td-check"><input type="checkbox" bind:checked={formUnique} /></td>
  <td class="td-check"><input type="checkbox" bind:checked={formAutoIncrement} /></td>
  <td><input class="cell-input" type="text" bind:value={formDefaultValue} placeholder={m.optional()} /></td>
  <td>
    {#if hasScale}
      <input class="cell-input cell-num" type="number" bind:value={formScale} min="0" max="30" />
    {:else}
      <span class="td-mono">&mdash;</span>
    {/if}
  </td>
  <td><input class="cell-input" type="text" bind:value={formCheck} placeholder={m.column_check_placeholder()} /></td>
  <td>
    {#if hasEnum}
      <input class="cell-input" type="text" bind:value={formEnumValues} placeholder="a, b, c" />
    {:else}
      <span class="td-mono">&mdash;</span>
    {/if}
  </td>
  <td><input class="cell-input" type="text" bind:value={formComment} placeholder={m.optional()} /></td>
  <td class="td-actions">
    <button class="icon-btn save" onclick={saveEdit} disabled={!formName.trim()}>&#x2713;</button>
    <button class="icon-btn" onclick={cancelEdit}>&#x2715;</button>
  </td>
</tr>
<tr class="editing-row detail-edit-row" class:add-row={addingNew}>
  <td colspan={tableColspan}>
    <div class="detail-grid editing">
      <div class="detail-field">
        <label>{m.domain_parent()}
          <select class="cell-input" bind:value={formParentId}>
            <option value={undefined}>{m.domain_parent_none()}</option>
            {#each getAvailableParents(editingId) as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="detail-field wide">
        <label>{m.domain_description()}
          <textarea class="cell-input cell-textarea" bind:value={formDescription} placeholder={m.domain_description_placeholder()} rows="2"></textarea>
        </label>
      </div>
      <div class="detail-field">
        <label>{m.domain_alias()}
          <input class="cell-input" type="text" bind:value={formAlias} placeholder={m.domain_alias_placeholder()} />
        </label>
      </div>
      <div class="detail-field">
        <label>{m.domain_data_standard()}
          <input class="cell-input" type="text" bind:value={formDataStandard} placeholder={m.domain_data_standard_placeholder()} />
        </label>
      </div>
      <div class="detail-field">
        <label>{m.domain_example()}
          <input class="cell-input" type="text" bind:value={formExample} placeholder={m.domain_example_placeholder()} />
        </label>
      </div>
      <div class="detail-field">
        <label>{m.domain_valid_range()}
          <input class="cell-input" type="text" bind:value={formValidRange} placeholder={m.domain_valid_range_placeholder()} />
        </label>
      </div>
      <div class="detail-field">
        <label>{m.domain_owner()}
          <input class="cell-input" type="text" bind:value={formOwner} placeholder={m.domain_owner_placeholder()} />
        </label>
      </div>
      <div class="detail-field">
        <label>{m.domain_tags()}
          <input class="cell-input" type="text" bind:value={formTags} placeholder={m.domain_tags_placeholder()} />
        </label>
      </div>
    </div>
  </td>
</tr>

<datalist id="domain-groups-list">
  {#each existingGroups as g}
    <option value={g}></option>
  {/each}
</datalist>
