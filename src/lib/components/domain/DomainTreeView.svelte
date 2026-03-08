<script lang="ts">
  import type { ColumnDomain } from '$lib/types/erd';
  import type { DomainTreeNode } from '$lib/utils/domain-hierarchy';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    domainTree: DomainTreeNode[];
    domainUsageMap: Map<string, number>;
    expandedId: string | null;
    onToggleExpanded: (id: string) => void;
    onRowClick: (domain: ColumnDomain) => void;
  }

  let {
    domainTree,
    domainUsageMap,
    expandedId,
    onToggleExpanded,
    onRowClick,
  }: Props = $props();

  // Collapsed tree nodes
  let collapsedNodes = $state(new Set<string>());

  function toggleNode(id: string) {
    const next = new Set(collapsedNodes);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    collapsedNodes = next;
  }

  function hasDocs(d: ColumnDomain): boolean {
    return !!(d.description || d.alias || d.dataStandard || d.example || d.validRange || d.owner || (d.tags && d.tags.length > 0));
  }
</script>

<div class="tree-container thin-scrollbar">
  {#if domainTree.length === 0}
    <div class="tree-empty">{m.domain_empty()}</div>
  {:else}
    {#snippet treeNodes(nodes: DomainTreeNode[])}
      {#each nodes as node (node.domain.id)}
        {@const usageCount = domainUsageMap.get(node.domain.id) ?? 0}
        {@const hasChildren = node.children.length > 0}
        {@const isCollapsed = collapsedNodes.has(node.domain.id)}
        <div class="tree-node" style="padding-left: {node.depth * 20}px">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="tree-row" class:unused={usageCount === 0} onclick={() => onRowClick(node.domain)}>
            {#if hasChildren}
              <button class="tree-toggle" onclick={(e) => { e.stopPropagation(); toggleNode(node.domain.id); }}>
                {isCollapsed ? '▶' : '▼'}
              </button>
            {:else}
              <span class="tree-toggle-placeholder"></span>
            {/if}
            <span class="tree-name">{node.domain.name}</span>
            <span class="tree-type">{node.domain.type}{node.domain.length ? `(${node.domain.length})` : ''}</span>
            {#if usageCount > 0}
              <span class="tree-usage-badge">{m.domain_usage_count({ count: String(usageCount) })}</span>
            {:else}
              <span class="tree-usage-badge tree-unused-badge">{m.domain_unused()}</span>
            {/if}
            {#if hasDocs(node.domain)}
              <button class="tree-doc-icon" title={m.domain_has_docs()} onclick={(e) => { e.stopPropagation(); onToggleExpanded(node.domain.id); }}>&#x1F4CB;</button>
            {/if}
            {#if node.domain.group}
              <span class="tree-group-tag">{node.domain.group}</span>
            {/if}
          </div>
          {#if expandedId === node.domain.id}
            <div class="tree-detail" style="margin-left: {node.depth * 20 + 20}px">
              <div class="tree-detail-grid">
                {#if node.domain.description}
                  <div class="tree-detail-field">
                    <span class="tree-detail-label">{m.domain_description()}</span>
                    <span class="tree-detail-value">{node.domain.description}</span>
                  </div>
                {/if}
                {#if node.domain.alias}
                  <div class="tree-detail-field">
                    <span class="tree-detail-label">{m.domain_alias()}</span>
                    <span class="tree-detail-value">{node.domain.alias}</span>
                  </div>
                {/if}
                {#if node.domain.dataStandard}
                  <div class="tree-detail-field">
                    <span class="tree-detail-label">{m.domain_data_standard()}</span>
                    <span class="tree-detail-value">{node.domain.dataStandard}</span>
                  </div>
                {/if}
                {#if node.domain.example}
                  <div class="tree-detail-field">
                    <span class="tree-detail-label">{m.domain_example()}</span>
                    <span class="tree-detail-value">{node.domain.example}</span>
                  </div>
                {/if}
                {#if node.domain.validRange}
                  <div class="tree-detail-field">
                    <span class="tree-detail-label">{m.domain_valid_range()}</span>
                    <span class="tree-detail-value">{node.domain.validRange}</span>
                  </div>
                {/if}
                {#if node.domain.owner}
                  <div class="tree-detail-field">
                    <span class="tree-detail-label">{m.domain_owner()}</span>
                    <span class="tree-detail-value">{node.domain.owner}</span>
                  </div>
                {/if}
                {#if node.domain.tags && node.domain.tags.length > 0}
                  <div class="tree-detail-field">
                    <span class="tree-detail-label">{m.domain_tags()}</span>
                    <span class="tree-detail-value">{node.domain.tags.join(', ')}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
          {#if hasChildren && !isCollapsed}
            {@render treeNodes(node.children)}
          {/if}
        </div>
      {/each}
    {/snippet}
    {@render treeNodes(domainTree)}
  {/if}
</div>

<style>
  .tree-container {
    overflow-y: auto;
    padding: 8px 0;
  }

  .tree-empty {
    text-align: center;
    padding: 20px;
    color: #94a3b8;
    font-size: 12px;
    font-style: italic;
  }

  .tree-node {
    position: relative;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.1s;
  }

  .tree-row:hover {
    background: #f1f5f9;
  }

  .tree-row.unused {
    opacity: 0.55;
  }

  .tree-row.unused:hover {
    opacity: 0.85;
  }

  .tree-toggle {
    background: none;
    border: none;
    font-size: 9px;
    color: #94a3b8;
    cursor: pointer;
    padding: 0;
    width: 14px;
    flex-shrink: 0;
    text-align: center;
  }

  .tree-toggle:hover {
    color: #64748b;
  }

  .tree-toggle-placeholder {
    width: 14px;
    flex-shrink: 0;
  }

  .tree-name {
    font-weight: 600;
    color: #1e293b;
    white-space: nowrap;
  }

  .tree-type {
    font-family: monospace;
    color: #64748b;
    font-size: 11px;
    white-space: nowrap;
  }

  .tree-usage-badge {
    font-size: 9px;
    font-weight: 500;
    padding: 0 4px;
    border-radius: 3px;
    background: #dbeafe;
    color: #1d4ed8;
    white-space: nowrap;
  }

  .tree-unused-badge {
    background: #f1f5f9;
    color: #94a3b8;
  }

  .tree-doc-icon {
    background: none;
    border: none;
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
    opacity: 0.6;
    line-height: 1;
  }

  .tree-doc-icon:hover {
    opacity: 1;
  }

  .tree-group-tag {
    font-size: 9px;
    padding: 0 4px;
    border-radius: 3px;
    background: #f1f5f9;
    color: #94a3b8;
    white-space: nowrap;
    margin-left: auto;
  }

  .tree-detail {
    padding: 8px 10px;
    margin-bottom: 4px;
    background: #f8fafc;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }

  .tree-detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 16px;
  }

  .tree-detail-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tree-detail-label {
    font-size: 10px;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .tree-detail-value {
    font-size: 12px;
    color: #475569;
    word-break: break-word;
  }
</style>
