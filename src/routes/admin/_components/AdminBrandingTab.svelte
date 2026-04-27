<script lang="ts">
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages';

  interface SiteSettings {
    site_name: string;
    login_message: string;
    logo_url: string;
    default_can_create_project: string;
    default_can_create_api_key: string;
    default_can_create_embed: string;
  }

  let settings = $state<SiteSettings>({ site_name: 'erdmini', login_message: '', logo_url: '', default_can_create_project: '1', default_can_create_api_key: '1', default_can_create_embed: '1' });
  let saving = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  onMount(async () => {
    const res = await fetch('/api/admin/site-settings');
    if (res.ok) settings = await res.json();
  });

  async function save() {
    saving = true;
    message = null;
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        settings = await res.json();
        message = { type: 'success', text: m.admin_branding_saved() };
      } else {
        const body = await res.json();
        message = { type: 'error', text: body.error || m.admin_branding_save_failed() };
      }
    } catch {
      message = { type: 'error', text: m.admin_branding_network_error() };
    } finally {
      saving = false;
    }
  }
</script>

<div class="section">
  <h2>{m.admin_branding_title()}</h2>
  <p class="section-desc">{m.admin_branding_desc()}</p>

  <div class="form-section">
    <h3>{m.admin_branding_site_name()}</h3>
    <p class="field-desc">{m.admin_branding_site_name_desc()}</p>
    <input
      type="text"
      class="inline-input full-width"
      bind:value={settings.site_name}
      placeholder="erdmini"
      maxlength="50"
    />
  </div>

  <div class="form-section">
    <h3>{m.admin_branding_logo_url()}</h3>
    <p class="field-desc">{m.admin_branding_logo_desc()}</p>
    <input
      type="text"
      class="inline-input full-width"
      bind:value={settings.logo_url}
      placeholder="https://example.com/logo.png"
    />
    {#if settings.logo_url}
      <div class="logo-preview">
        <img src={settings.logo_url} alt={m.admin_branding_logo_preview()} class="preview-img" />
      </div>
    {/if}
  </div>

  <div class="form-section">
    <h3>{m.admin_branding_login_message()}</h3>
    <p class="field-desc">{m.admin_branding_login_desc()}</p>
    <textarea
      class="inline-input full-width"
      bind:value={settings.login_message}
      placeholder={m.admin_branding_login_placeholder()}
      rows="3"
      maxlength="200"
    ></textarea>
  </div>

  <div class="form-section">
    <h3>{m.admin_branding_default_perms()}</h3>
    <p class="field-desc">{m.admin_branding_default_perms_desc()}</p>
    <div class="perm-defaults">
      <label class="perm-default-item">
        <input type="checkbox" checked={settings.default_can_create_project === '1'} onchange={(e: Event) => { settings.default_can_create_project = (e.target as HTMLInputElement).checked ? '1' : '0'; }} />
        <span>{m.admin_branding_perm_project()}</span>
      </label>
      <label class="perm-default-item">
        <input type="checkbox" checked={settings.default_can_create_api_key === '1'} onchange={(e: Event) => { settings.default_can_create_api_key = (e.target as HTMLInputElement).checked ? '1' : '0'; }} />
        <span>{m.admin_branding_perm_api_key()}</span>
      </label>
      <label class="perm-default-item">
        <input type="checkbox" checked={settings.default_can_create_embed === '1'} onchange={(e: Event) => { settings.default_can_create_embed = (e.target as HTMLInputElement).checked ? '1' : '0'; }} />
        <span>{m.admin_branding_perm_embed()}</span>
      </label>
    </div>
  </div>

  <div class="save-row">
    <button class="btn-primary" onclick={save} disabled={saving}>
      {saving ? m.admin_branding_saving() : m.action_save()}
    </button>
    {#if message}
      <span class={message.type === 'success' ? 'msg-success' : 'msg-error'}>{message.text}</span>
    {/if}
  </div>
</div>

<style>
  .field-desc {
    font-size: 12px;
    color: var(--app-text-muted);
    margin: 0 0 8px;
  }

  .full-width {
    width: 100%;
    box-sizing: border-box;
  }

  textarea.inline-input {
    resize: vertical;
    font-family: inherit;
  }

  .logo-preview {
    margin-top: 10px;
    padding: 12px;
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 6px;
    display: inline-block;
  }

  .preview-img {
    max-width: 120px;
    max-height: 60px;
    object-fit: contain;
  }

  .perm-defaults {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .perm-default-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--app-text-secondary);
    cursor: pointer;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
  }
</style>
