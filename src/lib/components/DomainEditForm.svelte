<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { COLUMN_TYPES, getColumnTypesForDialect } from '$lib/types/erd';
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
<div class="edit-card" onkeydown={handleRowKeydown}>
  <div class="edit-card-row">
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.domain_name_placeholder()}</span>
      <input class="edit-input" type="text" bind:value={formName} placeholder={m.domain_name_placeholder()} />
    </label>
    <label class="edit-field">
      <span class="edit-label">{m.domain_group()}</span>
      <input class="edit-input" type="text" bind:value={formGroup} placeholder={m.domain_group_placeholder()} list="domain-groups-list" />
    </label>
    <label class="edit-field">
      <span class="edit-label">{m.column_type()}</span>
      <SearchableSelect
        options={(() => { const types = getColumnTypesForDialect(erdStore.schema.dialect); return (formType && !types.includes(formType) ? [formType, ...types] : types).map((t) => ({ value: t, label: t })); })()}
        value={formType}
        onchange={(v) => (formType = v as ColumnType)}
        size="sm"
      />
    </label>
    {#if hasLength}
      <label class="edit-field edit-field-sm">
        <span class="edit-label">{m.column_length()}</span>
        <input class="edit-input edit-num" type="number" bind:value={formLength} min="1" max="65535" />
      </label>
    {/if}
    {#if hasScale}
      <label class="edit-field edit-field-sm">
        <span class="edit-label">Scale</span>
        <input class="edit-input edit-num" type="number" bind:value={formScale} min="0" max="30" />
      </label>
    {/if}
  </div>
  <div class="edit-card-row">
    <label class="edit-flag"><input type="checkbox" bind:checked={formNullable} /> NULL</label>
    <label class="edit-flag"><input type="checkbox" bind:checked={formPrimaryKey} /> PK</label>
    <label class="edit-flag"><input type="checkbox" bind:checked={formUnique} /> UQ</label>
    <label class="edit-flag"><input type="checkbox" bind:checked={formAutoIncrement} /> AI</label>
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.column_default()}</span>
      <input class="edit-input" type="text" bind:value={formDefaultValue} placeholder={m.optional()} />
    </label>
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.column_check()}</span>
      <input class="edit-input" type="text" bind:value={formCheck} placeholder={m.column_check_placeholder()} />
    </label>
  </div>
  {#if hasEnum}
    <div class="edit-card-row">
      <label class="edit-field edit-field-grow">
        <span class="edit-label">{m.label_enum()}</span>
        <input class="edit-input" type="text" bind:value={formEnumValues} placeholder="a, b, c" />
      </label>
    </div>
  {/if}
  <div class="edit-card-row">
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.column_description()}</span>
      <input class="edit-input" type="text" bind:value={formComment} placeholder={m.optional()} />
    </label>
  </div>
  <!-- Documentation fields -->
  <div class="edit-card-row">
    <label class="edit-field">
      <span class="edit-label">{m.domain_parent()}</span>
      <select class="edit-input" bind:value={formParentId}>
        <option value={undefined}>{m.domain_parent_none()}</option>
        {#each getAvailableParents(editingId) as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </label>
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.domain_alias()}</span>
      <input class="edit-input" type="text" bind:value={formAlias} placeholder={m.domain_alias_placeholder()} />
    </label>
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.domain_data_standard()}</span>
      <input class="edit-input" type="text" bind:value={formDataStandard} placeholder={m.domain_data_standard_placeholder()} />
    </label>
  </div>
  <div class="edit-card-row">
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.domain_example()}</span>
      <input class="edit-input" type="text" bind:value={formExample} placeholder={m.domain_example_placeholder()} />
    </label>
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.domain_valid_range()}</span>
      <input class="edit-input" type="text" bind:value={formValidRange} placeholder={m.domain_valid_range_placeholder()} />
    </label>
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.domain_owner()}</span>
      <input class="edit-input" type="text" bind:value={formOwner} placeholder={m.domain_owner_placeholder()} />
    </label>
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.domain_tags()}</span>
      <input class="edit-input" type="text" bind:value={formTags} placeholder={m.domain_tags_placeholder()} />
    </label>
  </div>
  <div class="edit-card-row">
    <label class="edit-field edit-field-grow">
      <span class="edit-label">{m.domain_description()}</span>
      <textarea class="edit-input edit-textarea" bind:value={formDescription} placeholder={m.domain_description_placeholder()} rows="2"></textarea>
    </label>
    <div class="edit-card-actions">
      <button class="edit-btn-cancel" onclick={cancelEdit}>{m.action_cancel()}</button>
      <button class="edit-btn-save" onclick={saveEdit} disabled={!formName.trim()}>{m.action_save()}</button>
    </div>
  </div>
</div>

<datalist id="domain-groups-list">
  {#each existingGroups as g}
    <option value={g}></option>
  {/each}
</datalist>

<style>
  .edit-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    margin: 0 0 12px;
    background: #f0f7ff;
    border: 1px solid #93c5fd;
    border-radius: 10px;
  }

  .edit-card-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .edit-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 80px;
  }

  .edit-field-grow {
    flex: 1 1 120px;
  }

  .edit-field-sm {
    flex: 0 0 75px;
    min-width: 60px;
  }

  .edit-label {
    font-size: 10px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .edit-input {
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    font-size: 12px;
    color: #1e293b;
    background: white;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }

  .edit-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  .edit-num {
    width: 75px;
  }

  .edit-textarea {
    resize: vertical;
    min-height: 40px;
    font-family: inherit;
  }

  .edit-flag {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    background: white;
    white-space: nowrap;
    transition: all 0.12s;
  }

  .edit-flag:hover {
    border-color: #93c5fd;
    background: #eff6ff;
  }

  .edit-flag:has(input:checked) {
    border-color: #3b82f6;
    background: #dbeafe;
    color: #1d4ed8;
  }

  .edit-flag input {
    accent-color: #3b82f6;
  }

  .edit-card-actions {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    padding-bottom: 1px;
  }

  .edit-btn-save {
    padding: 7px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    background: #3b82f6;
    color: white;
    cursor: pointer;
    transition: background 0.12s;
  }

  .edit-btn-save:hover {
    background: #2563eb;
  }

  .edit-btn-save:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .edit-btn-cancel {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid #cbd5e1;
    background: white;
    color: #475569;
    cursor: pointer;
    transition: all 0.12s;
  }

  .edit-btn-cancel:hover {
    background: #f1f5f9;
  }
</style>
